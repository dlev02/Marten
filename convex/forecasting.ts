import { ConvexError, v } from "convex/values";
import { userQuery, userMutation, owned, text, date } from "./lib/access";
import { entries } from "./lib/finance";
import { forecastInputs } from "./lib/forecastValidators";
import { runForecast, type ForecastInputs } from "./lib/forecast";

export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("forecastScenarios")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(51);
    if (rows.length > 50) throw new ConvexError("Scenario limit exceeded.");
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const save = userMutation({
  args: {
    id: v.optional(v.id("forecastScenarios")),
    expectedRevision: v.optional(v.number()),
    name: v.string(),
    inputs: forecastInputs,
  },
  handler: async (ctx, args) => {
    const name = text(args.name, 80);
    try {
      runForecast(args.inputs);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Review forecast assumptions.",
      );
    }
    if (args.id) {
      const previous = await owned(ctx, args.id);
      if (previous.revision !== args.expectedRevision)
        throw new ConvexError(
          "This scenario changed elsewhere. Reload it before saving.",
        );
      const revision = previous.revision + 1;
      await ctx.db.patch(args.id, {
        name,
        inputs: args.inputs,
        revision,
        updatedAt: Date.now(),
      });
      return { _id: args.id, revision };
    }
    const rows = await ctx.db
      .query("forecastScenarios")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(50);
    if (rows.length === 50) throw new ConvexError("Save up to 50 scenarios.");
    const _id = await ctx.db.insert("forecastScenarios", {
      userId: ctx.userId,
      name,
      inputs: args.inputs,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { _id, revision: 1 };
  },
});

export const remove = userMutation({
  args: { id: v.id("forecastScenarios"), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const row = await owned(ctx, args.id);
    if (row.revision !== args.expectedRevision)
      throw new ConvexError(
        "This scenario changed elsewhere. Reload it before deleting.",
      );
    await ctx.db.delete(args.id);
    return null;
  },
});

/** A bounded observed baseline. It does not infer age, pension, tax, or missing months. */
export const baseline = userQuery({
  args: { asOfDate: v.string() },
  handler: async (ctx, { asOfDate }) => {
    date(asOfDate);
    const asOf = new Date(asOfDate + "T12:00:00Z");
    const from = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 12, 1),
    )
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0))
      .toISOString()
      .slice(0, 10);
    const [accounts, transactions, categories, groups] = await Promise.all([
      ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201),
      ctx.db
        .query("transactions")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", ctx.userId).gte("date", from).lte("date", to),
        )
        .take(12001),
      ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(501),
      ctx.db
        .query("groups")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201),
    ]);
    if (accounts.length > 200 || categories.length > 500 || groups.length > 200)
      throw new ConvexError(
        "The workspace exceeds the supported forecast baseline size.",
      );
    const complete = transactions.length <= 12000;
    const eligible = new Set(
      accounts
        .filter(
          (a) =>
            !a.hidden &&
            !a.closed &&
            a.currency === "USD" &&
            a.kind !== "investment" &&
            a.kind !== "asset",
        )
        .map((a) => a._id),
    );
    const groupKinds = new Map(groups.map((g) => [g._id, g.kind]));
    const categoryKinds = new Map(
      categories.map((c) => [c._id, groupKinds.get(c.groupId)]),
    );
    const activeMonths = new Set<string>();
    let incomeCents = 0,
      spendingCents = 0,
      countedEntries = 0;
    if (complete)
      for (const tx of transactions) {
        if (tx.removedFromBank || !eligible.has(tx.accountId)) continue;
        for (const entry of entries(tx)) {
          const kind = categoryKinds.get(entry.categoryId);
          if (kind !== "expense" && kind !== "income") continue;
          activeMonths.add(entry.date.slice(0, 7));
          countedEntries++;
          if (kind === "income") incomeCents -= entry.amountCents;
          else spendingCents += entry.amountCents;
        }
      }
    const accountRows = accounts.map((a) => {
      const excludedReason =
        a.currency !== "USD"
          ? "Non-USD account"
          : a.closed
            ? "Closed account"
            : a.hidden
              ? "Hidden account"
              : a.excludeNetWorth
                ? "Excluded from net worth"
                : a.kind === "asset"
                  ? "Illiquid asset"
                  : a.kind === "credit" || a.kind === "loan"
                    ? "Debt is not amortized by this model"
                    : a.balanceCents < 0
                      ? "Negative asset balance requires review"
                      : null;
      const bucket = excludedReason
        ? ("excluded" as const)
        : a.kind === "cash"
          ? ("cash" as const)
          : /(?:ira|401|403|457|pension|retirement|keogh|sep|simple)/i.test(
                a.subtype,
              )
            ? ("retirement" as const)
            : ("investment" as const);
      return {
        id: a._id,
        name: a.name,
        kind: a.kind,
        subtype: a.subtype,
        currency: a.currency,
        balanceCents: a.balanceCents,
        bucket,
        included: !excludedReason,
        excludedReason,
        updatedAt: a.updatedAt,
      };
    });
    const sum = (bucket: string) =>
      accountRows
        .filter((a) => a.bucket === bucket && a.currency === "USD")
        .reduce((total, a) => total + a.balanceCents, 0);
    const excludedDebtCents = accountRows
      .filter(
        (a) =>
          a.currency === "USD" && (a.kind === "credit" || a.kind === "loan"),
      )
      .reduce((total, a) => total + a.balanceCents, 0);
    const averagingMonths = activeMonths.size;
    const monthlyIncomeCents = Math.max(
        0,
        Math.round(incomeCents / Math.max(1, averagingMonths)),
      ),
      monthlySpendingCents = Math.max(
        0,
        Math.round(spendingCents / Math.max(1, averagingMonths)),
      );
    const inputs: ForecastInputs = {
      schemaVersion: 1,
      asOfDate,
      currentAge: 40,
      retirementAge: 65,
      endAge: 95,
      cashCents: sum("cash"),
      investmentCents: sum("investment"),
      retirementCents: sum("retirement"),
      retirementAccessAge: 59.5,
      monthlyIncomeCents,
      monthlySpendingCents,
      retirementMonthlyIncomeCents: 0,
      retirementMonthlySpendingCents: monthlySpendingCents,
      extraMonthlySavingsCents: 0,
      annualReturnPct: 5,
      inflationPct: 2.5,
      incomeGrowthPct: 2.5,
      legacyTargetCents: 0,
      travelPlans: [],
    };
    const warnings = [
      "Age, retirement, growth, and inflation are editable example assumptions. Retirement income starts at zero until you enter a pension or benefits estimate.",
      "Income is observed deposits after tax. Payroll retirement contributions are not inferred. Investment dividends and transfers are excluded to avoid counting modeled growth twice.",
      "Retirement balances are not tax-adjusted. Use an estimated spendable balance; withdrawal taxes, contribution limits, and early-access exceptions are not modeled.",
      "Travel is additional to baseline living spending. Remove existing travel from living spending before adding the same trips here.",
      "Monthly averages use only months containing included income or expense activity within the last 12 complete calendar months. Activity does not establish complete account coverage. Sparse imports, unusual expenses, and refunds can distort the estimate; review both amounts.",
    ];
    if (excludedDebtCents !== 0)
      warnings.push(
        "Existing debt is excluded from projected assets and is not paid off automatically. Include loan payments in spending when absent from expense history, and reserve assets for outstanding debt. Credit-card purchases are already spending; do not add their payments again.",
      );
    if (!complete)
      warnings.push(
        "More than 12,000 transactions fall in the baseline window. Income and spending estimates are unavailable; enter them manually.",
      );
    if (activeMonths.size < 12)
      warnings.push(
        `Only ${activeMonths.size} of 12 months contain included income or expense entries. This does not establish complete bank coverage.`,
      );
    return {
      inputs,
      accounts: accountRows,
      excludedDebtCents,
      excludedAssetCents: sum("excluded") - excludedDebtCents,
      needsManualIncomeSpending: !complete || averagingMonths === 0,
      history: {
        from,
        to,
        complete,
        monthsInWindow: 12,
        observedMonths: activeMonths.size,
        averagingMonths,
        transactionCount: transactions.length,
        countedEntries,
        incomeCents,
        spendingCents,
      },
      warnings,
    };
  },
});
