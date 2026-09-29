/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Fictional QA" });
    const other = await ctx.db.insert("users", { name: "Other owner" });
    const accountId = await ctx.db.insert("accounts", {
      userId,
      name: "Fictional checking",
      institution: "Sample",
      mask: "0000",
      kind: "cash",
      subtype: "checking",
      balanceCents: 0,
      currency: "USD",
      hidden: false,
      excludeNetWorth: false,
      closed: false,
      manual: true,
      updatedAt: 0,
    });
    const groupId = await ctx.db.insert("groups", {
      userId,
      name: "Expenses",
      kind: "expense",
      order: 0,
    });
    const category = (name: string, order: number) =>
      ctx.db.insert("categories", {
        userId,
        groupId,
        name,
        emoji: "S",
        enabled: true,
        order,
      });
    const groceries = await category("Groceries", 0);
    const dining = await category("Dining", 1);
    const merchantId = await ctx.db.insert("merchants", {
      userId,
      name: "Fictional market",
      normalizedName: "fictional market",
      color: "#123456",
      transactionCount: 0,
    });
    const insert = (
      owner: typeof userId,
      fields: {
        date: string;
        amountCents: number;
        categoryId: typeof groceries;
        reviewed?: boolean;
        hidden?: boolean;
        removedFromBank?: boolean;
        splits?: { categoryId: typeof groceries; amountCents: number }[];
      },
    ) =>
      ctx.db.insert("transactions", {
        userId: owner,
        accountId,
        merchantId,
        originalName: "Fictional market",
        notes: "",
        tagIds: [],
        pending: false,
        source: "manual",
        searchText: "fictional market",
        updatedAt: 0,
        editedFields: [],
        reviewed: true,
        hidden: false,
        splits: [],
        ...fields,
      });
    await insert(userId, {
      date: "2026-09-02",
      amountCents: 4200,
      categoryId: groceries,
      reviewed: false,
    });
    await insert(userId, {
      date: "2026-09-10",
      amountCents: 1800,
      categoryId: dining,
    });
    // A split with a groceries share matches the category filter.
    await insert(userId, {
      date: "2026-09-12",
      amountCents: 3000,
      categoryId: dining,
      splits: [
        { categoryId: groceries, amountCents: 1000 },
        { categoryId: dining, amountCents: 2000 },
      ],
    });
    await insert(userId, {
      date: "2026-08-30",
      amountCents: 999,
      categoryId: groceries,
    });
    await insert(userId, {
      date: "2026-09-15",
      amountCents: 500,
      categoryId: groceries,
      removedFromBank: true,
    });
    await insert(other, {
      date: "2026-09-05",
      amountCents: 7777,
      categoryId: groceries,
    });
    return { userId, groceries };
  });
  return { t, ids };
}

test("the transactions summary totals exactly the filtered rows", async () => {
  const { t, ids } = await fixture();
  const alice = t.withIdentity({ subject: ids.userId });
  const september = { from: "2026-09-01", to: "2026-09-30" };

  expect(await alice.query(api.transactions.summary, september)).toEqual({
    count: 3,
    totalCents: 9000,
    unreviewed: 1,
    complete: true,
  });
  expect(
    await alice.query(api.transactions.summary, {
      ...september,
      categoryId: ids.groceries,
    }),
  ).toMatchObject({ count: 2, totalCents: 7200 });
  expect(
    await alice.query(api.transactions.summary, {
      ...september,
      review: "unreviewed",
      minCents: 4000,
    }),
  ).toMatchObject({ count: 1, totalCents: 4200, unreviewed: 1 });
  // No date range covers the whole history, still only the owner's rows.
  expect(await alice.query(api.transactions.summary, {})).toMatchObject({
    count: 4,
    totalCents: 9999,
  });
});
