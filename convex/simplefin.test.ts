/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  decimalCents,
  decodeSetupToken,
  guessKind,
  importWindows,
  normalizeSimplefinAccount,
  normalizeSimplefinTransactions,
  parseAccessUrl,
  parseAccountSet,
  simplefinError,
  SimplefinFailure,
  unixDate,
} from "./lib/simplefinApi";

const modules = import.meta.glob("./**/*.ts");
const bridge = "https://bridge.example.org/simplefin";
const accessUrl =
  "https://fixture-user:fixture-secret@bridge.example.org/simplefin";
const claimUrl = `${bridge}/claim/FIXTURE-TOKEN`;
const setupToken = btoa(claimUrl);
const day = (date: string) =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
const checking = {
  org: { domain: "bank.example", name: "Fixture Bank", "sfin-url": bridge },
  id: "acct-checking",
  name: "Everyday Checking 4321",
  currency: "USD",
  balance: "1234.56",
  "available-balance": "1100.00",
  "balance-date": day("2026-09-10"),
  transactions: [
    {
      id: "tx-1",
      posted: day("2026-09-08"),
      amount: "-10.00",
      description: "FICTIONAL CAFE",
      payee: "Fictional Cafe",
      pending: false,
      mcc: "5812",
    },
    {
      id: "tx-2",
      posted: day("2026-09-09"),
      amount: "2.34",
      description: "REFUND",
      pending: false,
    },
    {
      id: "tx-3",
      posted: day("2026-09-10"),
      amount: "-5.00",
      description: "PENDING COFFEE",
      pending: true,
    },
  ],
};
const card = {
  org: { domain: "bank.example", name: "Fixture Bank" },
  id: "acct-card",
  name: "Venture Card 9876",
  currency: "USD",
  balance: "-523.10",
  "balance-date": day("2026-09-10"),
  transactions: [],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture(options: { connected?: boolean } = {}) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const seeded = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "simplefin-fixture@example.test",
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
    let connectionId = null;
    if (options.connected !== false)
      connectionId = await ctx.db.insert("simplefinConnections", {
        userId,
        accessUrl,
        host: "bridge.example.org",
        status: "connected",
        syncVersion: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    return { userId, otherUserId, profileId, connectionId };
  });
  const remote = {
    accounts: [structuredClone(checking), structuredClone(card)],
    errors: [] as string[],
    claims: 0,
  };
  const requests: URL[] = [];
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.href === claimUrl && init?.method === "POST") {
        remote.claims++;
        return remote.claims === 1
          ? new Response(accessUrl, { status: 200 })
          : new Response("claimed", { status: 403 });
      }
      if (url.pathname.endsWith("/accounts")) {
        const auth = init?.headers as Record<string, string>;
        if (
          auth?.Authorization !== `Basic ${btoa("fixture-user:fixture-secret")}`
        )
          return new Response("nope", { status: 403 });
        const ids = url.searchParams.getAll("account");
        const start = Number(url.searchParams.get("start-date") ?? 0);
        const end = Number(url.searchParams.get("end-date") ?? Infinity);
        const balancesOnly = url.searchParams.get("balances-only") === "1";
        return Response.json({
          errors: remote.errors,
          accounts: remote.accounts
            .filter((account) => !ids.length || ids.includes(account.id))
            .map((account) => ({
              ...account,
              transactions: balancesOnly
                ? []
                : account.transactions.filter(
                    (tx) => tx.posted >= start && tx.posted < end,
                  ),
            })),
        });
      }
      throw new Error("Unexpected fixture route");
    },
  );
  vi.stubGlobal("fetch", fetcher);
  const asUser = t.withIdentity({ subject: seeded.userId });
  const asOther = t.withIdentity({ subject: seeded.otherUserId });
  const importArgs = {
    accounts: [{ externalAccountId: "acct-checking", kind: "cash" as const }],
    fromDate: "2026-09-01",
  };
  return {
    t,
    ...seeded,
    asUser,
    asOther,
    remote,
    fetcher,
    requests,
    importArgs,
  };
}

describe("SimpleFIN protocol helpers", () => {
  test("reads optional category hints and accepts only complete merchant codes", () => {
    const hints = [
      { mcc: 5411 },
      { extra: { mcc: "5541" } },
      { extra: { category: "Coffee" } },
      { category: "Groceries" },
      { mcc: "541199" },
      { extra: ["Groceries"] },
      {},
    ];
    const account = parseAccountSet({
      accounts: [
        {
          ...checking,
          transactions: hints.map((hint, i) => ({
            id: `hint-${i}`,
            posted: day("2026-09-08"),
            amount: "-10.00",
            description: "Fictional purchase",
            ...hint,
          })),
        },
      ],
    }).accounts[0];
    expect(
      normalizeSimplefinTransactions(
        account,
        "2026-09-01",
        "2026-09-30",
      ).transactions.map((tx) => tx.category),
    ).toEqual(["Groceries", "Fuel", "Coffee", "Groceries", "", "", ""]);
  });

  test("decodes setup tokens, splits access URLs, and refuses unsafe hosts", () => {
    expect(decodeSetupToken(` ${setupToken} `)).toBe(claimUrl);
    expect(() => decodeSetupToken("not base64!!")).toThrow("SETUP_TOKEN");
    expect(() => decodeSetupToken(btoa("http://bridge.example.org/x"))).toThrow(
      "SETUP_TOKEN",
    );
    expect(() => decodeSetupToken(btoa("https://localhost/claim"))).toThrow(
      "SETUP_TOKEN",
    );
    expect(() => decodeSetupToken(btoa("https://10.0.0.1/claim"))).toThrow(
      "SETUP_TOKEN",
    );
    const parsed = parseAccessUrl(accessUrl);
    expect(parsed).toEqual({
      base: bridge,
      authorization: `Basic ${btoa("fixture-user:fixture-secret")}`,
      host: "bridge.example.org",
    });
    expect(() =>
      parseAccessUrl("https://bridge.example.org/simplefin"),
    ).toThrow("INVALID_RESPONSE");
    expect(simplefinError(new SimplefinFailure("CLAIMED"))).toContain(
      "already used",
    );
    expect(simplefinError(new Error(`private ${accessUrl}`))).not.toContain(
      "fixture-secret",
    );
  });
  test("parses decimals, dates, windows, kinds, and signed balances", () => {
    expect(decimalCents("-12.30")).toBe(-1230);
    expect(decimalCents("0.005")).toBe(1);
    expect(decimalCents("+100")).toBe(10000);
    expect(decimalCents(7.5)).toBe(750);
    expect(() => decimalCents("12,30")).toThrow("INVALID_RESPONSE");
    expect(unixDate(day("2026-02-28"))).toBe("2026-02-28");
    expect(unixDate("nope")).toBeUndefined();
    expect(importWindows("2026-01-01", "2026-01-01")).toEqual([
      { from: "2026-01-01", to: "2026-01-01" },
    ]);
    expect(importWindows("2026-01-01", "2026-07-19")).toHaveLength(5);
    expect(importWindows("2026-01-01", "2026-07-19").at(-1)).toEqual({
      from: "2026-06-30",
      to: "2026-07-19",
    });
    expect(guessKind({ name: "Roth IRA", holdings: 0 })).toBe("investment");
    expect(guessKind({ name: "Anything", holdings: 3 })).toBe("investment");
    expect(guessKind({ name: "Demo Savings", holdings: 1 })).toBe("cash");
    expect(guessKind({ name: "Venture X", holdings: 0 })).toBe("credit");
    expect(guessKind({ name: "Home Mortgage", holdings: 0 })).toBe("loan");
    expect(guessKind({ name: "360 Checking", holdings: 0 })).toBe("cash");
    // Cash-back card names must not read as cash accounts.
    expect(
      guessKind({ name: "Blue Cash Everyday® (4008)", holdings: 0 }),
    ).toBe("credit");
    expect(guessKind({ name: "Double Cash", holdings: 0 })).toBe("credit");
    expect(guessKind({ name: "Aeroplan (5566)", holdings: 0 })).toBe("credit");
    expect(
      guessKind({ name: "Cash Management (Individual)", holdings: 0 }),
    ).toBe("cash");
    expect(guessKind({ name: "Platinum Savings", holdings: 0 })).toBe("cash");
    expect(guessKind({ name: "Freedom Checking", holdings: 0 })).toBe("cash");
    expect(
      guessKind({ name: "Navy Federal Credit Union Checking", holdings: 0 }),
    ).toBe("cash");
    expect(
      guessKind({ name: "Line of Credit", holdings: 0, balanceCents: -50000 }),
    ).toBe("loan");
    // Card issuers and owed balances settle names that say nothing.
    expect(
      guessKind({
        name: "Everyday (4008)",
        holdings: 0,
        institution: "American Express",
      }),
    ).toBe("credit");
    expect(
      guessKind({ name: "Rewards (1234)", holdings: 0, balanceCents: -21045 }),
    ).toBe("credit");
    expect(
      guessKind({ name: "Rewards (1234)", holdings: 0, balanceCents: 21045 }),
    ).toBe("cash");
    const set = parseAccountSet({
      errors: ["Fixture Bank needs re-authentication"],
      accounts: [checking, { ...card, balance: "abc" }],
    });
    expect(set.errors).toEqual(["Fixture Bank needs re-authentication"]);
    expect(set.accounts[1].balanceCents).toBeNull();
    const [parsedChecking] = set.accounts;
    expect(
      normalizeSimplefinAccount(parsedChecking, {
        externalAccountId: "acct-checking",
        kind: "cash",
      }),
    ).toMatchObject({
      mask: "4321",
      balanceCents: 123456,
      availableCents: 110000,
      institution: "Fixture Bank",
    });
    const parsedCard = parseAccountSet({ accounts: [card] }).accounts[0];
    expect(
      normalizeSimplefinAccount(parsedCard, {
        externalAccountId: "acct-card",
        kind: "credit",
      }).balanceCents,
    ).toBe(52310);
    expect(() =>
      normalizeSimplefinAccount(
        { ...parsedCard, currency: "CAD" },
        { externalAccountId: "acct-card", kind: "credit" },
      ),
    ).toThrow("USD");
    const result = normalizeSimplefinTransactions(
      parsedChecking,
      "2026-09-01",
      "2026-09-08",
    );
    expect(result.transactions).toEqual([
      {
        externalId: "tx-1",
        externalAccountId: "acct-checking",
        date: "2026-09-08",
        amountCents: 1000,
        name: "FICTIONAL CAFE",
        merchant: "Fictional Cafe",
        category: "Restaurants",
      },
    ]);
    expect(result.skippedPending).toBe(1);
    expect(
      normalizeSimplefinTransactions(
        parsedChecking,
        "2026-09-01",
        "2026-09-30",
      ).transactions.map((row) => row.amountCents),
    ).toEqual([1000, -234]);
  });
});
describe("SimpleFIN connections", () => {
  test("claims a token once, seals the access URL, and never returns it", async () => {
    const { t, asUser, asOther, profileId, remote } = await fixture({
      connected: false,
    });
    vi.stubEnv(
      "CREDENTIALS_KEY",
      btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
    );
    expect(await asUser.query(api.simplefin.status, {})).toMatchObject({
      availableToUser: true,
      connection: null,
    });
    await expect(
      asUser.action(api.simplefin.connect, { setupToken: "garbage" }),
    ).rejects.toThrow("setup token");
    const connected = await asUser.action(api.simplefin.connect, {
      setupToken,
    });
    expect(connected.host).toBe("bridge.example.org");
    expect(connected.preview?.accounts.map((row) => row.kind)).toEqual([
      "cash",
      "credit",
    ]);
    expect(JSON.stringify(connected)).not.toContain("fixture-secret");
    const rows = await t.run((ctx) =>
      ctx.db.query("simplefinConnections").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].accessUrl.startsWith("enc1.")).toBe(true);
    expect(rows[0].accessUrl).not.toContain("fixture-secret");
    const status = await asUser.query(api.simplefin.status, {});
    expect(status.connection).toMatchObject({
      status: "connected",
      sealed: true,
    });
    expect(JSON.stringify(status)).not.toContain("fixture");
    // The same token cannot be claimed twice; the bridge answers 403.
    await expect(
      asUser.action(api.simplefin.connect, { setupToken }),
    ).rejects.toThrow("already used");
    expect(remote.claims).toBe(2);
    // Sealed credentials still authorize live requests.
    const preview = await asUser.action(api.simplefin.preview, {});
    expect(preview.accounts).toHaveLength(2);
    await expect(asOther.action(api.simplefin.preview, {})).rejects.toThrow(
      "Connect SimpleFIN",
    );
    await t.run((ctx) => ctx.db.patch(profileId, { demo: true }));
    await expect(asUser.action(api.simplefin.preview, {})).rejects.toThrow(
      "personal workspace",
    );
    await t.run((ctx) => ctx.db.patch(profileId, { demo: false }));
    vi.stubEnv("CREDENTIALS_KEY", "");
    await expect(asUser.action(api.simplefin.preview, {})).rejects.toThrow(
      "CREDENTIALS_KEY",
    );
  });
  test("rate limits connection attempts", async () => {
    const { asUser } = await fixture();
    for (let attempt = 0; attempt < 10; attempt++)
      await expect(
        asUser.action(api.simplefin.connect, { setupToken: "garbage" }),
      ).rejects.toThrow("setup token");
    await expect(
      asUser.action(api.simplefin.connect, { setupToken: "garbage" }),
    ).rejects.toThrow("Too many");
  });
  test("imports reviewed accounts, then retries keep annotations, receipts and splits", async () => {
    const { t, asUser, userId, remote, importArgs } = await fixture();
    const preview = await asUser.action(api.simplefin.preview, {});
    expect(JSON.stringify(preview)).not.toContain("fixture-secret");
    const first = await asUser.action(api.simplefin.importAccounts, importArgs);
    expect(first).toMatchObject({ accounts: 1, imported: 2, updated: 0 });
    const accounts = await t.run((ctx) => ctx.db.query("accounts").collect());
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      name: "Everyday Checking 4321",
      institution: "Fixture Bank",
      mask: "4321",
      balanceCents: 123456,
      manual: false,
      simplefinAccountId: "acct-checking",
    });
    expect(
      await t.run((ctx) => ctx.db.query("balances").collect()),
    ).toHaveLength(1);
    const row = (
      await t.run((ctx) => ctx.db.query("transactions").collect())
    ).find((tx) => tx.simplefinTransactionId === "tx-1")!;
    expect(row).toMatchObject({ amountCents: 1000, source: "simplefin" });
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
    await t.mutation(internal.transactions.attachStored, {
      userId,
      transactionId: row._id,
      storageId,
      name: "fictional.pdf",
      contentType: "application/pdf",
      size: 17,
    });
    remote.accounts[0].transactions[0].amount = "-15.00";
    remote.accounts[0].balance = "1200.00";
    const second = await asUser.action(api.simplefin.sync, {});
    expect(second).toMatchObject({ imported: 0, updated: 2 });
    const updated = (await t.run((ctx) => ctx.db.get(row._id)))!;
    expect(updated).toMatchObject({
      amountCents: 1500,
      notes: "Preserve this annotation",
      hidden: true,
      reviewed: false,
      splits: [],
      attachmentCount: 1,
    });
    expect(updated.splitDraft?.map((split) => split.amountCents)).toEqual([
      600, 400,
    ]);
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(2);
    expect(
      (await t.run((ctx) => ctx.db.query("accounts").collect()))[0]
        .balanceCents,
    ).toBe(120000);
    const status = await asUser.query(api.simplefin.status, {});
    expect(status.connection).toMatchObject({
      status: "connected",
      accounts: 1,
      toDate: new Date().toISOString().slice(0, 10),
    });
  });
  test("a repeat import re-reads a short overlap and refuses windows older than five years", async () => {
    const { asUser, requests, importArgs } = await fixture();
    await asUser.action(api.simplefin.importAccounts, importArgs);
    requests.length = 0;
    await asUser.action(api.simplefin.sync, {});
    const today = new Date().toISOString().slice(0, 10);
    const overlap = new Date(`${today}T00:00:00Z`);
    overlap.setUTCDate(overlap.getUTCDate() - 5);
    expect(requests[0].searchParams.get("start-date")).toBe(
      String(Math.floor(overlap.getTime() / 1000)),
    );
    expect(requests[0].searchParams.getAll("account")).toEqual([
      "acct-checking",
    ]);
    await expect(
      asUser.action(api.simplefin.importAccounts, {
        ...importArgs,
        fromDate: "2015-01-01",
      }),
    ).rejects.toThrow("five years");
  });
  test("mapping requires matching type, a cutover date, and the owner's own accounts", async () => {
    const { t, asUser, asOther, userId, otherUserId } = await fixture();
    const manual = await t.run((ctx) =>
      ctx.db.insert("accounts", {
        userId,
        name: "Manual checking",
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
      }),
    );
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        userId,
        name: "Expenses",
        kind: "expense",
        order: 0,
      });
      const categoryId = await ctx.db.insert("categories", {
        userId,
        groupId,
        name: "Uncategorized",
        emoji: "•",
        order: 0,
        enabled: true,
      });
      const merchantId = await ctx.db.insert("merchants", {
        userId,
        name: "Older purchase",
        normalizedName: "older purchase",
        color: "#64748b",
        transactionCount: 1,
      });
      await ctx.db.insert("transactions", {
        userId,
        accountId: manual,
        merchantId,
        categoryId,
        date: "2026-09-05",
        amountCents: 500,
        originalName: "Older purchase",
        notes: "",
        tagIds: [],
        reviewed: true,
        hidden: false,
        pending: false,
        splits: [],
        source: "manual",
        searchText: "older purchase",
        updatedAt: Date.now(),
        editedFields: [],
      });
    });
    const mapped = {
      accounts: [
        {
          externalAccountId: "acct-checking",
          targetAccountId: manual,
          kind: "cash" as const,
        },
      ],
    };
    await expect(
      asUser.action(api.simplefin.importAccounts, {
        ...mapped,
        fromDate: "2026-09-01",
      }),
    ).rejects.toThrow("after 2026-09-05");
    await expect(
      asUser.action(api.simplefin.importAccounts, {
        accounts: [{ ...mapped.accounts[0], kind: "credit" as const }],
        fromDate: "2026-09-06",
      }),
    ).rejects.toThrow("same account type");
    const otherAccount = await t.run((ctx) =>
      ctx.db.insert("accounts", {
        userId: otherUserId,
        name: "Someone else's",
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
      }),
    );
    await expect(
      asUser.action(api.simplefin.importAccounts, {
        accounts: [{ ...mapped.accounts[0], targetAccountId: otherAccount }],
        fromDate: "2026-09-06",
      }),
    ).rejects.toThrow("unavailable");
    const result = await asUser.action(api.simplefin.importAccounts, {
      ...mapped,
      fromDate: "2026-09-06",
    });
    expect(result).toMatchObject({ imported: 2 });
    const account = (await t.run((ctx) => ctx.db.get(manual)))!;
    expect(account).toMatchObject({
      institution: "Fixture Bank",
      manual: false,
      simplefinImportFromDate: "2026-09-06",
      balanceCents: 123456,
    });
    await expect(asOther.action(api.simplefin.preview, {})).rejects.toThrow(
      "Connect SimpleFIN",
    );
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("accounts")
          .withIndex("by_userId", (q) => q.eq("userId", otherUserId))
          .collect(),
      ),
    ).toHaveLength(1);
  });
  test("stopping imports fences in-flight writes; removing forgets the token", async () => {
    const { t, asUser, asOther, userId, importArgs, remote } = await fixture();
    await asUser.action(api.simplefin.importAccounts, importArgs);
    const connection = (await asUser.query(api.simplefin.status, {}))
      .connection!;
    await expect(
      asOther.mutation(api.simplefin.disconnect, {
        connectionId: connection._id,
      }),
    ).rejects.toThrow("unavailable");
    await asUser.mutation(api.simplefin.disconnect, {
      connectionId: connection._id,
    });
    await expect(asUser.action(api.simplefin.sync, {})).rejects.toThrow(
      "Review and import",
    );
    const stopped = (await t.run((ctx) => ctx.db.get(connection._id)))!;
    const parsed = parseAccountSet({ accounts: remote.accounts }).accounts[0];
    const prepared = {
      selection: { externalAccountId: "acct-checking", kind: "cash" as const },
      account: normalizeSimplefinAccount(parsed, {
        externalAccountId: "acct-checking",
        kind: "cash",
      }),
      fromDate: "2026-09-01",
    };
    await expect(
      t.mutation(internal.simplefinInternal.begin, {
        userId,
        accounts: [prepared],
        reconnect: true,
        expectedVersion: stopped.syncVersion - 1,
      }),
    ).rejects.toThrow("changed while its data was loading");
    const begin = await t.mutation(internal.simplefinInternal.begin, {
      userId,
      accounts: [prepared],
      reconnect: true,
      expectedVersion: stopped.syncVersion,
    });
    await asUser.mutation(api.simplefin.disconnect, {
      connectionId: connection._id,
    });
    await expect(
      t.mutation(internal.simplefinInternal.ingest, {
        connectionId: begin.connectionId,
        version: begin.version,
        accountId: begin.mappings[0].accountId,
        transactions: [],
      }),
    ).rejects.toThrow("stopped or superseded");
    await asUser.mutation(api.simplefin.remove, {});
    expect(
      (await asUser.query(api.simplefin.status, {})).connection,
    ).toBeNull();
    const accounts = await t.run((ctx) => ctx.db.query("accounts").collect());
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ manual: true });
    expect(accounts[0].simplefinConnectionId).toBeUndefined();
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(2);
  });
  test("a full workspace cannot be pushed past its readable account limit", async () => {
    const { t, asUser, userId, importArgs } = await fixture();
    await asUser.action(api.simplefin.importAccounts, importArgs);
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
    await expect(
      asUser.action(api.simplefin.importAccounts, {
        ...importArgs,
        accounts: [{ externalAccountId: "acct-card", kind: "credit" }],
      }),
    ).rejects.toThrow("200 accounts");
    expect(
      await t.run((ctx) => ctx.db.query("accounts").collect()),
    ).toHaveLength(200);
  });
});

test("SimpleFIN holdings retain fractional shares and never substitute purchase price or ambiguous basis", async () => {
  const { parseSimplefinHoldings } = await import("./lib/simplefinApi");
  const holding = {
    id: "fictional-position",
    description: "Fictional fund",
    symbol: "DEMO",
    shares: "2.5",
    market_value: "125.50",
    currency: "USD",
    cost_basis: "10.00",
    purchase_price: "4.00",
    created: 1,
  };
  expect(parseSimplefinHoldings([holding])).toEqual([
    {
      id: holding.id,
      name: holding.description,
      symbol: "DEMO",
      quantity: 2.5,
      valueCents: 12550,
      price: 50.2,
      currency: "USD",
    },
  ]);
  expect(parseSimplefinHoldings(undefined)).toBeNull();
  expect(() => parseSimplefinHoldings([holding, holding])).toThrow();
  expect(() =>
    parseSimplefinHoldings([{ ...holding, market_value: "not a number" }]),
  ).toThrow();
  expect(
    parseSimplefinHoldings([
      { ...holding, shares: "0", market_value: "0" },
    ])?.[0].price,
  ).toBeNull();
});

test("SimpleFIN holdings publish through the full import path, keep stable IDs and preserve snapshots on malformed input", async () => {
  const f = await fixture({ connected: true });
  const holding = {
    id: "fictional-position",
    description: "Fictional fund",
    symbol: "DEMO",
    shares: "2.5",
    market_value: "125.50",
    currency: "USD",
  };
  Object.assign(f.remote.accounts[0], {
    name: "Fictional brokerage",
    holdings: [holding],
    transactions: [],
  });
  await f.asUser.action(api.simplefin.importAccounts, {
    ...f.importArgs,
    accounts: [{ externalAccountId: "acct-checking", kind: "investment" }],
  });
  const first = await f.t.run((ctx) =>
    ctx.db.query("investmentHoldings").first(),
  );
  expect(first).toMatchObject({
    quantity: 2.5,
    valueCents: 12550,
    price: 50.2,
    basisCents: null,
    priceDate: null,
    simplefinConnectionId: f.connectionId,
  });
  expect(
    (await f.asUser.query(api.investments.overview, {})).holdings,
  ).toHaveLength(1);
  expect(
    (await f.asOther.query(api.investments.overview, {})).holdings,
  ).toHaveLength(0);
  await f.asUser.action(api.simplefin.sync, {});
  expect(
    (await f.t.run((ctx) => ctx.db.query("investmentHoldings").first()))?._id,
  ).toBe(first?._id);
  Object.assign(f.remote.accounts[0], {
    holdings: [{ ...holding, market_value: "bad" }],
  });
  const result = await f.asUser.action(api.simplefin.sync, {});
  expect(result.warning).toContain("Previous holdings are kept");
  expect(
    (await f.t.run((ctx) => ctx.db.query("investmentHoldings").first()))
      ?.valueCents,
  ).toBe(12550);
  Object.assign(f.remote.accounts[0], { holdings: [] });
  await f.asUser.action(api.simplefin.sync, {});
  expect(
    await f.t.run((ctx) => ctx.db.query("investmentHoldings").collect()),
  ).toHaveLength(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("investmentSecurities").collect()),
  ).toHaveLength(0);
});

test("SimpleFIN enriches only untouched uncategorized rows when a hint arrives later", async () => {
  const { t, asUser, userId, remote, importArgs } = await fixture();
  remote.accounts[0].transactions = Array.from({ length: 5 }, (_, i) => ({
    id: `late-${i}`,
    posted: day("2026-09-08"),
    amount: "-10.00",
    description: "FICTIONAL PURCHASE",
    pending: false,
  }));
  const fuelId = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      userId,
      name: "Everyday",
      kind: "expense",
      order: 0,
    });
    return ctx.db.insert("categories", {
      userId,
      groupId,
      name: "Fuel",
      emoji: "•",
      order: 0,
      enabled: true,
    });
  });
  await asUser.action(api.simplefin.importAccounts, importArgs);
  const before = await t.run((ctx) => ctx.db.query("transactions").collect());
  const row = (i: number) =>
    before.find((tx) => tx.simplefinTransactionId === `late-${i}`)!;
  await t.run(async (ctx) => {
    await ctx.db.patch(row(1)._id, { reviewed: true });
    await ctx.db.patch(row(2)._id, { editedFields: ["categoryId"] });
    await ctx.db.patch(row(3)._id, {
      splits: [
        { categoryId: row(3).categoryId, amountCents: 500 },
        { categoryId: row(3).categoryId, amountCents: 500 },
      ],
    });
    await ctx.db.patch(row(4)._id, { categoryId: fuelId });
  });
  for (const tx of remote.accounts[0].transactions)
    Object.assign(tx, { mcc: "5541" });
  await asUser.action(api.simplefin.importAccounts, importArgs);
  const after = await t.run((ctx) => ctx.db.query("transactions").collect());
  expect(after).toHaveLength(5);
  for (let i = 0; i < 5; i++) {
    expect(after.find((tx) => tx._id === row(i)._id)?.categoryId).toBe(
      i === 0 || i === 4 ? fuelId : row(i).categoryId,
    );
  }
});

test("SimpleFIN recognizes investment names without classifying investor checking as brokerage", () => {
  for (const name of [
    "Stocks ...837",
    "Mutual Funds ...262",
    "Investment Account",
    "Roth IRA",
  ]) {
    expect(guessKind({ name, holdings: 0 })).toBe("investment");
  }
  expect(guessKind({ name: "Investor Checking", holdings: 0 })).toBe("cash");
  expect(guessKind({ name: "Gift", holdings: 0 })).toBe("cash");
  expect(guessKind({ name: "Gift", holdings: 2 })).toBe("investment");
});

test("SimpleFIN asset types can be corrected without changing provider balances or history", async () => {
  const { t, asUser, asOther, importArgs } = await fixture();
  await asUser.action(api.simplefin.importAccounts, importArgs);
  const account = (await t.run((ctx) => ctx.db.query("accounts").collect()))[0];
  const input = {
    id: account._id,
    name: account.name,
    institution: account.institution,
    mask: account.mask,
    kind: "investment" as const,
    subtype: "brokerage",
    balanceCents: account.balanceCents,
    currency: account.currency,
    hidden: account.hidden,
    excludeNetWorth: account.excludeNetWorth,
    closed: account.closed,
  };
  await expect(
    asOther.mutation(api.workspace.saveAccount, input),
  ).rejects.toThrow();
  await expect(
    asUser.mutation(api.workspace.saveAccount, { ...input, balanceCents: 1 }),
  ).rejects.toThrow();
  await expect(
    asUser.mutation(api.workspace.saveAccount, {
      ...input,
      kind: "asset",
      subtype: "property",
    }),
  ).rejects.toThrow();
  const history = await t.run((ctx) => ctx.db.query("balances").collect());
  await asUser.mutation(api.workspace.saveAccount, input);
  expect(await t.run((ctx) => ctx.db.get(account._id))).toMatchObject({
    kind: "investment",
    balanceCents: account.balanceCents,
    simplefinAccountId: account.simplefinAccountId,
  });
  expect(await t.run((ctx) => ctx.db.query("balances").collect())).toEqual(
    history,
  );
});

test("A SimpleFIN account imported as cash can become a credit card, mirroring its balance and history", async () => {
  const f = await fixture({ connected: true });
  // The bridge sends a card with an owed balance; the owner accepted the cash guess.
  Object.assign(f.remote.accounts[0], {
    name: "Blue Cash Everyday (4008)",
    balance: "-210.45",
  });
  await f.asUser.action(api.simplefin.importAccounts, {
    ...f.importArgs,
    accounts: [{ externalAccountId: "acct-checking", kind: "cash" as const }],
  });
  const account = (
    await f.t.run((ctx) => ctx.db.query("accounts").collect())
  )[0];
  expect(account).toMatchObject({ kind: "cash", balanceCents: -21045 });
  await f.asUser.mutation(api.workspace.saveAccount, {
    id: account._id,
    name: account.name,
    institution: account.institution,
    mask: account.mask,
    kind: "credit",
    subtype: "credit card",
    balanceCents: account.balanceCents,
    currency: account.currency,
    hidden: account.hidden,
    excludeNetWorth: account.excludeNetWorth,
    closed: account.closed,
    paymentPlan: "minimum",
  });
  const corrected = await f.t.run((ctx) => ctx.db.get(account._id));
  expect(corrected).toMatchObject({
    kind: "credit",
    subtype: "credit card",
    balanceCents: 21045,
    paymentPlan: "minimum",
    simplefinAccountId: "acct-checking",
  });
  const history = await f.t.run((ctx) => ctx.db.query("balances").collect());
  expect(history.map((row) => row.balanceCents)).toEqual([21045]);
  // The daily import reads the corrected type, so the owed amount stays positive.
  await f.asUser.action(api.simplefin.sync, {});
  expect(await f.t.run((ctx) => ctx.db.get(account._id))).toMatchObject({
    kind: "credit",
    balanceCents: 21045,
  });
  expect(
    (await f.t.run((ctx) => ctx.db.query("balances").collect())).map(
      (row) => row.balanceCents,
    ),
  ).toEqual([21045]);
});

test("SimpleFIN keeps brokerage activity out of Transactions until the owner opts in, and removal takes it back out", async () => {
  const f = await fixture({ connected: true });
  Object.assign(f.remote.accounts[0], { name: "Fictional brokerage" });
  const investment = {
    externalAccountId: "acct-checking",
    kind: "investment" as const,
  };
  const first = await f.asUser.action(api.simplefin.importAccounts, {
    ...f.importArgs,
    accounts: [investment],
  });
  expect(first.imported).toBe(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("transactions").collect()),
  ).toHaveLength(0);
  // The account itself, with its balance, still arrives.
  const account = await f.t.run((ctx) => ctx.db.query("accounts").first());
  expect(account).toMatchObject({ kind: "investment", balanceCents: 123456 });
  await f.t.run((ctx) =>
    ctx.db.patch(f.profileId, { investmentActivity: true }),
  );
  const second = await f.asUser.action(api.simplefin.importAccounts, {
    ...f.importArgs,
    accounts: [investment],
  });
  expect(second.imported).toBe(2);
  expect(await f.asUser.query(api.transactions.investmentActivity, {})).toEqual(
    { count: 2, capped: false },
  );
  expect(
    await f.t.run((ctx) => ctx.db.query("merchants").collect()),
  ).toHaveLength(2);
  let result = { done: false, removed: 0 };
  while (!result.done)
    result = await f.asUser.mutation(
      api.transactions.removeInvestmentActivity,
      {},
    );
  expect(
    await f.t.run((ctx) => ctx.db.query("transactions").collect()),
  ).toHaveLength(0);
  // Merchants that only existed for the removed trades go with them.
  expect(
    await f.t.run((ctx) => ctx.db.query("merchants").collect()),
  ).toHaveLength(0);
  expect(await f.asUser.query(api.transactions.investmentActivity, {})).toEqual(
    { count: 0, capped: false },
  );
  expect(await f.t.run((ctx) => ctx.db.query("accounts").first())).not.toBe(
    null,
  );
});
