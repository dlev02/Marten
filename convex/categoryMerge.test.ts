/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

test("merging a category moves every reference, respects kinds and ownership, then removes it", async () => {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => ({
    alice: await ctx.db.insert("users", { email: "merge-alice@example.test" }),
    bob: await ctx.db.insert("users", { email: "merge-bob@example.test" }),
  }));
  const alice = t.withIdentity({ subject: users.alice }),
    bob = t.withIdentity({ subject: users.bob });
  await alice.mutation(api.workspace.initialize, { name: "QA", sample: true });
  await bob.mutation(api.workspace.initialize, { name: "Bob", sample: false });
  const data = await alice.query(api.workspace.metadata, {});
  const expenseGroup = data.groups.find((g) => g.kind === "expense")!;
  const incomeGroup = data.groups.find((g) => g.kind === "income")!;
  const source = await alice.mutation(api.settings.saveCategory, {
    groupId: expenseGroup._id,
    name: "Restaurants & Bars",
    emoji: "🍜",
    order: 99,
    enabled: true,
  });
  const target = data.categories.find(
    (c) => c.groupId === expenseGroup._id && c._id !== source,
  )!;
  const income = data.categories.find((c) => c.groupId === incomeGroup._id)!;
  const account = data.accounts[0];
  const merchant = data.merchants[0];
  const rows: Id<"transactions">[] = [];
  for (let n = 0; n < 3; n++)
    rows.push(
      await alice.mutation(api.transactions.create, {
        accountId: account._id,
        merchantId: merchant._id,
        categoryId: n === 2 ? target._id : source,
        date: "2026-03-0" + (n + 1),
        amountCents: 1000,
        originalName: "MERGE QA",
        notes: "",
        tagIds: [],
        reviewed: false,
        hidden: false,
        pending: false,
        splits:
          n === 2
            ? [
                { categoryId: source, amountCents: 400 },
                { categoryId: target._id, amountCents: 600 },
              ]
            : [],
      }),
    );
  const rule = await alice.mutation(api.settings.saveRule, {
    name: "Merge rule",
    match: "all",
    conditions: [{ field: "category", operator: "equals", value: source }],
    actions: { categoryId: source },
    enabled: true,
    order: 0,
  });
  await expect(
    alice.mutation(api.settings.mergeCategories, {
      sourceId: source,
      targetId: income._id,
    }),
  ).rejects.toThrow("same type");
  await expect(
    bob.mutation(api.settings.mergeCategories, {
      sourceId: source,
      targetId: target._id,
    }),
  ).rejects.toThrow("unavailable");
  let done = false,
    updated = 0,
    cursor: string | null = null;
  while (!done) {
    const step: { done: boolean; updated: number; cursor: string } =
      await alice.mutation(api.settings.mergeCategories, {
        sourceId: source,
        targetId: target._id,
        cursor,
      });
    done = step.done;
    updated += step.updated;
    cursor = step.cursor;
  }
  expect(updated).toBe(3);
  expect(await t.run((ctx) => ctx.db.get(source))).toBeNull();
  const saved = await t.run((ctx) =>
    Promise.all(rows.map((id) => ctx.db.get(id))),
  );
  expect(saved.map((tx) => tx?.categoryId)).toEqual([
    target._id,
    target._id,
    target._id,
  ]);
  expect(saved[2]?.splits.map((s) => s.categoryId)).toEqual([
    target._id,
    target._id,
  ]);
  const savedRule = await t.run((ctx) => ctx.db.get(rule));
  expect(savedRule?.actions.categoryId).toBe(target._id);
  expect(savedRule?.conditions[0].value).toBe(target._id);
});
