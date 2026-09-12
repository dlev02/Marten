/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { mergePaymentStatus } from "./lib/recurringPayments";
const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Fictional QA" });
    const other = await ctx.db.insert("users", {
      name: "Other fictional owner",
    });
    await ctx.db.insert("profiles", {
      userId,
      name: "Fictional QA",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    const accountId = await ctx.db.insert("accounts", {
      userId,
      name: "Fictional checking",
      institution: "Sample",
      mask: "0000",
      kind: "cash",
      subtype: "checking",
      balanceCents: 100000,
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
    const categoryId = await ctx.db.insert("categories", {
      userId,
      groupId,
      name: "Subscriptions",
      emoji: "S",
      enabled: true,
      order: 0,
    });
    const merchantId = await ctx.db.insert("merchants", {
      userId,
      name: "Fictional subscription",
      normalizedName: "fictional subscription",
      color: "#123456",
      transactionCount: 0,
    });
    const tagA = await ctx.db.insert("tags", {
      userId,
      name: "A",
      color: "#123456",
      order: 0,
    });
    const tagB = await ctx.db.insert("tags", {
      userId,
      name: "B",
      color: "#123456",
      order: 1,
    });
    const foreignTag = await ctx.db.insert("tags", {
      userId: other,
      name: "Private",
      color: "#123456",
      order: 0,
    });
    return {
      userId,
      other,
      accountId,
      categoryId,
      merchantId,
      tagA,
      tagB,
      foreignTag,
    };
  });
  const alice = t.withIdentity({ subject: ids.userId }),
    bob = t.withIdentity({ subject: ids.other });
  const fields = {
    accountId: ids.accountId,
    categoryId: ids.categoryId,
    merchantId: ids.merchantId,
    date: "2026-09-10",
    amountCents: 500,
    originalName: "FICTIONAL SUBSCRIPTION",
    notes: "original",
    tagIds: [ids.tagA],
    hidden: false,
    reviewed: false,
    pending: false,
    splits: [],
  };
  const create = (patch: Partial<typeof fields> = {}) =>
    alice.mutation(api.transactions.create, { ...fields, ...patch });
  const schedule = (patch = {}) =>
    alice.mutation(api.recurring.save, {
      accountId: ids.accountId,
      categoryId: ids.categoryId,
      merchantId: ids.merchantId,
      amountCents: 500,
      amountToleranceCents: 10,
      nextDate: "2026-09-10",
      frequency: "monthly",
      active: true,
      source: "manual",
      note: "",
      ...patch,
    });
  const matches = () =>
    alice.query(api.recurring.automaticPayments, {
      from: "2026-09-01",
      to: "2026-09-30",
    });
  return { t, alice, bob, ...ids, create, schedule, matches };
}
test("posted matches update automatically, manual unpaid wins, and edits reverse matches", async () => {
  const f = await fixture();
  const recurringId = await f.schedule();
  const id = await f.create({ date: "2026-09-12" });
  expect(await f.matches()).toEqual([
    { recurringId, date: "2026-09-10", paid: true, transactionId: id },
  ]);
  await f.alice.mutation(api.recurring.setPaid, {
    recurringId,
    date: "2026-09-10",
    paid: false,
  });
  const manual = await f.alice.query(api.recurring.payments, {
    from: "2026-09-01",
    to: "2026-09-30",
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(mergePaymentStatus(await f.matches(), manual.page)).toMatchObject([
    { paid: false },
  ]);
  await f.alice.mutation(api.transactions.update, {
    id,
    patch: { hidden: true },
  });
  expect(await f.matches()).toEqual([]);
  await f.alice.mutation(api.transactions.update, {
    id,
    patch: { hidden: false, amountCents: 900 },
  });
  expect(await f.matches()).toEqual([]);
  await f.alice.mutation(api.transactions.update, {
    id,
    patch: { amountCents: 500, pending: true },
  });
  expect(await f.matches()).toEqual([]);
  await f.alice.mutation(api.transactions.update, {
    id,
    patch: { pending: false },
  });
  expect(await f.matches()).toHaveLength(1);
  await f.t.run((ctx) => ctx.db.patch(id, { removedFromBank: true }));
  expect(await f.matches()).toEqual([]);
});
test("ambiguous charges or schedules do not pay either occurrence; owners are isolated", async () => {
  const f = await fixture();
  await f.schedule();
  await f.create();
  const duplicate = await f.create({ date: "2026-09-11" });
  expect(await f.matches()).toEqual([]);
  await f.alice.mutation(api.transactions.remove, { id: duplicate });
  expect(await f.matches()).toHaveLength(1);
  await f.schedule({ name: "Second subscription" });
  expect(await f.matches()).toEqual([]);
  expect(
    await f.bob.query(api.recurring.automaticPayments, {
      from: "2026-09-01",
      to: "2026-09-30",
    }),
  ).toEqual([]);
  await expect(
    f.t.query(api.recurring.automaticPayments, {
      from: "2026-09-01",
      to: "2026-09-30",
    }),
  ).rejects.toThrow("sign in");
});
test("bulk tags preserve each row, validate foreign IDs atomically, and schedules deduplicate", async () => {
  const f = await fixture();
  const a = await f.create(),
    b = await f.create({ tagIds: [], date: "2026-10-10" });
  await f.alice.mutation(api.transactions.bulkUpdate, {
    ids: [a, b],
    patch: { notes: "Shared note", hidden: true },
    tagChange: { mode: "add", ids: [f.tagB] },
  });
  expect((await f.t.run((ctx) => ctx.db.get(a)))?.tagIds).toEqual([
    f.tagA,
    f.tagB,
  ]);
  expect((await f.t.run((ctx) => ctx.db.get(b)))?.tagIds).toEqual([f.tagB]);
  await expect(
    f.alice.mutation(api.transactions.bulkUpdate, {
      ids: [a, b],
      patch: { notes: "Must roll back" },
      tagChange: { mode: "remove", ids: [f.foreignTag] },
    }),
  ).rejects.toThrow("unavailable");
  expect((await f.t.run((ctx) => ctx.db.get(a)))?.notes).toBe("Shared note");
  await f.alice.mutation(api.transactions.bulkUpdate, {
    ids: [a, b],
    patch: { hidden: false },
    recurringFrequency: "monthly",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("recurring").collect()),
  ).toHaveLength(1);
});
test("bulk deletion and bank date protection are atomic", async () => {
  const f = await fixture();
  const a = await f.create(),
    b = await f.create();
  await f.t.run((ctx) => ctx.db.patch(b, { source: "plaid" }));
  await expect(
    f.alice.mutation(api.transactions.bulkRemove, { ids: [a, b] }),
  ).rejects.toThrow("Hide a bank");
  expect(await f.t.run((ctx) => ctx.db.get(a))).not.toBeNull();
  await expect(
    f.alice.mutation(api.transactions.bulkUpdate, {
      ids: [a, b],
      patch: { date: "2026-09-15" },
    }),
  ).rejects.toThrow("Bank amounts");
  expect((await f.t.run((ctx) => ctx.db.get(a)))?.date).toBe("2026-09-10");
  await expect(
    f.bob.mutation(api.transactions.bulkRemove, { ids: [a] }),
  ).rejects.toThrow("unavailable");
  await f.alice.mutation(api.transactions.bulkRemove, { ids: [a, a] });
  expect(await f.t.run((ctx) => ctx.db.get(a))).toBeNull();
});
