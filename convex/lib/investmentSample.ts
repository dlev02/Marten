import type { UserWrite } from "./transactions";

// Fictional funds and prices, only used inside an explicitly chosen sample workspace.
export async function seedInvestmentSample(ctx: UserWrite) {
  const present = await ctx.db
    .query("investmentHoldings")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .first();
  if (present) return;
  const accounts = (
    await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(201)
  ).filter(
    (account) => account.kind === "investment" && account.currency === "USD",
  );
  if (!accounts.length) return;
  const definitions = [
    {
      name: "Broad Market Fund",
      ticker: "FOL-US",
      type: "etf",
      price: 128.45,
      fraction: 0.55,
      basis: 0.87,
    },
    {
      name: "International Equity Fund",
      ticker: "FOL-INT",
      type: "etf",
      price: 64.125,
      fraction: 0.25,
      basis: null,
    },
    {
      name: "Core Bond Fund",
      ticker: "FOL-BND",
      type: "mutual fund",
      price: 10.025,
      fraction: 0.15,
      basis: 0.98,
    },
    {
      name: "Cash Reserve",
      ticker: null,
      type: "cash",
      price: 1,
      fraction: 0.05,
      basis: 1,
    },
  ];
  const existing = await ctx.db
    .query("investmentSecurities")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(100);
  for (const [index, definition] of definitions.entries()) {
    const providerSecurityId = `sample-security-${index}`;
    const securityId =
      existing.find((row) => row.providerSecurityId === providerSecurityId)
        ?._id ??
      (await ctx.db.insert("investmentSecurities", {
        userId: ctx.userId,
        providerSecurityId,
        name: definition.name,
        ticker: definition.ticker,
        type: definition.type,
        currency: "USD",
        isCashEquivalent: definition.type === "cash",
        closePrice: definition.price,
        closePriceDate: "2026-09-10",
        cusip: null,
        isin: null,
      }));
    for (const account of accounts) {
      // The final cash row absorbs rounding so positions equal the sample account balance.
      const valueCents =
        index === 3
          ? account.balanceCents -
            definitions
              .slice(0, 3)
              .reduce(
                (sum, row) =>
                  sum + Math.round(account.balanceCents * row.fraction),
                0,
              )
          : Math.round(account.balanceCents * definition.fraction);
      await ctx.db.insert("investmentHoldings", {
        userId: ctx.userId,
        accountId: account._id,
        securityId,
        quantity: valueCents / 100 / definition.price,
        valueCents,
        basisCents:
          definition.basis === null
            ? null
            : Math.round(valueCents * definition.basis),
        price: definition.price,
        currency: "USD",
        priceDate: "2026-09-10",
        syncedAt: Date.parse("2026-09-10T21:00:00Z"),
      });
      if (index > 1) continue;
      for (let month = 4; month <= 9; month++) {
        const date = `2026-${String(month).padStart(2, "0")}-05`;
        const quantity = index === 0 ? 3.125 : 1.75;
        await ctx.db.insert("investmentTransactions", {
          userId: ctx.userId,
          accountId: account._id,
          securityId,
          providerTransactionId: `sample-${account._id}-${index}-${month}`,
          date,
          name: `Purchase · ${definition.name}`,
          type: "buy",
          subtype: "buy",
          amountCents: Math.round(quantity * definition.price * 100),
          feesCents: 0,
          quantity,
          price: definition.price,
          currency: "USD",
          cancelTransactionId: null,
          canceled: false,
          removed: false,
        });
      }
    }
  }
}
