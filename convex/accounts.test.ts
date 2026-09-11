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
    ).toEqual({ inserted: 2, skipped: 0 });
    expect(
      await alice.mutation(api.transactions.importMapped, {
        rows: [row, { ...row, key: "b".repeat(64) }],
      }),
    ).toEqual({ inserted: 0, skipped: 2 });
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
    await expect(
      alice.mutation(api.workspace.importBalances, {
        accountId: id,
        rows: [{ date: "2026-01-01", balanceCents: 1 }],
      }),
    ).rejects.toThrow("manual");
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
    ).toHaveLength(0);
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
