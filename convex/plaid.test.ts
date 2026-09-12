/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { entries } from "./lib/finance";
import {
  normalizeAccount,
  normalizeTransaction,
  defaultBankCategory,
  verifyWebhook,
  type BankTransaction,
  type PlaidAccount,
  type PlaidTransaction,
} from "./lib/plaidApi";

const modules = import.meta.glob("./**/*.ts");
const incoming: BankTransaction = {
  transactionId: "sample-pending",
  accountId: "sample-account",
  date: "2026-09-09",
  amountCents: 1000,
  name: "SAMPLE DINER",
  merchant: "Sample Diner",
  pending: true,
  category: "FOOD_AND_DRINK",
};
async function fixture() {
  const t = convexTest(schema, modules);
  const seed = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "sample@example.test",
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "other@example.test",
    });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Sample",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    await ctx.db.insert("profiles", {
      userId: otherUserId,
      name: "Other",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    const itemId = await ctx.db.insert("plaidItems", {
      userId,
      plaidItemId: "sample-item",
      accessToken: "fictional-private-token",
      institutionId: "sample-institution",
      institution: "Sample Bank",
      products: ["transactions"],
      environment: "sandbox",
      status: "connected",
      syncVersion: 0,
    });
    return { userId, otherUserId, profileId, itemId };
  });
  const lease = await t.mutation(internal.plaidInternal.acquire, {
    itemId: seed.itemId,
  });
  if (!lease?.syncVersion) throw new Error("Expected sync lease");
  const sync = { itemId: seed.itemId, version: lease.syncVersion };
  await t.mutation(internal.plaidInternal.updateAccounts, {
    ...sync,
    accounts: [
      {
        accountId: "sample-account",
        name: "Sample checking",
        mask: "0000",
        kind: "cash",
        subtype: "checking",
        balanceCents: 500000,
        currency: "USD",
      },
    ],
  });
  return {
    t,
    ...seed,
    sync,
    asUser: t.withIdentity({ subject: seed.userId }),
    asOther: t.withIdentity({ subject: seed.otherUserId }),
  };
}

describe("Plaid ingestion", () => {
  test("pending-to-posted keeps the row, notes, tags, manual identity, review choice, and receipt", async () => {
    const { t, sync, userId, asUser } = await fixture();
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [incoming],
    });
    const pending = (
      await t.run((ctx) => ctx.db.query("transactions").collect())
    )[0];
    const tagId = await asUser.mutation(api.settings.saveTag, {
      name: "Reimbursable",
      color: "#123456",
      order: 0,
    });
    const merchantId = await asUser.mutation(api.settings.saveMerchant, {
      name: "Custom diner",
      color: "#123456",
    });
    await asUser.mutation(api.transactions.update, {
      id: pending._id,
      patch: {
        notes: "Keep my receipt",
        tagIds: [tagId],
        merchantId,
        reviewed: true,
      },
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["fictional receipt"], { type: "application/pdf" }),
      ),
    );
    const attachmentId = await t.mutation(internal.transactions.attachStored, {
      userId,
      transactionId: pending._id,
      storageId,
      name: "receipt.pdf",
      contentType: "application/pdf",
      size: 17,
    });
    const posted = {
      ...incoming,
      transactionId: "sample-posted",
      pendingTransactionId: incoming.transactionId,
      pending: false,
      date: "2026-09-10",
    };
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [posted, posted],
    });
    await t.mutation(internal.plaidInternal.removeTransactions, {
      ...sync,
      transactionIds: [incoming.transactionId],
    });
    const rows = await t.run((ctx) => ctx.db.query("transactions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      _id: pending._id,
      plaidTransactionId: "sample-posted",
      pending: false,
      removedFromBank: false,
      notes: "Keep my receipt",
      merchantId,
      tagIds: [tagId],
      reviewed: true,
    });
    expect(await t.run((ctx) => ctx.db.get(attachmentId))).toMatchObject({
      transactionId: pending._id,
      storageId,
    });
    expect(await t.run((ctx) => ctx.db.get(merchantId))).toMatchObject({
      transactionCount: 1,
    });
  });

  test("a bank sync adopts a spreadsheet row for the same purchase instead of duplicating it", async () => {
    const { t, sync, userId, asUser } = await fixture();
    const account = (await t.run((ctx) => ctx.db.query("accounts").first()))!;
    const categoryId = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        userId,
        name: "Spending",
        kind: "expense",
        order: 0,
      });
      return ctx.db.insert("categories", {
        userId,
        groupId,
        name: "Dining",
        emoji: "🍽️",
        order: 0,
        enabled: true,
      });
    });
    const key = "f".repeat(64);
    await asUser.mutation(api.transactions.importMapped, {
      rows: [
        {
          key,
          accountId: account._id,
          categoryId,
          categoryMatched: true,
          merchantName: "Sample Diner",
          date: "2026-09-08",
          amountCents: 1000,
          originalName: "SAMPLE DINER",
          notes: "From Monarch",
          tags: ["Trip"],
          reviewed: true,
        },
      ],
    });
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [incoming],
    });
    const rows = await t.run((ctx) => ctx.db.query("transactions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "plaid",
      plaidTransactionId: incoming.transactionId,
      date: incoming.date,
      pending: true,
      categoryId,
      notes: "From Monarch",
      reviewed: true,
      importKey: `mapped-v1:${key}`,
    });
    expect(rows[0].tagIds).toHaveLength(1);
    // The same bank id updates in place; a different purchase is a new row.
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [
        incoming,
        { ...incoming, transactionId: "sample-other", date: "2026-09-10" },
      ],
    });
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(2);
  });
  test("a changed posted amount keeps allocations reconciled and flags review", async () => {
    const { t, sync, asUser } = await fixture();
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [incoming],
    });
    const pending = (
      await t.run((ctx) => ctx.db.query("transactions").collect())
    )[0];
    await asUser.mutation(api.transactions.update, {
      id: pending._id,
      patch: {
        reviewed: true,
        notes: "Preserve meal detail",
        splits: [
          { categoryId: pending.categoryId, amountCents: 500, note: "Meal" },
          { categoryId: pending.categoryId, amountCents: 500, note: "Other" },
        ],
      },
    });
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [
        {
          ...incoming,
          transactionId: "sample-posted",
          pendingTransactionId: incoming.transactionId,
          amountCents: 1200,
          pending: false,
        },
      ],
    });
    const posted = (await t.run((ctx) => ctx.db.get(pending._id)))!;
    expect(posted).toMatchObject({
      amountCents: 1200,
      reviewed: false,
      notes: "Preserve meal detail",
      pending: false,
    });
    expect(posted.splits).toEqual([]);
    expect(posted.splitDraft).toEqual([
      { categoryId: pending.categoryId, amountCents: 500, note: "Meal" },
      { categoryId: pending.categoryId, amountCents: 500, note: "Other" },
    ]);
    expect(
      entries(posted).reduce((sum, entry) => sum + entry.amountCents, 0),
    ).toBe(1200);
    await asUser.mutation(api.transactions.update, {
      id: pending._id,
      patch: {
        splits: [
          { categoryId: pending.categoryId, amountCents: 600, note: "Meal" },
          { categoryId: pending.categoryId, amountCents: 600, note: "Other" },
        ],
        reviewed: true,
      },
    });
    const repaired = (await t.run((ctx) => ctx.db.get(pending._id)))!;
    expect(repaired.splitDraft).toBeUndefined();
    expect(repaired.reviewed).toBe(true);
    expect(
      repaired.splits.reduce((sum, split) => sum + split.amountCents, 0),
    ).toBe(1200);
  });

  test("removed records are omitted from the transaction list and restore without duplication", async () => {
    const { t, sync, asUser } = await fixture();
    const posted = { ...incoming, pending: false };
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [posted],
    });
    const row = (
      await t.run((ctx) => ctx.db.query("transactions").collect())
    )[0];
    await t.mutation(internal.plaidInternal.removeTransactions, {
      ...sync,
      transactionIds: [posted.transactionId, posted.transactionId],
    });
    expect(
      (
        await asUser.query(api.transactions.list, {
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(row.merchantId))).toMatchObject({
      transactionCount: 0,
    });
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [posted],
    });
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(row.merchantId))).toMatchObject({
      transactionCount: 1,
    });
  });

  test("exclusive leases and stale versions protect data and cursor commits", async () => {
    const { t, sync, itemId } = await fixture();
    expect(
      await t.mutation(internal.plaidInternal.acquire, { itemId }),
    ).toBeNull();
    await expect(
      t.mutation(internal.plaidInternal.ingestTransactions, {
        ...sync,
        version: sync.version - 1,
        transactions: [incoming],
      }),
    ).rejects.toThrow("superseded");
    await expect(
      t.mutation(internal.plaidInternal.finish, {
        ...sync,
        version: sync.version - 1,
        cursor: "bad",
        products: ["transactions"],
      }),
    ).rejects.toThrow("superseded");
    expect(await t.run((ctx) => ctx.db.get(itemId))).not.toHaveProperty(
      "cursor",
    );
    await t.mutation(internal.plaidInternal.finish, {
      ...sync,
      cursor: "good",
      products: ["transactions"],
    });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      cursor: "good",
      status: "connected",
    });
    const next = await t.mutation(internal.plaidInternal.acquire, { itemId });
    expect(next?.syncVersion).toBe(sync.version + 1);
  });

  test("account refresh keeps preferences and upserts one daily balance snapshot", async () => {
    const { t, sync } = await fixture();
    const account = (
      await t.run((ctx) => ctx.db.query("accounts").collect())
    )[0];
    await t.run((ctx) =>
      ctx.db.patch(account._id, {
        name: "My account",
        hidden: true,
        excludeNetWorth: true,
        closed: true,
      }),
    );
    await t.mutation(internal.plaidInternal.updateAccounts, {
      ...sync,
      accounts: [
        {
          accountId: "sample-account",
          name: "Provider name",
          mask: "0000",
          kind: "cash",
          subtype: "checking",
          balanceCents: 510000,
          currency: "USD",
        },
      ],
    });
    expect(await t.run((ctx) => ctx.db.get(account._id))).toMatchObject({
      name: "My account",
      hidden: true,
      excludeNetWorth: true,
      closed: true,
      balanceCents: 510000,
    });
    const snapshots = await t.run((ctx) => ctx.db.query("balances").collect());
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      accountId: account._id,
      balanceCents: 510000,
    });
  });

  test("ownership, demo restrictions, and public token redaction are enforced", async () => {
    const { t, sync, itemId, userId, otherUserId, profileId, asUser, asOther } =
      await fixture();
    await expect(
      t.query(internal.plaidInternal.context, { userId: otherUserId, itemId }),
    ).rejects.toThrow("unavailable");
    await expect(
      t.mutation(internal.plaidInternal.disconnectStart, {
        userId: otherUserId,
        itemId,
      }),
    ).rejects.toThrow("unavailable");
    await expect(asOther.action(api.plaid.sync, { itemId })).rejects.toThrow(
      "unavailable",
    );
    const visible = await asUser.query(api.plaid.status, {});
    expect(visible.items).toHaveLength(1);
    expect(JSON.stringify(visible)).not.toContain("fictional-private-token");
    expect(visible.items[0]).not.toHaveProperty("accessToken");
    expect(visible.items[0]).not.toHaveProperty("syncVersion");
    expect((await asOther.query(api.plaid.status, {})).items).toEqual([]);
    await t.run((ctx) => ctx.db.patch(profileId, { demo: true }));
    await expect(
      t.query(internal.plaidInternal.context, { userId }),
    ).rejects.toThrow("Sample data");
    await expect(
      t.mutation(internal.plaidInternal.ingestTransactions, {
        ...sync,
        transactions: [incoming],
      }),
    ).rejects.toThrow("Sample data");
  });

  test("disconnect fences running writes and preserves existing records", async () => {
    const { t, sync, itemId, userId } = await fixture();
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [incoming],
    });
    await t.mutation(internal.plaidInternal.disconnectStart, {
      itemId,
      userId,
    });
    await expect(
      t.mutation(internal.plaidInternal.ingestTransactions, {
        ...sync,
        transactions: [{ ...incoming, pending: false }],
      }),
    ).rejects.toThrow("superseded");
    await t.mutation(internal.plaidInternal.disconnectFinish, { itemId });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "disconnected",
      accessToken: "",
    });
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(1);
    expect(
      (await t.run((ctx) => ctx.db.query("accounts").collect()))[0],
    ).toMatchObject({ closed: false, balanceCents: 500000 });
    expect(
      (await t.run((ctx) => ctx.db.query("balances").collect()))[0]
        .balanceCents,
    ).toBe(500000);
  });
  test("reconnecting the same Plaid account keeps its ID and cached history", async () => {
    const { t, itemId, userId } = await fixture();
    const original = (
      await t.run((ctx) => ctx.db.query("accounts").collect())
    )[0];
    await t.mutation(internal.plaidInternal.disconnectStart, {
      itemId,
      userId,
    });
    await t.mutation(internal.plaidInternal.disconnectFinish, { itemId });
    const replacementId = await t.run((ctx) =>
      ctx.db.insert("plaidItems", {
        userId,
        plaidItemId: "sample-reconnected-item",
        accessToken: "fictional-new-token",
        institutionId: "sample-institution",
        institution: "Sample Bank",
        products: ["transactions"],
        environment: "sandbox",
        status: "connected",
        syncVersion: 0,
      }),
    );
    const lease = await t.mutation(internal.plaidInternal.acquire, {
      itemId: replacementId,
    });
    if (!lease?.syncVersion) throw new Error("Expected replacement lease");
    await t.mutation(internal.plaidInternal.updateAccounts, {
      itemId: replacementId,
      version: lease.syncVersion,
      accounts: [
        {
          accountId: "sample-account",
          name: "Provider name",
          mask: "0000",
          kind: "cash",
          subtype: "checking",
          balanceCents: 520000,
          currency: "USD",
        },
      ],
    });
    const accounts = await t.run((ctx) => ctx.db.query("accounts").collect());
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      _id: original._id,
      itemId: replacementId,
      name: "Sample checking",
      closed: false,
      balanceCents: 520000,
    });
    expect(
      (await t.run((ctx) => ctx.db.query("balances").collect()))[0].accountId,
    ).toBe(original._id);
  });

  test("failed revocation retains token for retry without changing accounts or resuming sync", async () => {
    const { t, itemId, userId } = await fixture();
    await t.mutation(internal.plaidInternal.disconnectStart, {
      itemId,
      userId,
    });
    await t.mutation(internal.plaidInternal.disconnectFinish, {
      itemId,
      error: "Retry Disconnect to finish.",
    });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "disconnected",
      accessToken: "fictional-private-token",
      error: "Retry Disconnect to finish.",
    });
    expect(
      await t.mutation(internal.plaidInternal.acquire, { itemId }),
    ).toBeNull();
    expect(
      (await t.run((ctx) => ctx.db.query("accounts").collect()))[0],
    ).toMatchObject({ closed: false, balanceCents: 500000 });
    const retry = await t.mutation(internal.plaidInternal.disconnectStart, {
      itemId,
      userId,
    });
    expect(retry.accessToken).toBe("fictional-private-token");
    await t.mutation(internal.plaidInternal.disconnectFinish, { itemId });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "disconnected",
      accessToken: "",
    });
  });

  test("expense refunds retain expense intent, while income and transfers use their own groups", () => {
    expect(defaultBankCategory("FOOD_AND_DRINK_GROCERIES", -1999)).toEqual({
      name: "Groceries",
      kind: "expense",
    });
    expect(
      defaultBankCategory("GENERAL_MERCHANDISE_ELECTRONICS", -45000),
    ).toEqual({ name: "Shopping", kind: "expense" });
    expect(defaultBankCategory("INCOME_WAGES", -200000)).toEqual({
      name: "Paycheck",
      kind: "income",
    });
    expect(
      defaultBankCategory("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", -20000),
    ).toEqual({ name: "Credit card payment", kind: "transfer" });
    expect(defaultBankCategory("TRANSFER_OUT_SAVINGS", 20000)).toEqual({
      name: "Transfer",
      kind: "transfer",
    });
  });
});

describe("Plaid sync orchestration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const account: PlaidAccount = {
    account_id: "sample-account",
    name: "Sample checking",
    official_name: null,
    mask: "0000",
    type: "depository",
    subtype: "checking",
    balances: {
      current: 5500,
      available: 5000,
      limit: null,
      iso_currency_code: "USD",
    },
  };
  const posted: PlaidTransaction = {
    transaction_id: "sample-posted",
    pending_transaction_id: null,
    account_id: "sample-account",
    date: "2026-09-10",
    amount: 12,
    name: "SAMPLE DINER",
    merchant_name: "Sample Diner",
    pending: false,
    iso_currency_code: "USD",
    personal_finance_category: {
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_RESTAURANT",
    },
  };
  function configure() {
    vi.stubEnv("PLAID_CLIENT_ID", "fictional-client");
    vi.stubEnv("PLAID_SECRET", "fictional-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");
  }
  test("requests 730 days for a new Transactions Link without adding initialization parameters to update mode", async () => {
    configure();
    const { asUser, itemId } = await fixture();
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (!url.endsWith("/link/token/create"))
          throw new Error("Unexpected endpoint");
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        requests.push({
          products: body.products,
          transactions: body.transactions,
          additional_consented_products: body.additional_consented_products,
          update: body.update,
          hasAccessToken: typeof body.access_token === "string",
        });
        return Response.json({
          link_token: "fictional-link-token",
          expiration: new Date(Date.now() + 3600000).toISOString(),
        });
      }),
    );
    await asUser.action(api.plaid.createLinkToken, { mode: "transactions" });
    await asUser.action(api.plaid.createLinkToken, { mode: "investments" });
    await asUser.action(api.plaid.createLinkToken, {
      mode: "transactions",
      itemId,
    });
    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      products: ["transactions"],
      transactions: { days_requested: 730 },
      hasAccessToken: false,
    });
    expect(requests[1]).toMatchObject({
      products: ["investments"],
      additional_consented_products: ["transactions", "liabilities"],
      hasAccessToken: false,
    });
    expect(requests[1].transactions).toBeUndefined();
    expect(requests[2]).toMatchObject({
      hasAccessToken: true,
      update: { account_selection_enabled: true },
      additional_consented_products: [
        "transactions",
        "investments",
        "liabilities",
      ],
    });
    expect(requests[2].products).toBeUndefined();
    expect(requests[2].transactions).toBeUndefined();
  });
  test("initializes Transactions with 730 days when it was only consented during an investments-first Link", async () => {
    configure();
    const { t, itemId, sync } = await fixture();
    await t.mutation(internal.plaidInternal.finish, {
      ...sync,
      products: ["investments"],
    });
    const requests: {
      cursor?: string;
      options?: { days_requested?: number };
    }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/accounts/get"))
          return Response.json({
            accounts: [
              account,
              {
                ...account,
                account_id: "sample-ira",
                type: "investment",
                subtype: "ira",
              },
            ],
            item: {
              products: ["investments"],
              consented_products: ["transactions"],
            },
          });
        if (url.endsWith("/investments/holdings/get"))
          return Response.json({ holdings: [], securities: [] });
        if (url.endsWith("/investments/transactions/get"))
          return Response.json({
            investment_transactions: [],
            securities: [],
            total_investment_transactions: 0,
          });
        if (!url.endsWith("/transactions/sync"))
          throw new Error("Unexpected endpoint");
        const body = JSON.parse(String(init.body)) as {
          cursor?: string;
          options?: { days_requested?: number };
        };
        requests.push({ cursor: body.cursor, options: body.options });
        return Response.json({
          added: [],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "first-transaction-cursor",
        });
      }),
    );
    await t.action(internal.plaid.syncItem, { itemId });
    expect(requests).toEqual([
      { cursor: undefined, options: { days_requested: 730 } },
    ]);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "connected",
      cursor: "first-transaction-cursor",
      products: ["investments", "transactions"],
    });
  });
  test("restarts the entire pagination loop and discards unstable pages before committing the cursor", async () => {
    configure();
    const { t, itemId, sync } = await fixture();
    await t.mutation(internal.plaidInternal.finish, {
      ...sync,
      cursor: "initial-cursor",
      products: ["transactions"],
    });
    const cursors: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/accounts/get"))
          return Response.json({
            accounts: [account],
            item: { products: ["transactions"], consented_products: [] },
          });
        if (!url.endsWith("/transactions/sync"))
          throw new Error("Unexpected endpoint");
        const body = JSON.parse(String(init.body)) as { cursor: string };
        cursors.push(body.cursor);
        if (cursors.length === 1)
          return Response.json({
            added: [{ ...posted, transaction_id: "discarded-unstable" }],
            modified: [],
            removed: [],
            has_more: true,
            next_cursor: "unstable-page",
          });
        if (cursors.length === 2)
          return Response.json(
            { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" },
            { status: 400 },
          );
        return Response.json({
          added: [posted],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "stable-cursor",
        });
      }),
    );
    await t.action(internal.plaid.syncItem, { itemId });
    expect(cursors).toEqual([
      "initial-cursor",
      "unstable-page",
      "initial-cursor",
    ]);
    const transactions = await t.run((ctx) =>
      ctx.db.query("transactions").collect(),
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0].plaidTransactionId).toBe("sample-posted");
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      cursor: "stable-cursor",
      status: "connected",
    });
  });
  test("failed transaction fetch preserves the committed cursor and still updates cached balances", async () => {
    configure();
    const { t, itemId, sync } = await fixture();
    await t.mutation(internal.plaidInternal.finish, {
      ...sync,
      cursor: "initial-cursor",
      products: ["transactions"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/accounts/get")
          ? Response.json({
              accounts: [account],
              item: { products: ["transactions"], consented_products: [] },
            })
          : Response.json(
              {
                error_code: "ITEM_LOGIN_REQUIRED",
                error_message: "Never expose this raw response",
              },
              { status: 400 },
            ),
      ),
    );
    await t.action(internal.plaid.syncItem, { itemId });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      cursor: "initial-cursor",
      status: "error",
      error: "Reconnect this bank to restore access.",
    });
    expect(
      (await t.run((ctx) => ctx.db.query("accounts").collect()))[0]
        .balanceCents,
    ).toBe(550000);
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(0);
  });
});

describe("anonymous bank access boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  test("blocks new/update Link, exchange, and sync before any provider request even if the profile says personal", async () => {
    const { t, userId, itemId, asUser } = await fixture();
    await t.run((ctx) => ctx.db.patch(userId, { isAnonymous: true }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const mode of ["transactions", "investments"] as const) {
      await expect(
        asUser.action(api.plaid.createLinkToken, { mode }),
      ).rejects.toThrow("Create an account");
      await expect(
        asUser.action(api.plaid.createLinkToken, { mode, itemId }),
      ).rejects.toThrow("Create an account");
    }
    await expect(
      asUser.action(api.plaid.exchangePublicToken, {
        publicToken: "fictional-public-token",
      }),
    ).rejects.toThrow("Create an account");
    await expect(asUser.action(api.plaid.sync, { itemId })).rejects.toThrow(
      "Create an account",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("blocks storing or refreshing a live Item after the user becomes anonymous", async () => {
    const { t, userId, itemId, sync } = await fixture();
    await t.run((ctx) => ctx.db.patch(userId, { isAnonymous: true }));
    await expect(
      t.mutation(internal.plaidInternal.saveItem, {
        userId,
        plaidItemId: "other-fictional-item",
        accessToken: "fictional-token",
        institutionId: "other-institution",
        institution: "Other bank",
        products: ["transactions"],
        environment: "sandbox",
      }),
    ).rejects.toThrow("Create an account");
    await expect(
      t.mutation(internal.plaidInternal.heartbeat, sync),
    ).rejects.toThrow("Create an account");
    await t.run((ctx) => ctx.db.patch(itemId, { syncLease: undefined }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(t.action(internal.plaid.syncItem, { itemId })).rejects.toThrow(
      "Create an account",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await t.run((ctx) => ctx.db.query("plaidItems").collect()),
    ).toHaveLength(1);
  });
});

describe("PLAID_ALLOWED_EMAILS", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function configure(allowed?: string) {
    vi.stubEnv("PLAID_CLIENT_ID", "fictional-client");
    vi.stubEnv("PLAID_SECRET", "fictional-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");
    if (allowed !== undefined) vi.stubEnv("PLAID_ALLOWED_EMAILS", allowed);
  }
  test("keeps Plaid open to everyone when the allowlist is unset", async () => {
    configure();
    const { asUser, asOther } = await fixture();
    expect(await asUser.query(api.plaid.status, {})).toMatchObject({
      configured: true,
      restricted: false,
    });
    expect(await asOther.query(api.plaid.status, {})).toMatchObject({
      configured: true,
      restricted: false,
    });
  });
  test("reports Plaid unavailable and refuses new links for emails outside the list", async () => {
    configure(" Sample@Example.test , owner@example.test ");
    const { t, userId, otherUserId, asUser, asOther, itemId } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
      await ctx.db.patch(otherUserId, { emailVerificationTime: Date.now() });
    });
    expect(await asUser.query(api.plaid.status, {})).toMatchObject({
      configured: true,
      restricted: false,
    });
    expect(await asOther.query(api.plaid.status, {})).toMatchObject({
      configured: false,
      restricted: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      asOther.action(api.plaid.createLinkToken, { mode: "transactions" }),
    ).rejects.toThrow("SimpleFIN");
    await expect(
      asOther.action(api.plaid.exchangePublicToken, {
        publicToken: "fictional-public-token",
      }),
    ).rejects.toThrow("SimpleFIN");
    expect(fetchMock).not.toHaveBeenCalled();
    // An allowed household member still syncs and links; sync ignores the list.
    await expect(asUser.action(api.plaid.sync, { itemId })).resolves.toBeNull();
  });
  test("an unverified allowlisted email cannot link or exchange tokens", async () => {
    configure(" Sample@Example.test ");
    const { t, userId, asUser, itemId } = await fixture();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await asUser.query(api.plaid.status, {})).toMatchObject({
      configured: false,
      restricted: true,
    });
    await expect(
      asUser.action(api.plaid.createLinkToken, { mode: "transactions" }),
    ).rejects.toThrow("SimpleFIN");
    await expect(
      asUser.action(api.plaid.createLinkToken, {
        mode: "transactions",
        itemId,
      }),
    ).rejects.toThrow("SimpleFIN");
    await expect(
      asUser.action(api.plaid.exchangePublicToken, {
        publicToken: "fictional-public-token",
      }),
    ).rejects.toThrow("SimpleFIN");
    expect(fetchMock).not.toHaveBeenCalled();
    // Existing data and revocation remain available without a new consent flow.
    await expect(asUser.action(api.plaid.sync, { itemId })).resolves.toBeNull();
    await expect(
      t.mutation(internal.plaidInternal.disconnectStart, { userId, itemId }),
    ).resolves.toMatchObject({ userId });
  });
  test("verified allowlisted users can create a Link token", async () => {
    configure(" Sample@Example.test ");
    const { t, userId, asUser } = await fixture();
    await t.run((ctx) =>
      ctx.db.patch(userId, { emailVerificationTime: Date.now() }),
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            link_token: "fictional-link-token",
            expiration: "2026-09-13T00:00:00Z",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      asUser.action(api.plaid.createLinkToken, { mode: "transactions" }),
    ).resolves.toMatchObject({ linkToken: "fictional-link-token" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("webhook verification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  async function signedWebhook(ageSeconds = 0, expired = false) {
    vi.stubEnv("PLAID_CLIENT_ID", "fictional-client");
    vi.stubEnv("PLAID_SECRET", "fictional-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              key: {
                ...jwk,
                alg: "ES256",
                kid: "sample-webhook-key",
                expired_at: expired ? 1 : null,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const body = '{"webhook_type":"TRANSACTIONS","item_id":"fictional-item"}';
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body),
    );
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const jwt = await new SignJWT({ request_body_sha256: hash })
      .setProtectedHeader({ alg: "ES256", kid: "sample-webhook-key" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - ageSeconds)
      .sign(privateKey);
    return { body, jwt };
  }
  test("accepts a valid signature only for the exact original request bytes", async () => {
    const { body, jwt } = await signedWebhook();
    expect(await verifyWebhook(jwt, body)).toBe(true);
    expect(await verifyWebhook(jwt, `${body}\n`)).toBe(false);
    expect(
      await verifyWebhook(
        jwt,
        body.replace("fictional-item", "different-item"),
      ),
    ).toBe(false);
  });
  test("rejects stale and future signatures and expired verification keys", async () => {
    for (const age of [301, -60]) {
      const { body, jwt } = await signedWebhook(age);
      expect(await verifyWebhook(jwt, body)).toBe(false);
    }
    const { body, jwt } = await signedWebhook(0, true);
    expect(await verifyWebhook(jwt, body)).toBe(false);
  });
  test("rejects malformed tokens and unsupported algorithms without fetching keys", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", kid: "sample-key" })
      .sign(
        new TextEncoder().encode("fictional-key-long-enough-for-this-fixture"),
      );
    expect(await verifyWebhook(jwt, "{}")).toBe(false);
    expect(await verifyWebhook("not-a-jwt", "{}")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("provider normalization", () => {
  const account: PlaidAccount = {
    account_id: "sample-investment",
    name: "Sample IRA",
    official_name: null,
    mask: "0000",
    type: "investment",
    subtype: "ira",
    balances: {
      current: 12345.67,
      available: null,
      limit: null,
      iso_currency_code: "USD",
    },
  };
  const transaction: PlaidTransaction = {
    transaction_id: "sample-refund",
    pending_transaction_id: null,
    account_id: "sample-account",
    date: "2026-09-10",
    amount: -19.99,
    name: "SAMPLE REFUND",
    merchant_name: null,
    pending: false,
    iso_currency_code: "USD",
  };
  test("includes IRA account balances without inventing unavailable statement fields", () => {
    expect(normalizeAccount(account)).toEqual({
      accountId: "sample-investment",
      name: "Sample IRA",
      mask: "0000",
      kind: "investment",
      subtype: "ira",
      balanceCents: 1234567,
      currency: "USD",
    });
  });
  test("keeps signed refunds and rejects unsupported currencies or unavailable balances", () => {
    expect(normalizeTransaction(transaction).amountCents).toBe(-1999);
    expect(() =>
      normalizeTransaction({ ...transaction, iso_currency_code: "EUR" }),
    ).toThrow("USD");
    expect(() =>
      normalizeAccount({
        ...account,
        balances: { ...account.balances, current: null },
      }),
    ).toThrow("unavailable");
    expect(() =>
      normalizeAccount({
        ...account,
        balances: { ...account.balances, iso_currency_code: "EUR" },
      }),
    ).toThrow("USD");
  });
});

describe("connecting an imported manual account", () => {
  test("a unique full match keeps the account ID and adopts its imported transaction", async () => {
    const { t, asUser, sync, userId } = await fixture();
    const prepared = await asUser.mutation(api.imports.prepareDestinations, {
      accounts: [
        { name: "Travel Visa (...1234)", kind: "credit", closed: false },
      ],
      categories: [{ name: "Hotels", kind: "expense", emoji: "🏨" }],
    });
    const accountId = prepared.accounts[0]._id;
    await asUser.mutation(api.transactions.importMapped, {
      rows: [
        {
          key: "e".repeat(64),
          accountId,
          categoryId: prepared.categories[0]._id,
          categoryMatched: true,
          merchantName: "Sample Diner",
          date: "2026-09-09",
          amountCents: 1000,
          originalName: "SAMPLE DINER",
          notes: "Keep historical notes",
          reviewed: true,
        },
      ],
    });
    const before = await t.run((ctx) =>
      ctx.db
        .query("transactions")
        .withIndex("by_userId_and_accountId_and_date", (q) =>
          q.eq("userId", userId).eq("accountId", accountId),
        )
        .first(),
    );
    await t.mutation(internal.plaidInternal.updateAccounts, {
      ...sync,
      accounts: [
        {
          accountId: "imported-visa",
          name: "Travel Visa",
          mask: "1234",
          kind: "credit",
          subtype: "credit card",
          balanceCents: 35000,
          currency: "USD",
        },
      ],
    });
    expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({
      manual: false,
      plaidAccountId: "imported-visa",
      name: "Travel Visa (...1234)",
      balanceCents: 35000,
    });
    await t.mutation(internal.plaidInternal.ingestTransactions, {
      ...sync,
      transactions: [
        { ...incoming, accountId: "imported-visa", pending: false },
      ],
    });
    const after = await t.run((ctx) => ctx.db.get(before!._id));
    expect(after).toMatchObject({
      source: "plaid",
      notes: "Keep historical notes",
      reviewed: true,
      accountId,
    });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("transactions")
          .withIndex("by_userId_and_accountId_and_date", (q) =>
            q.eq("userId", userId).eq("accountId", accountId),
          )
          .collect(),
      ),
    ).toHaveLength(1);
  });
  test("closed accounts and ambiguous incoming matches are not automatically connected", async () => {
    const { t, asUser, sync } = await fixture();
    const prepared = await asUser.mutation(api.imports.prepareDestinations, {
      accounts: [
        { name: "Travel Visa (...1234)", kind: "credit", closed: true },
        { name: "Active Visa (...5678)", kind: "credit", closed: false },
      ],
      categories: [],
    });
    const bank = {
      name: "Active Visa",
      mask: "5678",
      kind: "credit" as const,
      subtype: "credit card",
      balanceCents: 0,
      currency: "USD",
    };
    await t.mutation(internal.plaidInternal.updateAccounts, {
      ...sync,
      accounts: [
        { ...bank, accountId: "new-1" },
        { ...bank, accountId: "new-2" },
        {
          ...bank,
          name: "Travel Visa",
          mask: "1234",
          accountId: "closed-match",
        },
      ],
    });
    for (const account of prepared.accounts)
      expect(await t.run((ctx) => ctx.db.get(account._id))).toMatchObject({
        manual: true,
      });
  });
});
