import type { Id } from "./_generated/dataModel";
import type { UserWrite } from "./lib/transactions";
import { normalize } from "./lib/finance";

import { categoryDefinitions } from "./lib/categoryDefaults";

export async function seedCategories(ctx: UserWrite) {
  const categories: Record<string, Id<"categories">> = {};
  let order = 0;
  for (const [name, kind, items] of categoryDefinitions) {
    const groupId = await ctx.db.insert("groups", {
      userId: ctx.userId,
      name,
      kind,
      order: order++,
    });
    for (const [name, emoji] of items)
      categories[name] = await ctx.db.insert("categories", {
        userId: ctx.userId,
        groupId,
        name,
        emoji,
        order: order++,
        enabled: true,
      });
  }
  return categories;
}
export async function seedSample(
  ctx: UserWrite,
  categories: Record<string, Id<"categories">>,
) {
  const accountDefs = [
    {
      name: "Everyday Checking",
      institution: "Chase",
      mask: "4821",
      kind: "cash",
      subtype: "checking",
      balanceCents: 1248000,
    },
    {
      name: "High Yield Savings",
      institution: "Chase",
      mask: "7290",
      kind: "cash",
      subtype: "savings",
      balanceCents: 4230000,
      apy: 3.8,
    },
    {
      name: "Sapphire Preferred",
      institution: "Chase",
      mask: "1108",
      kind: "credit",
      subtype: "credit card",
      balanceCents: 184000,
      limitCents: 1800000,
      statementCents: 142300,
      minimumCents: 4000,
      dueDate: "2026-09-21",
      statementDate: "2026-09-01",
    },
    {
      name: "Gold Card",
      institution: "American Express",
      mask: "3007",
      kind: "credit",
      subtype: "charge card",
      balanceCents: 232000,
      statementCents: 194600,
      minimumCents: 194600,
      dueDate: "2026-09-18",
      statementDate: "2026-08-28",
    },
    {
      name: "Roth IRA",
      institution: "Charles Schwab",
      mask: "6215",
      kind: "investment",
      subtype: "ira",
      balanceCents: 14800000,
    },
    {
      name: "Individual Brokerage",
      institution: "Charles Schwab",
      mask: "9034",
      kind: "investment",
      subtype: "brokerage",
      balanceCents: 8600000,
    },
  ] as const;
  const accountIds: Id<"accounts">[] = [];
  for (const account of accountDefs)
    accountIds.push(
      await ctx.db.insert("accounts", {
        userId: ctx.userId,
        ...account,
        currency: "USD",
        manual: true,
        hidden: false,
        closed: false,
        excludeNetWorth: false,
        updatedAt: Date.now(),
      }),
    );
  const merchantDefs = [
    ["Northstar Studio", "Paycheck", -465000, "#4263eb"],
    ["Oak Street Apartments", "Rent", 235000, "#7d8c7a"],
    ["Whole Foods Market", "Groceries", 12743, "#387b57"],
    ["Trader Joe's", "Groceries", 8249, "#c65248"],
    ["Blue Bottle Coffee", "Coffee", 650, "#419bd0"],
    ["Sweetgreen", "Restaurants", 1845, "#6c8642"],
    ["Target", "Shopping", 7643, "#cc4445"],
    ["Amazon", "Shopping", 4839, "#bf8836"],
    ["Spotify", "Subscriptions", 1299, "#319764"],
    ["Netflix", "Subscriptions", 1799, "#b54445"],
    ["ComEd", "Utilities", 9234, "#6185ac"],
    ["Xfinity", "Internet", 7500, "#8b6aa4"],
    ["Equinox", "Fitness", 18500, "#484c4b"],
    ["Uber", "Transport", 2346, "#626664"],
    ["Shell", "Transport", 4532, "#c7a243"],
    ["The Publican", "Restaurants", 9678, "#9e644f"],
    ["Walgreens", "Health", 2489, "#ba5756"],
    ["Apple", "Subscriptions", 299, "#6e747e"],
    ["United Airlines", "Travel", 38420, "#3d69a0"],
    ["Transfer", "Transfer", 50000, "#748580"],
    ["Credit card payment", "Credit card payment", 120000, "#77897a"],
    ["Chase interest", "Interest", -13240, "#5c927b"],
    ["AMC Theatres", "Entertainment", 3200, "#a8454d"],
    ["West Elm", "Shopping", 12800, "#a7876a"],
    ["Local Food Bank", "Gifts", 5000, "#85946b"],
  ] as const;
  const merchantIds: Id<"merchants">[] = [];
  const counts = new Map<Id<"merchants">, number>();
  for (const [name, , , color] of merchantDefs)
    merchantIds.push(
      await ctx.db.insert("merchants", {
        userId: ctx.userId,
        name,
        normalizedName: normalize(name),
        color,
        transactionCount: 0,
      }),
    );
  const tags = await Promise.all(
    [
      ["Vacation", "#6698ab"],
      ["Tax deductible", "#9f91bc"],
      ["Reimbursable", "#d49c68"],
    ].map(([name, color], order) =>
      ctx.db.insert("tags", { userId: ctx.userId, name, color, order }),
    ),
  );
  // All amounts and names in this opt-in workspace are fictional.
  for (let month = 4; month <= 9; month++) {
    const maxDay = month === 9 ? 10 : 28;
    const scheduled = [
      0,
      0,
      1,
      8,
      9,
      10,
      11,
      12,
      17,
      19,
      20,
      21,
      ...Array.from(
        { length: month === 9 ? 17 : 30 },
        (_, i) =>
          [2, 3, 4, 5, 6, 7, 13, 14, 15, 16, 22, 23, 24][(i + month) % 13],
      ),
    ];
    for (const [index, mi] of scheduled.entries()) {
      if (month === 9 && index === 1) continue;
      const [merchant, category, baseline] = merchantDefs[mi];
      const day =
        index === 0 ? 1 : index === 1 ? 15 : 1 + ((index * 3 + month) % maxDay);
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amountCents =
        mi < 2 || [8, 9, 11, 12, 17, 19, 20, 21].includes(mi)
          ? baseline
          : baseline + (month - 7) * 137 + (index % 4) * 281;
      const merchantId = merchantIds[mi];
      const accountId =
        accountIds[
          mi === 21
            ? 1
            : mi < 2 || [10, 11, 19, 20].includes(mi)
              ? 0
              : index % 2 === 0
                ? 2
                : 3
        ];
      await ctx.db.insert("transactions", {
        userId: ctx.userId,
        accountId,
        merchantId,
        categoryId: categories[category],
        date,
        amountCents,
        originalName: `${merchant.toUpperCase()} ${mi < 2 ? "ACH" : "PURCHASE"}`,
        notes: mi === 18 ? "Summer getaway" : "",
        tagIds: mi === 18 ? [tags[0]] : [],
        reviewed: month < 9 || index % 4 !== 0,
        hidden: false,
        pending: month === 9 && day === 10 && index % 3 === 0,
        splits: [],
        source: "sample",
        searchText: normalize(`${merchant} ${category}`),
        updatedAt: Date.now(),
        editedFields: [],
      });
      counts.set(merchantId, (counts.get(merchantId) ?? 0) + 1);
      if (mi === 19 || mi === 20) {
        await ctx.db.insert("transactions", {
          userId: ctx.userId,
          accountId: accountIds[mi === 19 ? 1 : 2],
          merchantId,
          categoryId: categories[category],
          date,
          amountCents: -amountCents,
          originalName: `${merchant.toUpperCase()} RECEIVED`,
          notes: "",
          tagIds: [],
          reviewed: true,
          hidden: false,
          pending: false,
          splits: [],
          source: "sample",
          searchText: normalize(merchant),
          updatedAt: Date.now(),
          editedFields: [],
        });
        counts.set(merchantId, (counts.get(merchantId) ?? 0) + 1);
      }
    }
  }
  for (const [id, transactionCount] of counts)
    await ctx.db.patch(id, { transactionCount });
  const start = Date.parse("2026-04-01T12:00:00Z"),
    end = Date.parse("2026-09-10T12:00:00Z");
  for (let time = start; time <= end; time += 86400000)
    for (const [index, id] of accountIds.entries()) {
      const progress = (time - start) / (end - start);
      const current = accountDefs[index].balanceCents;
      const factor =
        index >= 4
          ? 0.88 + 0.12 * progress
          : index < 2
            ? 0.91 + 0.09 * progress
            : 1.15 - 0.15 * progress;
      const wave =
        Math.sin(progress * 30 + index) *
        (1 - progress) *
        (index >= 4 ? 140000 : 15000);
      await ctx.db.insert("balances", {
        userId: ctx.userId,
        accountId: id,
        date: new Date(time).toISOString().slice(0, 10),
        balanceCents: Math.round(current * factor + wave),
      });
    }
  for (const [mi, nextDate] of [
    [1, "2026-10-01"],
    [8, "2026-09-14"],
    [9, "2026-09-16"],
    [10, "2026-09-20"],
    [11, "2026-09-22"],
    [12, "2026-10-01"],
    [17, "2026-09-19"],
    [0, "2026-09-15"],
  ] as const) {
    const [, category, amountCents] = merchantDefs[mi];
    await ctx.db.insert("recurring", {
      userId: ctx.userId,
      merchantId: merchantIds[mi],
      accountId: accountIds[mi < 2 || [10, 11].includes(mi) ? 0 : 3],
      categoryId: categories[category],
      amountCents,
      frequency: mi === 0 ? "biweekly" : "monthly",
      nextDate,
      active: true,
      source: "manual",
      note: "Fictional sample schedule",
    });
  }
}
