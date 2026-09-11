/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHmac } from "node:crypto";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  normalizeSophtronAccount,
  normalizeSophtronTransactions,
  previewSophtronAccount,
  sophtronAuthorization,
  sophtronConfiguration,
  sophtronError,
  sophtronRequest,
  SophtronFailure,
  type SophtronConfig,
} from "./lib/sophtronApi";

const modules = import.meta.glob("./**/*.ts");
const ids = {
  apiUser: "00000000-0000-0000-0000-000000000001",
  customer: "00000000-0000-0000-0000-000000000002",
  member: "00000000-0000-0000-0000-000000000003",
  account: "00000000-0000-0000-0000-000000000004",
  transaction: "00000000-0000-0000-0000-000000000005",
  other: "00000000-0000-0000-0000-000000000006",
};
const accessKey = btoa("fictional-sophtron-test-key-only");
const config: SophtronConfig = {
  apiUserId: ids.apiUser,
  customerId: ids.customer,
  accessKey,
  ownerUserId: "fixture",
  environment: "production",
};
const account = {
  userID: ids.apiUser,
  id: ids.account,
  accountID: ids.account,
  memberID: ids.member,
  accountName: "Fixture checking",
  accountType: "Checking",
  balance: 1234.56,
  availableBalance: 1100,
  balanceCurrency: "USD",
  accountNumber: "1234567890",
  lastUpdated: "2026-09-10T18:00:00Z",
  status: "Tracked",
};
const transaction = {
  userID: ids.apiUser,
  transactionID: ids.transaction,
  userInstitutionAccountID: ids.account,
  status: "Posted",
  type: "DEBIT",
  amount: 10,
  currency: "USD",
  date: "2026-09-08T12:00:00Z",
  description: "FICTIONAL CAFE",
  merchant: "Fictional Cafe",
  category: "Food",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "sophtron-fixture@example.test",
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "other-fixture@example.test",
    });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Fictional owner",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    await ctx.db.insert("profiles", {
      userId: otherUserId,
      name: "Fictional other",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    return { userId, otherUserId, profileId };
  });
  vi.stubEnv("SOPHTRON_USER_ID", ids.apiUser);
  vi.stubEnv("SOPHTRON_ACCESS_KEY", accessKey);
  vi.stubEnv("SOPHTRON_CUSTOMER_ID", ids.customer);
  vi.stubEnv("SOPHTRON_OWNER_USER_ID", seeded.userId);
  vi.stubEnv("SOPHTRON_ENV", "production");
  const remote = {
    accounts: [structuredClone(account)],
    transactions: [structuredClone(transaction)],
  };
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/transactions"))
      return Response.json(remote.transactions);
    if (path.endsWith("/accounts")) return Response.json(remote.accounts);
    if (path.endsWith("/members"))
      return Response.json([
        { userID: ids.apiUser, memberID: ids.member, customerID: ids.customer },
      ]);
    if (path.endsWith(ids.customer))
      return Response.json({ userID: ids.apiUser, customerID: ids.customer });
    throw new Error("Unexpected fixture route");
  });
  vi.stubGlobal("fetch", fetcher);
  const asUser = t.withIdentity({ subject: seeded.userId });
  const asOther = t.withIdentity({ subject: seeded.otherUserId });
  const importArgs = {
    accounts: [{ externalAccountId: ids.account }],
    fromDate: "2026-09-01",
  };
  return { t, ...seeded, asUser, asOther, remote, fetcher, importArgs };
}

describe("Sophtron normalization", () => {
  test("uses current balance, masks full numbers, and requires explicit currency and liability signs", () => {
    const preview = previewSophtronAccount(account);
    expect(preview).toMatchObject({
      mask: "7890",
      balanceCents: 123456,
      kind: "cash",
    });
    expect(JSON.stringify(preview)).not.toContain("1234567890");
    const selection = { externalAccountId: ids.account };
    expect(normalizeSophtronAccount(account, selection)).toMatchObject({
      balanceCents: 123456,
      availableCents: 110000,
    });
    expect(() =>
      normalizeSophtronAccount({ ...account, balanceCurrency: "$" }, selection),
    ).toThrow("US dollars");
    expect(() =>
      normalizeSophtronAccount(
        { ...account, balanceCurrency: "CAD" },
        { ...selection, confirmUsd: true },
      ),
    ).toThrow("USD");
    const credit = { ...account, accountType: "CreditCard", balance: -250 };
    expect(() => normalizeSophtronAccount(credit, selection)).toThrow(
      "positive or negative",
    );
    expect(
      normalizeSophtronAccount(credit, { ...selection, debtSign: "negative" })
        .balanceCents,
    ).toBe(25000);
    expect(
      normalizeSophtronAccount(
        { ...credit, balance: 25 },
        { ...selection, debtSign: "negative" },
      ).balanceCents,
    ).toBe(-2500);
    const normalized = normalizeSophtronAccount(
      {
        ...account,
        dueDate: "2026-09-25T00:00:00Z",
        creditCardData: { totalCreditLine: 5000 },
      },
      selection,
    );
    expect(normalized.dueDate).toBe("2026-09-25");
    expect(normalized).not.toHaveProperty("statementCents");
    expect(normalized).not.toHaveProperty("minimumCents");
  });
  test("requires posted status and known direction, keeps refund signs, and checks every transaction owner", () => {
    const normalized = normalizeSophtronAccount(account, {
      externalAccountId: ids.account,
    });
    const result = normalizeSophtronTransactions(
      [
        transaction,
        {
          ...transaction,
          transactionID: ids.other,
          type: "CREDIT",
          amount: -2.34,
        },
        { ...transaction, status: "Pending" },
        { ...transaction, status: undefined },
        { ...transaction, type: undefined },
        { ...transaction, currency: "EUR" },
      ],
      config,
      normalized,
      "2026-09-01",
      "2026-09-30",
    );
    expect(result.transactions.map((row) => row.amountCents)).toEqual([
      1000, -234,
    ]);
    expect(result).toMatchObject({ skippedPending: 1, skippedUnsupported: 3 });
    expect(() =>
      normalizeSophtronTransactions(
        [{ ...transaction, userInstitutionAccountID: ids.other }],
        config,
        normalized,
        "2026-09-01",
        "2026-09-30",
      ),
    ).toThrow("OWNERSHIP");
    expect(() =>
      normalizeSophtronTransactions(
        [{ ...transaction, userID: ids.other }],
        config,
        normalized,
        "2026-09-01",
        "2026-09-30",
      ),
    ).toThrow("OWNERSHIP");
  });
  test("implements official HMAC and keeps credentials on a constrained server request", async () => {
    const path = `/api/v2/customers/${ids.customer}/accounts`;
    const digest = createHmac("sha256", Buffer.from(accessKey, "base64"))
      .update("GET\n/accounts")
      .digest("base64");
    expect(await sophtronAuthorization(path, config)).toBe(
      `FIApiAUTH:${ids.apiUser}:${digest}:/accounts`,
    );
    const fetcher = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetcher);
    await sophtronRequest(config, path);
    expect(fetcher).toHaveBeenCalledWith(
      `https://api.sophtron.com${path}`,
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
    await expect(
      sophtronRequest(config, "https://example.test/steal"),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      sophtronError(new Error(`private response ${accessKey}`)),
    ).not.toContain(accessKey);
    expect(sophtronError(new SophtronFailure("AUTH"))).toContain(
      "server credentials",
    );
    expect(sophtronConfiguration({ SOPHTRON_USER_ID: ids.apiUser })).toBeNull();
  });
});
describe("Sophtron owned imports", () => {
  test("unconfigured, other-owner, and demo calls cannot reach provider data", async () => {
    const { t, asUser, asOther, profileId, fetcher } = await fixture();
    expect(await asUser.query(api.sophtron.status, {})).toMatchObject({
      configured: true,
      availableToUser: true,
    });
    expect(await asOther.query(api.sophtron.status, {})).toMatchObject({
      configured: true,
      availableToUser: false,
      connection: null,
    });
    await expect(asOther.action(api.sophtron.preview, {})).rejects.toThrow(
      "another Marten user",
    );
    await t.run((ctx) => ctx.db.patch(profileId, { demo: true }));
    await expect(asUser.action(api.sophtron.preview, {})).rejects.toThrow(
      "personal workspace",
    );
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("SOPHTRON_ACCESS_KEY", "");
    expect(await asUser.query(api.sophtron.status, {})).toMatchObject({
      configured: false,
      availableToUser: false,
    });
  });
  test("rejects a customer mismatch before any financial writes and sanitizes previews", async () => {
    const { t, asUser, remote, importArgs } = await fixture();
    const preview = await asUser.action(api.sophtron.preview, {});
    expect(preview).toMatchObject({ complete: true, historyComplete: false });
    expect(JSON.stringify(preview)).not.toContain(accessKey);
    expect(JSON.stringify(preview)).not.toContain(ids.apiUser);
    remote.accounts[0].memberID = ids.other;
    await expect(
      asUser.action(api.sophtron.importAccounts, importArgs),
    ).rejects.toThrow("configured customer");
    expect(
      await t.run((ctx) => ctx.db.query("accounts").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(0);
  });
  test("retries keep annotations, receipts and identity while amount corrections retain split allocations", async () => {
    const { t, asUser, userId, remote, importArgs } = await fixture();
    const first = await asUser.action(api.sophtron.importAccounts, importArgs);
    expect(first).toMatchObject({
      imported: 1,
      updated: 0,
      historyComplete: false,
    });
    const row = (
      await t.run((ctx) => ctx.db.query("transactions").collect())
    )[0];
    await asUser.mutation(api.transactions.update, {
      id: row._id,
      patch: {
        notes: "Preserve this annotation",
        reviewed: true,
        hidden: true,
        splits: [
          { categoryId: row.categoryId, amountCents: 600 },
          { categoryId: row.categoryId, amountCents: 400 },
        ],
      },
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["fictional receipt"], { type: "application/pdf" }),
      ),
    );
    const attachmentId = await t.mutation(internal.transactions.attachStored, {
      userId,
      transactionId: row._id,
      storageId,
      name: "fictional.pdf",
      contentType: "application/pdf",
      size: 17,
    });
    remote.transactions[0].amount = 15;
    const second = await asUser.action(api.sophtron.sync, {});
    expect(second).toMatchObject({ imported: 0, updated: 1 });
    const rows = await t.run((ctx) => ctx.db.query("transactions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      _id: row._id,
      source: "sophtron",
      notes: "Preserve this annotation",
      hidden: true,
      reviewed: false,
      amountCents: 1500,
      splits: [],
      splitDraft: [
        { categoryId: row.categoryId, amountCents: 600 },
        { categoryId: row.categoryId, amountCents: 400 },
      ],
    });
    expect(await t.run((ctx) => ctx.db.get(attachmentId))).toMatchObject({
      transactionId: row._id,
    });
    await expect(
      asUser.mutation(api.transactions.update, {
        id: row._id,
        patch: { date: "2026-09-09" },
      }),
    ).rejects.toThrow("managed by your connection");
    await expect(
      asUser.mutation(api.transactions.remove, { id: row._id }),
    ).rejects.toThrow("Hide a bank transaction");
    remote.transactions = [];
    await asUser.action(api.sophtron.sync, {});
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(1);
    expect(
      (await asUser.query(api.sophtron.status, {})).connection?.warning,
    ).toContain("does not confirm complete history");
  });
  test("manual account cutover prevents duplicate history and cross-owner mappings", async () => {
    const { t, asUser, asOther, importArgs } = await fixture();
    const fields = {
      name: "Existing checking",
      institution: "Fictional Bank",
      mask: "7890",
      kind: "cash" as const,
      subtype: "checking",
      balanceCents: 2000,
      currency: "USD",
      hidden: false,
      excludeNetWorth: false,
      closed: false,
    };
    const otherAccount = await asOther.mutation(
      api.workspace.saveAccount,
      fields,
    );
    await expect(
      asUser.action(api.sophtron.importAccounts, {
        ...importArgs,
        accounts: [
          { externalAccountId: ids.account, targetAccountId: otherAccount },
        ],
      }),
    ).rejects.toThrow("unavailable");
    const target = await asUser.mutation(api.workspace.saveAccount, fields);
    await asUser.action(api.sophtron.importAccounts, importArgs);
    const row = (
      await t.run((ctx) => ctx.db.query("transactions").collect())
    )[0];
    // A fictional existing CSV row represents history imported before this provider.
    await t.run((ctx) =>
      ctx.db.insert("transactions", {
        userId: row.userId,
        accountId: target,
        merchantId: row.merchantId,
        categoryId: row.categoryId,
        date: "2026-09-07",
        amountCents: 1000,
        originalName: "Existing CSV",
        notes: "",
        tagIds: [],
        reviewed: true,
        hidden: false,
        pending: false,
        splits: [],
        source: "csv",
        searchText: "existing",
        updatedAt: Date.now(),
        editedFields: [],
      }),
    );
    // Use a separate provider ID so this tests the mapping cutover rather than same-account identity.
    const { connection } = await asUser.query(api.sophtron.status, {});
    if (!connection) throw new Error("Expected fixture connection");
    await asUser.mutation(api.sophtron.disconnect, {
      connectionId: connection._id,
    });
    const live = await t.run((ctx) => ctx.db.get(connection._id));
    const incoming = normalizeSophtronAccount(
      { ...account, accountID: ids.other },
      { externalAccountId: ids.other },
    );
    const args = {
      userId: row.userId,
      reconnect: true,
      expectedVersion: live!.syncVersion,
      accounts: [
        {
          selection: { externalAccountId: ids.other, targetAccountId: target },
          account: incoming,
          fromDate: "2026-09-01",
        },
      ],
    };
    await expect(
      t.mutation(internal.sophtronInternal.begin, args),
    ).rejects.toThrow("after 2026-09-07");
    const begun = await t.mutation(internal.sophtronInternal.begin, {
      ...args,
      accounts: [{ ...args.accounts[0], fromDate: "2026-09-08" }],
    });
    expect(begun.mappings[0].accountId).toBe(target);
    expect(await t.run((ctx) => ctx.db.get(target))).toMatchObject({
      name: "Existing checking",
      institution: "Fictional Bank",
      manual: false,
      sophtronAccountId: ids.other,
    });
  });
  test("stopping imports fences both in-flight writes and requests still fetching remote data", async () => {
    const { t, asUser, asOther, userId, importArgs } = await fixture();
    await asUser.action(api.sophtron.importAccounts, importArgs);
    const connection = (await asUser.query(api.sophtron.status, {}))
      .connection!;
    const before = await t.run((ctx) => ctx.db.get(connection._id));
    await expect(
      asOther.mutation(api.sophtron.disconnect, {
        connectionId: connection._id,
      }),
    ).rejects.toThrow("unavailable");
    await asUser.mutation(api.sophtron.disconnect, {
      connectionId: connection._id,
    });
    const prepared = {
      selection: { externalAccountId: ids.account },
      account: normalizeSophtronAccount(account, {
        externalAccountId: ids.account,
      }),
      fromDate: "2026-09-01",
    };
    await expect(
      t.mutation(internal.sophtronInternal.begin, {
        userId,
        accounts: [prepared],
        reconnect: true,
        expectedVersion: before!.syncVersion,
      }),
    ).rejects.toThrow("changed while its data was loading");
    await expect(asUser.action(api.sophtron.sync, {})).rejects.toThrow(
      "Review and import",
    );
    const stopped = await t.run((ctx) => ctx.db.get(connection._id));
    const begin = await t.mutation(internal.sophtronInternal.begin, {
      userId,
      accounts: [prepared],
      reconnect: true,
      expectedVersion: stopped!.syncVersion,
    });
    await asUser.mutation(api.sophtron.disconnect, {
      connectionId: connection._id,
    });
    await expect(
      t.mutation(internal.sophtronInternal.ingest, {
        connectionId: begin.connectionId,
        version: begin.version,
        accountId: begin.mappings[0].accountId,
        transactions: [],
      }),
    ).rejects.toThrow("stopped or superseded");
    expect(
      await t.run((ctx) => ctx.db.query("accounts").collect()),
    ).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(1);
  });
  test("a full workspace cannot be pushed past its readable account limit", async () => {
    const { t, asUser, userId, importArgs, remote } = await fixture();
    await asUser.action(api.sophtron.importAccounts, importArgs);
    await t.run(async (ctx) => {
      for (let index = 1; index < 200; index++)
        await ctx.db.insert("accounts", {
          userId,
          name: `Fictional account ${index}`,
          institution: "Manual",
          mask: "",
          kind: "cash",
          subtype: "checking",
          balanceCents: 0,
          currency: "USD",
          hidden: false,
          excludeNetWorth: false,
          closed: false,
          manual: true,
          updatedAt: Date.now(),
        });
    });
    remote.accounts.push({ ...account, id: ids.other, accountID: ids.other });
    remote.transactions = [];
    await expect(
      asUser.action(api.sophtron.importAccounts, {
        ...importArgs,
        accounts: [{ externalAccountId: ids.other }],
      }),
    ).rejects.toThrow("200 accounts");
    expect(
      await t.run((ctx) => ctx.db.query("accounts").collect()),
    ).toHaveLength(200);
  });
});
