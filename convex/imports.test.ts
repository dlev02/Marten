/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const a = await t.run((ctx) =>
    ctx.db.insert("users", { email: "import-qa@example.test" }),
  );
  const b = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other-import-qa@example.test" }),
  );
  return {
    t,
    a,
    alice: t.withIdentity({ subject: a }),
    bob: t.withIdentity({ subject: b }),
  };
}
const args = {
  accounts: [
    { name: "Old Visa (...1234)", kind: "credit" as const, closed: true },
  ],
  categories: [{ name: "Hotels", kind: "expense" as const, emoji: "🏨" }],
};
test("destinations are owned, retry-safe and preserve history without an invented snapshot", async () => {
  const { t, alice, bob } = await fixture();
  const first = await alice.mutation(api.imports.prepareDestinations, args);
  expect(first.accounts[0]).toMatchObject({
    manual: true,
    closed: true,
    balanceCents: 0,
    mask: "1234",
  });
  expect(await alice.mutation(api.imports.prepareDestinations, args)).toEqual(
    first,
  );
  const other = await bob.mutation(api.imports.prepareDestinations, args);
  expect(other.accounts[0]._id).not.toBe(first.accounts[0]._id);
  expect(other.categories[0]._id).not.toBe(first.categories[0]._id);
  expect(await t.run((ctx) => ctx.db.query("balances").collect())).toHaveLength(
    0,
  );
  const result = await alice.mutation(api.transactions.importMapped, {
    rows: [
      {
        key: "a".repeat(64),
        accountId: first.accounts[0]._id,
        categoryId: first.categories[0]._id,
        categoryMatched: true,
        merchantName: "Fictional Hotel",
        date: "2020-01-01",
        amountCents: 12000,
        originalName: "FICTIONAL HOTEL",
        notes: "Historical purchase",
      },
    ],
  });
  expect(result.inserted).toBe(1);
});
test("invalid preparation rolls back accounts and categories together", async () => {
  const { t, alice } = await fixture();
  await expect(
    alice.mutation(api.imports.prepareDestinations, {
      ...args,
      categories: [{ ...args.categories[0], name: "" }],
    }),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("accounts").collect())).toEqual([]);
  await expect(
    alice.mutation(api.imports.prepareDestinations, {
      accounts: Array.from({ length: 101 }, () => args.accounts[0]),
      categories: [],
    }),
  ).rejects.toThrow("100");
});
test("suggested category expansion is idempotent and does not modify personal categories", async () => {
  const { t, alice } = await fixture();
  const first = await alice.mutation(api.imports.prepareDestinations, args);
  expect(
    await alice.mutation(api.imports.addSuggestedCategories, {}),
  ).toBeGreaterThan(30);
  expect(await alice.mutation(api.imports.addSuggestedCategories, {})).toBe(0);
  expect(await t.run((ctx) => ctx.db.get(first.categories[0]._id))).toEqual(
    first.categories[0],
  );
});
