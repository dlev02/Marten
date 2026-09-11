/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { matchesRecurringSchedule } from "./lib/recurring";
const modules = import.meta.glob("./**/*.ts");
const schedule = {
  merchantId: "merchant" as Id<"merchants">,
  accountId: "account" as Id<"accounts">,
  amountCents: 1600,
  amountToleranceCents: 0,
  statementContains: "PRIME",
  frequency: "monthly" as const,
  nextDate: "2026-01-10",
  active: true,
};
const tx = {
  merchantId: schedule.merchantId,
  accountId: schedule.accountId,
  amountCents: 1600,
  originalName: "AMAZON PRIME MEMBERSHIP",
  date: "2026-02-11",
  hidden: false,
  pending: false,
};
describe("schedule-specific transaction matches", () => {
  test("a subscription does not mark unrelated merchant purchases, other accounts, refunds or off-schedule charges", () => {
    expect(matchesRecurringSchedule(schedule, tx)).toBe(true);
    for (const patch of [
      { amountCents: 4299 },
      { amountCents: -1600 },
      { accountId: "other" as Id<"accounts"> },
      { originalName: "AMAZON MARKETPLACE" },
      { date: "2026-02-22" },
      { hidden: true },
      { pending: true },
      { removedFromBank: true },
    ])
      expect(matchesRecurringSchedule(schedule, { ...tx, ...patch })).toBe(
        false,
      );
    expect(matchesRecurringSchedule({ ...schedule, active: false }, tx)).toBe(
      false,
    );
    expect(
      matchesRecurringSchedule({ ...schedule, nextDate: "2026-03-10" }, tx),
    ).toBe(false);
  });
  test("amount tolerance is explicit, bounded and retains the payment direction", () => {
    expect(
      matchesRecurringSchedule(schedule, { ...tx, amountCents: 1650 }),
    ).toBe(false);
    expect(
      matchesRecurringSchedule(
        { ...schedule, amountToleranceCents: 50 },
        { ...tx, amountCents: 1650 },
      ),
    ).toBe(true);
    expect(
      matchesRecurringSchedule(
        { ...schedule, amountToleranceCents: 50 },
        { ...tx, amountCents: 1651 },
      ),
    ).toBe(false);
    expect(
      matchesRecurringSchedule(
        { ...schedule, nextDate: "2026-01-31" },
        { ...tx, date: "2026-02-28" },
      ),
    ).toBe(true);
  });
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "recurring-a@example.test",
    });
    const otherUser = await ctx.db.insert("users", {
      email: "recurring-b@example.test",
    });
    const fields = {
      userId,
      institution: "Fictional Bank",
      mask: "0000",
      subtype: "credit card",
      currency: "USD",
      hidden: false,
      excludeNetWorth: false,
      closed: false,
      manual: false,
      updatedAt: 1,
      balanceCents: 40000,
    };
    const accountId = await ctx.db.insert("accounts", {
      ...fields,
      name: "Sample card",
      kind: "credit",
    });
    const cashId = await ctx.db.insert("accounts", {
      ...fields,
      name: "Sample cash",
      kind: "cash",
    });
    const groupId = await ctx.db.insert("groups", {
      userId,
      name: "Spending",
      kind: "expense",
      order: 0,
    });
    const categoryId = await ctx.db.insert("categories", {
      userId,
      groupId,
      name: "Shopping",
      emoji: "",
      order: 0,
      enabled: true,
    });
    const merchantId = await ctx.db.insert("merchants", {
      userId,
      name: "Sample Marketplace",
      normalizedName: "sample marketplace",
      color: "#000000",
      transactionCount: 0,
    });
    return { userId, otherUser, accountId, cashId, categoryId, merchantId };
  });
  return {
    t,
    ...ids,
    alice: t.withIdentity({ subject: ids.userId }),
    bob: t.withIdentity({ subject: ids.otherUser }),
  };
}
test("detection finds multiple amounts at one merchant and an existing schedule suppresses only its own pattern", async () => {
  const { t, alice, userId, accountId, merchantId, categoryId } =
    await fixture();
  await t.run(async (ctx) => {
    for (const amountCents of [1600, 9500])
      for (const date of ["2026-06-10", "2026-07-10", "2026-08-10"])
        await ctx.db.insert("transactions", {
          userId,
          accountId,
          merchantId,
          categoryId,
          amountCents,
          date,
          originalName: "SAMPLE SUBSCRIPTION",
          notes: "",
          tagIds: [],
          reviewed: true,
          hidden: false,
          pending: false,
          splits: [],
          source: "sample",
          searchText: "sample",
          updatedAt: 1,
          editedFields: [],
        });
    for (const amountCents of [12345, 1650])
      await ctx.db.insert("transactions", {
        userId,
        accountId,
        merchantId,
        categoryId,
        amountCents,
        date: "2026-08-20",
        originalName: "SAMPLE ONE TIME ORDER",
        notes: "",
        tagIds: [],
        reviewed: true,
        hidden: false,
        pending: false,
        splits: [],
        source: "sample",
        searchText: "sample",
        updatedAt: 1,
        editedFields: [],
      });
  });
  expect(
    (
      await alice.query(api.recurring.detect, {
        now: Date.parse("2026-09-01T12:00:00Z"),
      })
    ).proposals
      .map((p) => p.amountCents)
      .sort(),
  ).toEqual([1600, 9500]);
  expect(
    (
      await alice.query(api.recurring.detect, {
        now: Date.parse("2026-09-01T12:00:00Z"),
      })
    ).proposals.map((p) => p.nextDate),
  ).toEqual(["2026-09-10", "2026-09-10"]);
  expect(
    (
      await alice.query(api.recurring.detect, {
        now: Date.parse("2027-09-01T12:00:00Z"),
      })
    ).proposals,
  ).toEqual([]);
  await alice.mutation(api.recurring.save, {
    accountId,
    merchantId,
    categoryId,
    name: "Sample Prime",
    amountCents: 1600,
    amountToleranceCents: 0,
    statementContains: "",
    frequency: "monthly",
    nextDate: "2026-09-10",
    active: true,
    source: "manual",
    note: "",
  });
  expect(
    (
      await alice.query(api.recurring.detect, {
        now: Date.parse("2026-09-01T12:00:00Z"),
      })
    ).proposals.map((p) => p.amountCents),
  ).toEqual([9500]);
});
test.each([99, 101])(
  "detection reports completeness accurately for %i eligible patterns",
  async (patternCount) => {
    const { t, alice, userId, accountId, categoryId } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < patternCount; i++) {
        const merchantId = await ctx.db.insert("merchants", {
          userId,
          name: `Sample membership ${i}`,
          normalizedName: `sample membership ${i}`,
          color: "#000000",
          transactionCount: 3,
        });
        for (const date of ["2026-06-10", "2026-07-10", "2026-08-10"])
          await ctx.db.insert("transactions", {
            userId,
            accountId,
            merchantId,
            categoryId,
            amountCents: 1600,
            date,
            originalName: "SAMPLE MEMBERSHIP",
            notes: "",
            tagIds: [],
            reviewed: true,
            hidden: false,
            pending: false,
            splits: [],
            source: "sample",
            searchText: "sample",
            updatedAt: 1,
            editedFields: [],
          });
      }
    });
    const result = await alice.query(api.recurring.detect, {
      now: Date.parse("2026-09-01T12:00:00Z"),
    });
    expect(result.proposals).toHaveLength(Math.min(patternCount, 100));
    expect(new Set(result.proposals.map((p) => p.merchantId)).size).toBe(
      result.proposals.length,
    );
    expect(result.complete).toBe(patternCount < 100);
  },
);
test("manual statement reminders isolate owners and preserve provider balances/details", async () => {
  const { t, alice, bob, userId, accountId, cashId } = await fixture();
  const value = {
    accountId,
    dueDate: "2026-09-22",
    statementCents: 32000,
    minimumCents: 2500,
  };
  await expect(
    t.mutation(api.recurring.saveStatementReminder, value),
  ).rejects.toThrow("sign in");
  await expect(
    bob.mutation(api.recurring.saveStatementReminder, value),
  ).rejects.toThrow("unavailable");
  await expect(
    alice.mutation(api.recurring.saveStatementReminder, {
      ...value,
      accountId: cashId,
    }),
  ).rejects.toThrow("credit-card");
  await expect(
    alice.mutation(api.recurring.saveStatementReminder, {
      ...value,
      dueDate: "2026-02-30",
    }),
  ).rejects.toThrow("date");
  await expect(
    alice.mutation(api.recurring.saveStatementReminder, {
      ...value,
      minimumCents: 32001,
    }),
  ).rejects.toThrow("minimum");
  await alice.mutation(api.recurring.saveStatementReminder, value);
  const saved = await t.run((ctx) => ctx.db.get(accountId));
  expect(saved).toMatchObject({
    balanceCents: 40000,
    updatedAt: 1,
    statementReminder: {
      dueDate: value.dueDate,
      statementCents: 32000,
      minimumCents: 2500,
    },
  });
  expect(saved?.dueDate).toBeUndefined();
  expect(saved?.statementCents).toBeUndefined();
  const itemId = await t.run(async (ctx) => {
    await ctx.db.insert("profiles", {
      userId,
      name: "Sample",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    const id = await ctx.db.insert("plaidItems", {
      userId,
      plaidItemId: "fictional-reminder-item",
      accessToken: "fictional-private-token",
      institutionId: "fictional-bank",
      institution: "Fictional Bank",
      products: ["transactions"],
      environment: "sandbox",
      status: "connected",
      syncVersion: 0,
    });
    await ctx.db.patch(accountId, {
      plaidAccountId: "fictional-card",
      itemId: id,
    });
    return id;
  });
  const lease = await t.mutation(internal.plaidInternal.acquire, { itemId });
  if (!lease?.syncVersion) throw new Error("Expected sync lease");
  await t.mutation(internal.plaidInternal.updateAccounts, {
    itemId,
    version: lease.syncVersion,
    accounts: [
      {
        accountId: "fictional-card",
        name: "Sample card",
        mask: "0000",
        kind: "credit",
        subtype: "credit card",
        balanceCents: 45000,
        currency: "USD",
        dueDate: "2026-10-03",
        statementCents: 42000,
      },
    ],
  });
  expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({
    balanceCents: 45000,
    dueDate: "2026-10-03",
    statementCents: 42000,
    statementReminder: saved?.statementReminder,
  });
  await expect(
    bob.mutation(api.recurring.clearStatementReminder, { accountId }),
  ).rejects.toThrow("unavailable");
  await alice.mutation(api.recurring.clearStatementReminder, { accountId });
  expect(
    (await t.run((ctx) => ctx.db.get(accountId)))?.statementReminder,
  ).toBeUndefined();
});

test("schedule saves validate names, matching bounds and ownership", async () => {
  const { alice, bob, accountId, merchantId, categoryId } = await fixture();
  const value = {
    accountId,
    merchantId,
    categoryId,
    name: "Sample Prime",
    amountCents: 1600,
    amountToleranceCents: 0,
    frequency: "monthly" as const,
    nextDate: "2026-09-10",
    active: true,
    source: "manual" as const,
    note: "",
  };
  for (const amountToleranceCents of [-1, 1601, 0.5])
    await expect(
      alice.mutation(api.recurring.save, { ...value, amountToleranceCents }),
    ).rejects.toThrow();
  await expect(
    alice.mutation(api.recurring.save, { ...value, name: " " }),
  ).rejects.toThrow();
  await expect(bob.mutation(api.recurring.save, value)).rejects.toThrow(
    "unavailable",
  );
  const id = await alice.mutation(api.recurring.save, value);
  await expect(
    bob.mutation(api.recurring.save, { ...value, id }),
  ).rejects.toThrow("unavailable");
});
