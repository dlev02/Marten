/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const accountFields = {
  name: "Sample checking",
  institution: "Sample Bank",
  mask: "1234",
  kind: "cash" as const,
  subtype: "checking",
  balanceCents: 120034,
  currency: "USD",
  hidden: false,
  excludeNetWorth: false,
  closed: false,
};
async function fixture(sample = false) {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => ({
    alice: await ctx.db.insert("users", { email: "sample-alice@example.test" }),
    bob: await ctx.db.insert("users", { email: "sample-bob@example.test" }),
  }));
  const alice = t.withIdentity({ subject: users.alice }),
    bob = t.withIdentity({ subject: users.bob });
  await alice.mutation(api.workspace.initialize, {
    name: "Fictional household",
    sample,
  });
  await bob.mutation(api.workspace.initialize, { sample: false });
  return { t, users, alice, bob };
}
describe("mapped spreadsheet import", () => {
  test("atomic batches create merchants once, preserve balances, skip retries and enforce ownership", async () => {
    const { t, alice, bob } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const metadata = await alice.query(api.workspace.metadata, {});
    const categoryId = metadata.categories[0]._id;
    const row = {
      key: "a".repeat(64),
      accountId,
      categoryId,
      merchantName: "Fictional Cafe",
      date: "2026-09-10",
      amountCents: 1250,
      originalName: "FICTIONAL CAFE 100",
      notes: "Spreadsheet import",
    };
    const snapshot = async () =>
      t.run(async (ctx) => ({
        transactions: await ctx.db.query("transactions").collect(),
        merchants: await ctx.db.query("merchants").collect(),
        account: await ctx.db.get(accountId),
        balances: await ctx.db.query("balances").collect(),
      }));
    const before = await snapshot();
    await expect(
      bob.mutation(api.transactions.importMapped, { rows: [row] }),
    ).rejects.toThrow("unavailable");
    expect(await snapshot()).toEqual(before);
    await expect(
      alice.mutation(api.transactions.importMapped, {
        rows: [
          row,
          {
            ...row,
            key: "b".repeat(64),
            date: "2026-02-30",
            merchantName: "Should not remain",
          },
        ],
      }),
    ).rejects.toThrow("date");
    expect(await snapshot()).toEqual(before);
    expect(
      await alice.mutation(api.transactions.importMapped, {
        rows: [
          row,
          {
            ...row,
            key: "b".repeat(64),
            merchantName: " fictional cafe ",
            amountCents: -500,
          },
        ],
      }),
    ).toEqual({ inserted: 2, skipped: 0, matched: 0 });
    expect(
      await alice.mutation(api.transactions.importMapped, {
        rows: [row, { ...row, key: "b".repeat(64) }],
      }),
    ).toEqual({ inserted: 0, skipped: 2, matched: 0 });
    const after = await snapshot();
    expect(after.transactions).toHaveLength(2);
    expect(after.merchants).toHaveLength(before.merchants.length + 1);
    expect(
      after.merchants.find((m) => m.name === "Fictional Cafe")
        ?.transactionCount,
    ).toBe(2);
    expect(after.account).toEqual(before.account);
    expect(after.balances).toEqual(before.balances);
    await expect(
      alice.mutation(api.transactions.importMapped, {
        rows: Array.from({ length: 101 }, () => row),
      }),
    ).rejects.toThrow("100 rows");
  });
  test("saved rules apply to mapped imports while source description and notes are retained", async () => {
    const { t, alice } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const metadata = await alice.query(api.workspace.metadata, {});
    const [originalCategory, ruleCategory] = metadata.categories;
    await alice.mutation(api.settings.saveRule, {
      name: "Imported cafe",
      enabled: true,
      order: 0,
      match: "all",
      conditions: [
        { field: "merchant", operator: "contains", value: "fictional cafe" },
      ],
      actions: { categoryId: ruleCategory._id, reviewed: true },
    });
    await alice.mutation(api.transactions.importMapped, {
      rows: [
        {
          key: "c".repeat(64),
          accountId,
          categoryId: originalCategory._id,
          merchantName: "Fictional Cafe",
          date: "2026-09-10",
          amountCents: 1250,
          originalName: "FICTIONAL CAFE #100",
          notes: "Original note",
        },
      ],
    });
    const tx = await t.run((ctx) => ctx.db.query("transactions").first());
    expect(tx).toMatchObject({
      source: "csv",
      categoryId: ruleCategory._id,
      reviewed: true,
      originalName: "FICTIONAL CAFE #100",
      notes: "Original note",
    });
  });
});
describe("Monarch-style imports", () => {
  test("tags and review state import, and a synced or manual twin is enriched instead of duplicated", async () => {
    const { t, users, alice } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const metadata = await alice.query(api.workspace.metadata, {});
    const [originalCategory, fileCategory] = metadata.categories;
    const merchantId = await t.run((ctx) =>
      ctx.db.insert("merchants", {
        userId: users.alice,
        name: "Amazon",
        normalizedName: "amazon",
        color: "#000000",
        transactionCount: 1,
      }),
    );
    // A purchase already in Marten (here entered by hand) dated a day after
    // the spreadsheet's row for the same amount.
    const manualId = await t.run((ctx) =>
      ctx.db.insert("transactions", {
        userId: users.alice,
        accountId,
        merchantId,
        categoryId: originalCategory._id,
        date: "2026-09-11",
        amountCents: 3279,
        originalName: "AMAZON MKTPL*534KW6IC2",
        notes: "",
        tagIds: [],
        reviewed: false,
        hidden: false,
        pending: false,
        splits: [],
        source: "manual",
        searchText: "amazon",
        updatedAt: 1,
        editedFields: [],
      }),
    );
    const rows = [
      {
        key: "d".repeat(64),
        accountId,
        categoryId: fileCategory._id,
        categoryMatched: true,
        merchantName: "Amazon",
        date: "2026-09-10",
        amountCents: 3279,
        originalName: "AMAZON MKTPL*534KW6IC2",
        notes: "Gift for mom",
        tags: ["Gifts", "family"],
        reviewed: true,
      },
      {
        key: "e".repeat(64),
        accountId,
        categoryId: fileCategory._id,
        categoryMatched: true,
        merchantName: "Amazon",
        date: "2026-09-01",
        amountCents: 3279,
        originalName: "AMAZON",
        notes: "",
        tags: ["gifts"],
        reviewed: false,
      },
    ];
    expect(
      await alice.mutation(api.transactions.importMapped, { rows }),
    ).toEqual({ inserted: 1, matched: 1, skipped: 0 });
    const tags = await t.run((ctx) => ctx.db.query("tags").collect());
    expect(tags.map((tag) => tag.name).sort()).toEqual(["Gifts", "family"]);
    const gifts = tags.find((tag) => tag.name === "Gifts")!;
    const manual = (await t.run((ctx) => ctx.db.get(manualId)))!;
    expect(manual).toMatchObject({
      source: "manual",
      categoryId: fileCategory._id,
      notes: "Gift for mom",
      reviewed: true,
      importKey: `mapped-v1:${"d".repeat(64)}`,
    });
    expect(manual.tagIds).toHaveLength(2);
    expect(manual.editedFields).toEqual(
      expect.arrayContaining(["notes", "categoryId"]),
    );
    const transactions = await t.run((ctx) =>
      ctx.db.query("transactions").collect(),
    );
    expect(transactions).toHaveLength(2);
    const inserted = transactions.find((tx) => tx._id !== manualId)!;
    expect(inserted).toMatchObject({
      source: "csv",
      date: "2026-09-01",
      tagIds: [gifts._id],
      reviewed: false,
      editedFields: ["categoryId"],
    });
    expect(
      await alice.mutation(api.transactions.importMapped, { rows }),
    ).toEqual({ inserted: 0, matched: 0, skipped: 2 });
    expect(await t.run((ctx) => ctx.db.query("tags").collect())).toHaveLength(
      2,
    );
  });
  test("merging a manual account moves its records and combines spreadsheet twins", async () => {
    const { t, users, alice, bob } = await fixture();
    const sourceId = await alice.mutation(api.workspace.saveAccount, {
      ...accountFields,
      name: "Imported card",
    });
    const targetId = await alice.mutation(api.workspace.saveAccount, {
      ...accountFields,
      name: "Connected card",
    });
    const metadata = await alice.query(api.workspace.metadata, {});
    const categoryId = metadata.categories[0]._id;
    await alice.mutation(api.transactions.importMapped, {
      rows: [
        {
          key: "1".repeat(64),
          accountId: sourceId,
          categoryId,
          categoryMatched: true,
          merchantName: "Sample Diner",
          date: "2026-09-05",
          amountCents: 1000,
          originalName: "SAMPLE DINER",
          notes: "Team lunch",
          tags: ["Trip"],
          reviewed: true,
        },
        {
          key: "2".repeat(64),
          accountId: sourceId,
          categoryId,
          merchantName: "Sample Grocer",
          date: "2026-09-06",
          amountCents: 2000,
          originalName: "SAMPLE GROCER",
          notes: "",
        },
      ],
    });
    const merchantId = await t.run((ctx) =>
      ctx.db.insert("merchants", {
        userId: users.alice,
        name: "Diner",
        normalizedName: "diner",
        color: "#000000",
        transactionCount: 1,
      }),
    );
    const syncedId = await t.run((ctx) =>
      ctx.db.insert("transactions", {
        userId: users.alice,
        accountId: targetId,
        merchantId,
        categoryId: metadata.categories[1]._id,
        date: "2026-09-06",
        amountCents: 1000,
        originalName: "SAMPLE DINER",
        notes: "",
        tagIds: [],
        reviewed: false,
        hidden: false,
        pending: false,
        splits: [],
        source: "manual",
        searchText: "diner",
        updatedAt: 1,
        editedFields: [],
      }),
    );
    await alice.mutation(api.workspace.importBalances, {
      accountId: sourceId,
      rows: [
        { date: "2026-01-01", balanceCents: 100 },
        { date: "2026-01-02", balanceCents: 200 },
      ],
    });
    await alice.mutation(api.workspace.importBalances, {
      accountId: targetId,
      rows: [{ date: "2026-01-02", balanceCents: 999 }],
    });
    await expect(
      bob.mutation(api.workspace.mergeAccounts, { sourceId, targetId }),
    ).rejects.toThrow("unavailable");
    await expect(
      alice.mutation(api.workspace.mergeAccounts, {
        sourceId,
        targetId: sourceId,
      }),
    ).rejects.toThrow("different account");
    let done = false,
      moved = 0,
      matched = 0;
    while (!done) {
      const step = await alice.mutation(api.workspace.mergeAccounts, {
        sourceId,
        targetId,
      });
      done = step.done;
      moved += step.moved;
      matched += step.matched;
    }
    // One transaction, the source's three balance days (two dated rows plus
    // its creation-day snapshot), and one combined spreadsheet twin.
    expect({ moved, matched }).toEqual({ moved: 4, matched: 1 });
    expect(await t.run((ctx) => ctx.db.get(sourceId))).toBeNull();
    const transactions = await t.run((ctx) =>
      ctx.db.query("transactions").collect(),
    );
    expect(transactions).toHaveLength(2);
    expect(transactions.every((tx) => tx.accountId === targetId)).toBe(true);
    const synced = transactions.find((tx) => tx._id === syncedId)!;
    expect(synced).toMatchObject({
      notes: "Team lunch",
      reviewed: true,
      categoryId,
      importKey: `mapped-v1:${"1".repeat(64)}`,
    });
    expect(synced.tagIds).toHaveLength(1);
    const balances = await t.run((ctx) => ctx.db.query("balances").collect());
    expect(
      balances
        .filter((row) => row.date.startsWith("2026-01"))
        .map((row) => [row.accountId, row.date, row.balanceCents])
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    ).toEqual([
      [targetId, "2026-01-01", 100],
      [targetId, "2026-01-02", 999],
    ]);
    // The spreadsheet row that merged away no longer counts for its merchant.
    const diner = await t.run((ctx) =>
      ctx.db
        .query("merchants")
        .filter((q) => q.eq(q.field("name"), "Sample Diner"))
        .first(),
    );
    expect(diner?.transactionCount).toBe(0);
  });
});
describe("account and workspace boundaries", () => {
  test("manual balances validate ownership and imports upsert without changing current balance", async () => {
    const { t, alice, bob } = await fixture();
    const id = await alice.mutation(api.workspace.saveAccount, accountFields);
    await expect(
      bob.query(api.workspace.balanceHistory, {
        accountId: id,
        from: "2026-01-01",
        to: "2026-12-31",
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      bob.mutation(api.workspace.saveAccount, { id, ...accountFields }),
    ).rejects.toThrow("unavailable");
    await expect(
      bob.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2026-01-01", balanceCents: 10000 }],
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      alice.mutation(api.workspace.saveAccount, {
        ...accountFields,
        currency: "EUR",
      }),
    ).rejects.toThrow("USD");
    await expect(
      alice.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2026-02-30", balanceCents: 10000 }],
      }),
    ).rejects.toThrow("date");
    await expect(
      alice.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2026-02-28", balanceCents: 1.5 }],
      }),
    ).rejects.toThrow("amount");
    for (const balanceCents of [90000, 100000])
      await alice.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2026-02-28", balanceCents }],
      });
    const history = await alice.query(api.workspace.balanceHistory, {
      accountId: id,
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(history).toMatchObject({
      complete: true,
      rows: [{ date: "2026-02-28", balanceCents: 100000 }],
    });
    expect(history.rows).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      balanceCents: 120034,
    });
  });
  test("connected account edits preserve provider balances, statements, timestamp and history", async () => {
    const { t, alice, users } = await fixture();
    const id = await t.run((ctx) =>
      ctx.db.insert("accounts", {
        ...accountFields,
        userId: users.alice,
        manual: false,
        updatedAt: 123,
        statementCents: 4200,
      }),
    );
    await expect(
      alice.mutation(api.workspace.saveAccount, {
        id,
        ...accountFields,
        balanceCents: 300,
      }),
    ).rejects.toThrow("bank manages");
    await expect(
      alice.mutation(api.workspace.saveAccount, {
        id,
        ...accountFields,
        statementCents: 300,
      }),
    ).rejects.toThrow("bank manages");
    // Connected accounts accept older history (such as a Monarch balance
    // export) but never a future date, and the current balance stays the bank's.
    await expect(
      alice.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2999-01-01", balanceCents: 1 }],
      }),
    ).rejects.toThrow("future");
    expect(
      await alice.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2026-01-01", balanceCents: 1 }],
      }),
    ).toBe(1);
    await alice.mutation(api.workspace.saveAccount, {
      id,
      ...accountFields,
      name: "Renamed account",
      hidden: true,
    });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      name: "Renamed account",
      hidden: true,
      statementCents: 4200,
      updatedAt: 123,
    });
    expect(
      (
        await alice.query(api.workspace.balanceHistory, {
          accountId: id,
          from: "2020-01-01",
          to: "2029-01-01",
        })
      ).rows,
    ).toEqual([
      expect.objectContaining({ date: "2026-01-01", balanceCents: 1 }),
    ]);
  });
  test("sample seeding is opt-in, repeatable without duplication and financially coherent", async () => {
    const { alice, bob } = await fixture(true);
    const meta = await alice.query(api.workspace.metadata, {});
    expect(meta.profile?.demo).toBe(true);
    expect(meta.accounts).toHaveLength(6);
    expect(
      meta.accounts.reduce(
        (sum, account) =>
          sum +
          (account.kind === "credit" || account.kind === "loan"
            ? -account.balanceCents
            : account.balanceCents),
        0,
      ),
    ).toBe(28462000);
    let cursor: string | null = null;
    let count = 0;
    const counts = new Map<string, number>();
    for (;;) {
      const result: FunctionReturnType<typeof api.transactions.list> =
        await alice.query(api.transactions.list, {
          paginationOpts: { numItems: 100, cursor },
        });
      for (const tx of result.page) {
        expect(tx.source).toBe("sample");
        count++;
        counts.set(tx.merchantId, (counts.get(tx.merchantId) ?? 0) + 1);
      }
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(count).toBeGreaterThanOrEqual(150);
    expect(count).toBeLessThanOrEqual(300);
    for (const merchant of meta.merchants)
      expect(merchant.transactionCount).toBe(counts.get(merchant._id) ?? 0);
    await alice.mutation(api.workspace.initialize, {
      name: "Should not replace",
      sample: true,
    });
    expect(
      (await alice.query(api.workspace.metadata, {})).accounts,
    ).toHaveLength(6);
    expect((await alice.query(api.workspace.metadata, {})).profile?.name).toBe(
      "Fictional household",
    );
    expect((await bob.query(api.workspace.metadata, {})).accounts).toHaveLength(
      0,
    );
    expect(
      (
        await bob.query(api.transactions.list, {
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toHaveLength(0);
  });
  test("sample reset is isolated and refuses ordinary or bank-connected workspaces", async () => {
    const { t, alice, bob, users } = await fixture(true);
    await expect(bob.mutation(api.workspace.clearSample, {})).rejects.toThrow(
      "sample",
    );
    const itemId = await t.run((ctx) =>
      ctx.db.insert("plaidItems", {
        userId: users.alice,
        plaidItemId: "sample-item",
        accessToken: "sample-secret",
        institutionId: "sample",
        institution: "Sample",
        environment: "sandbox",
        status: "connected",
        products: [],
      }),
    );
    await expect(alice.mutation(api.workspace.clearSample, {})).rejects.toThrow(
      "Disconnect",
    );
    const metadata = await alice.query(api.workspace.metadata, {});
    expect(JSON.stringify(metadata)).not.toContain("sample-secret");
    await t.run((ctx) => ctx.db.delete(itemId));
    let done = false;
    for (let i = 0; i < 50 && !done; i++)
      done = (await alice.mutation(api.workspace.clearSample, {})).done;
    expect(done).toBe(true);
    const cleared = await alice.query(api.workspace.metadata, {});
    expect(cleared.profile).toBeNull();
    expect(cleared.accounts).toHaveLength(0);
    expect(cleared.merchants).toHaveLength(0);
    expect(
      (await bob.query(api.workspace.metadata, {})).profile,
    ).not.toBeNull();
  });
});

describe("recurring payment boundaries", () => {
  test("paginates beyond 5,000 payments without declaring a partial result complete", async () => {
    const { t, alice, users } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const merchantId = await alice.mutation(api.settings.saveMerchant, {
      name: "Fictional subscriptions",
      color: "#000000",
    });
    const categoryId = (await alice.query(api.workspace.metadata, {}))
      .categories[0]._id;
    const expectedIds: string[] = [];
    // Separate batches keep fixture writes within the normal mutation limits.
    for (let start = 0; start < 501; start += 50) {
      expectedIds.push(
        ...(await t.run(async (ctx) => {
          const ids: string[] = [];
          for (
            let schedule = start;
            schedule < Math.min(start + 50, 501);
            schedule++
          ) {
            const recurringId = await ctx.db.insert("recurring", {
              userId: users.alice,
              accountId,
              merchantId,
              categoryId,
              amountCents: 100,
              frequency: "monthly",
              nextDate: "2026-01-01",
              active: true,
              source: "manual",
              note: "",
            });
            for (let month = 1; month <= (schedule === 500 ? 1 : 10); month++) {
              ids.push(
                await ctx.db.insert("recurringPayments", {
                  userId: users.alice,
                  recurringId,
                  date: `2026-${String(month).padStart(2, "0")}-01`,
                  paid: true,
                }),
              );
            }
          }
          return ids;
        })),
      );
    }
    const receivedIds: string[] = [];
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 26; pageNumber++) {
      const result: FunctionReturnType<typeof api.recurring.payments> =
        await alice.query(api.recurring.payments, {
          from: "2026-01-01",
          to: "2026-12-31",
          paginationOpts: { numItems: 200, cursor },
        });
      receivedIds.push(...result.page.map((payment) => payment._id));
      expect(result.page.every((payment) => payment.paid)).toBe(true);
      expect(result.isDone).toBe(pageNumber === 25);
      expect(result.page).toHaveLength(pageNumber === 25 ? 1 : 200);
      cursor = result.continueCursor;
    }
    expect(receivedIds.sort()).toEqual(expectedIds.sort());
    expect(new Set(receivedIds).size).toBe(5001);
  });

  test("verifies related owners and scheduled month-end occurrences; payment edits are idempotent", async () => {
    const { alice, bob, t } = await fixture();
    const accountId = await alice.mutation(
        api.workspace.saveAccount,
        accountFields,
      ),
      otherAccountId = await bob.mutation(
        api.workspace.saveAccount,
        accountFields,
      );
    const merchantId = await alice.mutation(api.settings.saveMerchant, {
      name: "Fictional rent",
      color: "#000000",
    });
    const categoryId = (await alice.query(api.workspace.metadata, {}))
      .categories[0]._id;
    const fields = {
      accountId,
      merchantId,
      categoryId,
      amountCents: 10000,
      frequency: "monthly" as const,
      nextDate: "2026-01-31",
      active: true,
      source: "manual" as const,
      note: "",
    };
    await expect(
      alice.mutation(api.recurring.save, {
        ...fields,
        accountId: otherAccountId,
      }),
    ).rejects.toThrow("unavailable");
    const recurringId = await alice.mutation(api.recurring.save, fields);
    await expect(
      bob.mutation(api.recurring.setPaid, {
        recurringId,
        date: "2026-02-28",
        paid: true,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      alice.mutation(api.recurring.setPaid, {
        recurringId,
        date: "2026-03-28",
        paid: true,
      }),
    ).rejects.toThrow("scheduled");
    await alice.mutation(api.recurring.setPaid, {
      recurringId,
      date: "2026-02-28",
      paid: true,
    });
    await alice.mutation(api.recurring.setPaid, {
      recurringId,
      date: "2026-02-28",
      paid: false,
    });
    const payments = await alice.query(api.recurring.payments, {
      from: "2026-01-01",
      to: "2026-03-31",
      paginationOpts: { numItems: 200, cursor: null },
    });
    expect(payments.isDone).toBe(true);
    expect(payments.page).toHaveLength(1);
    expect(payments.page[0].paid).toBe(false);
    expect(
      await bob.query(api.recurring.payments, {
        from: "2026-01-01",
        to: "2026-03-31",
        paginationOpts: { numItems: 200, cursor: null },
      }),
    ).toMatchObject({ page: [], isDone: true });
    expect(await t.run((ctx) => ctx.db.get(recurringId))).toMatchObject({
      nextDate: "2026-01-31",
    });
  });
});

describe("receipt and archived transaction ownership", () => {
  test("fixed split previews and application agree, skip removed rows and reconcile drafts", async () => {
    const { alice, t } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const merchantId = await alice.mutation(api.settings.saveMerchant, {
      name: "Sample split store",
      color: "#000000",
    });
    const categoryId = (await alice.query(api.workspace.metadata, {}))
      .categories[0]._id;
    const fields = {
      accountId,
      merchantId,
      categoryId,
      amountCents: 1000,
      date: "2026-09-10",
      originalName: "SAMPLE SPLIT",
      notes: "",
      tagIds: [],
      reviewed: false,
      hidden: false,
      pending: false,
      splits: [],
    };
    const matching = await alice.mutation(api.transactions.create, fields);
    const differentTotal = await alice.mutation(api.transactions.create, {
      ...fields,
      amountCents: 900,
    });
    const removed = await alice.mutation(api.transactions.create, fields);
    const splits = [
      { categoryId, amountCents: 600 },
      { categoryId, amountCents: 400 },
    ];
    await t.run(async (ctx) => {
      await ctx.db.patch(matching, {
        splitDraft: [
          { categoryId, amountCents: 450 },
          { categoryId, amountCents: 450 },
        ],
      });
      await ctx.db.patch(removed, { removedFromBank: true });
    });
    const rule = {
      name: "Split matching totals",
      match: "all" as const,
      conditions: [
        {
          field: "statement" as const,
          operator: "contains" as const,
          value: "SAMPLE SPLIT",
        },
      ],
      actions: { splits, reviewed: true },
      enabled: true,
      order: 0,
    };
    const id = await alice.mutation(api.settings.saveRule, rule);
    const preview = await alice.query(api.settings.previewRule, {
      ...rule,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(preview.page.map((tx) => tx._id)).toEqual([matching]);
    expect(
      await alice.mutation(api.settings.applyRule, {
        id,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).toMatchObject({ updated: 1, isDone: true });
    const updated = (
      await alice.query(api.transactions.detail, { id: matching })
    ).transaction;
    expect(updated.splits).toEqual(splits);
    expect(updated.splitDraft).toBeUndefined();
    expect(
      (await alice.query(api.transactions.detail, { id: differentTotal }))
        .transaction.splits,
    ).toEqual([]);
    expect(
      (await alice.query(api.transactions.detail, { id: removed })).transaction
        .reviewed,
    ).toBe(false);
  });
  test("receipt uploads cannot target another household and attachment counts follow deletion", async () => {
    const { alice, bob } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const merchantId = await alice.mutation(api.settings.saveMerchant, {
      name: "Sample receipt store",
      color: "#000000",
    });
    const categoryId = (await alice.query(api.workspace.metadata, {}))
      .categories[0]._id;
    const id = await alice.mutation(api.transactions.create, {
      accountId,
      merchantId,
      categoryId,
      amountCents: 1000,
      date: "2026-09-10",
      originalName: "Sample receipt",
      notes: "",
      tagIds: [],
      reviewed: false,
      hidden: false,
      pending: false,
      splits: [],
    });
    const upload = {
      transactionId: id,
      name: "sample-receipt.png",
      contentType: "image/png",
      bytes: Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8+PUnAwMDEwMYAAAilgLjdfe7hwAAAABJRU5ErkJggg==",
        ),
        (character) => character.charCodeAt(0),
      ).buffer,
    };
    await expect(
      bob.action(api.transactions.uploadAttachment, upload),
    ).rejects.toThrow("unavailable");
    const attachment = await alice.action(
      api.transactions.uploadAttachment,
      upload,
    );
    const detail = await alice.query(api.transactions.detail, { id });
    expect(detail.transaction.attachmentCount).toBe(1);
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0].url).toBeTruthy();
    await expect(
      bob.mutation(api.transactions.deleteAttachment, { id: attachment }),
    ).rejects.toThrow("unavailable");
    await alice.mutation(api.transactions.deleteAttachment, { id: attachment });
    expect(
      (await alice.query(api.transactions.detail, { id })).transaction
        .attachmentCount,
    ).toBe(0);
  });
  test("merging bank-removed rows keeps annotations without reviving merchant counts", async () => {
    const { alice, t } = await fixture();
    const accountId = await alice.mutation(
      api.workspace.saveAccount,
      accountFields,
    );
    const sourceId = await alice.mutation(api.settings.saveMerchant, {
        name: "Old sample merchant",
        color: "#000000",
      }),
      targetId = await alice.mutation(api.settings.saveMerchant, {
        name: "New sample merchant",
        color: "#111111",
      });
    const categoryId = (await alice.query(api.workspace.metadata, {}))
      .categories[0]._id;
    const id = await alice.mutation(api.transactions.create, {
      accountId,
      merchantId: sourceId,
      categoryId,
      amountCents: 1000,
      date: "2026-09-10",
      originalName: "Sample removed",
      notes: "Preserve this note",
      tagIds: [],
      reviewed: false,
      hidden: false,
      pending: false,
      splits: [],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { removedFromBank: true });
      await ctx.db.patch(sourceId, { transactionCount: 0 });
    });
    await alice.mutation(api.settings.mergeMerchants, { sourceId, targetId });
    const metadata = await alice.query(api.workspace.metadata, {});
    expect(
      metadata.merchants.find((m) => m._id === targetId)?.transactionCount,
    ).toBe(0);
    expect(
      (await alice.query(api.transactions.detail, { id })).transaction,
    ).toMatchObject({
      notes: "Preserve this note",
      merchantId: targetId,
      removedFromBank: true,
    });
    expect(
      (
        await alice.query(api.transactions.list, {
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toHaveLength(0);
  });
});

describe("net worth history", () => {
  test("sums the latest balance per account, carries balances forward, and stays small for long ranges", async () => {
    const { alice, bob } = await fixture();
    const checking = await alice.mutation(api.workspace.saveAccount, {
      ...accountFields,
      name: "Checking",
    });
    const card = await alice.mutation(api.workspace.saveAccount, {
      ...accountFields,
      name: "Card",
      kind: "credit",
      mask: "9999",
      balanceCents: 5000,
    });
    // Saving an account records today's snapshot; add explicit history too.
    await alice.mutation(api.workspace.importBalances, {
      accountId: checking,
      rows: [
        { date: "2026-01-01", balanceCents: 100000 },
        { date: "2026-01-03", balanceCents: 120000 },
      ],
    });
    await alice.mutation(api.workspace.importBalances, {
      accountId: card,
      rows: [{ date: "2026-01-02", balanceCents: 20000 }],
    });
    const history = await alice.query(api.workspace.netWorthHistory, {
      from: "2026-01-01",
      to: "2026-01-04",
    });
    expect(history.stepDays).toBe(1);
    expect(history.points).toEqual([
      { date: "2026-01-01", valueCents: 100000 },
      { date: "2026-01-02", valueCents: 80000 },
      { date: "2026-01-03", valueCents: 100000 },
      { date: "2026-01-04", valueCents: 100000 },
    ]);
    expect(history.series.find((s) => s.accountId === card)?.values).toEqual([
      null,
      20000,
      20000,
      20000,
    ]);
    // A range starting after the rows still carries the balances in.
    const later = await alice.query(api.workspace.netWorthHistory, {
      from: "2026-01-05",
      to: "2026-01-06",
    });
    expect(later.points.map((p) => p.valueCents)).toEqual([100000, 100000]);
    // Ten years of daily points would exceed Convex's array limit; they are sampled.
    const decade = await alice.query(api.workspace.netWorthHistory, {
      from: "2016-09-14",
      to: "2026-09-14",
    });
    expect(decade.stepDays).toBeGreaterThan(1);
    expect(decade.points.length).toBeLessThanOrEqual(420);
    expect(decade.points.at(-1)?.date).toBe("2026-09-14");
    // Sampling anchors on the end date; the first point lands within one step of the first balance.
    expect(decade.points[0]?.date >= "2026-01-01").toBe(true);
    expect(decade.points[0]?.date <= "2026-01-31").toBe(true);
    expect(
      (
        await bob.query(api.workspace.netWorthHistory, {
          from: "2026-01-01",
          to: "2026-01-04",
        })
      ).points,
    ).toEqual([]);
  });

});
