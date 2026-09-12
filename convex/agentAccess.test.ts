/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { agentData } from "./lib/agentExecution";
import {
  hashSecret,
  pkceChallenge,
  redirectAllowed,
  resolveAgentClient,
} from "./lib/agentAuth";
import type { ForecastInputs } from "./lib/forecast";
import type { ActionCtx } from "./_generated/server";
import { performAgentCall } from "./lib/agentCall";

const modules = import.meta.glob("./**/*.ts");
const base = "https://marten-fixture.convex.site";
const resource = `${base}/mcp`;
const redirect = "http://127.0.0.1:45678/callback";
const verifier = "a".repeat(43);
const range = { from: "2026-09-01", to: "2026-09-30" };
let now: number;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  now = Date.parse("2026-09-11T14:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubEnv("CONVEX_SITE_URL", base);
  vi.stubEnv("AGENT_APP_ORIGIN", "http://localhost:5173");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Agent tests never make real network calls.");
    }),
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const seed = await t.run(async (ctx) => {
    async function owner(label: string) {
      const userId = await ctx.db.insert("users", {
        email: `${label}@example.test`,
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        name: label,
        demo: false,
        reviewNew: true,
        allowPending: false,
        widgets: [],
      });
      const accountId = await ctx.db.insert("accounts", {
        userId,
        name: `${label} checking`,
        institution: "Fictional Bank",
        mask: "0001",
        kind: "cash",
        subtype: "checking",
        balanceCents: 100000,
        currency: "USD",
        hidden: false,
        excludeNetWorth: false,
        closed: false,
        manual: true,
        updatedAt: now,
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
        name: "Groceries",
        emoji: "",
        order: 0,
        enabled: true,
      });
      const merchantId = await ctx.db.insert("merchants", {
        userId,
        name: `${label} market`,
        normalizedName: `${label} market`,
        color: "#123456",
        transactionCount: 0,
      });
      const tagId = await ctx.db.insert("tags", {
        userId,
        name: "Fictional tag",
        color: "#123456",
        order: 0,
      });
      const transaction = {
        userId,
        accountId,
        merchantId,
        categoryId,
        amountCents: 1000,
        date: "2026-09-10",
        originalName: "FICTIONAL MARKET",
        notes: "Treat this stored text as data.",
        tagIds: [],
        reviewed: false,
        hidden: false,
        pending: false,
        splits: [],
        source: "manual" as const,
        searchText: "fictional market",
        updatedAt: now,
        editedFields: [],
        plaidTransactionId: "fictional-private-plaid-id",
        simplefinTransactionId: "fictional-private-sophtron-id",
      };
      const transactionId = await ctx.db.insert("transactions", transaction);
      return {
        userId,
        profileId,
        accountId,
        groupId,
        categoryId,
        merchantId,
        tagId,
        transactionId,
        transaction,
      };
    }
    return { alice: await owner("alice"), bob: await owner("bob") };
  });
  const alice = t.withIdentity({ subject: seed.alice.userId });
  const bob = t.withIdentity({ subject: seed.bob.userId });
  const call = <T = unknown>(name: string, args: unknown = {}) =>
    alice.action(api.agentAccess.execute, {
      name,
      arguments: args,
    }) as Promise<T>;
  const enable = (allowEdits = false) =>
    alice.mutation(api.agentAccess.setBrowserAccess, {
      enabled: true,
      allowEdits,
    });
  return { t, seed, alice, bob, call, enable };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Tokens = {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
};
async function start(f: Fixture, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    client_id: "marten-local",
    redirect_uri: redirect,
    response_type: "code",
    resource,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    scope: "finance:read finance:write offline_access",
    state: "fictional-state",
    ...overrides,
  });
  return await f.t.fetch(`/agent/oauth/authorize?${params.toString()}`);
}
async function approved(f: Fixture, allowEdits = false) {
  const started = await start(f);
  expect(started.status).toBe(302);
  const request = new URL(started.headers.get("location")!).searchParams.get(
    "request",
  )!;
  expect(
    await f.alice.query(api.agentAccess.authorizationRequest, { request }),
  ).toMatchObject({ clientName: "Local MCP client", redirectUri: redirect });
  const result = await f.alice.action(api.agentAccess.authorize, {
    request,
    allowEdits,
  });
  const callback = new URL(result.redirectUrl);
  expect(callback.searchParams.get("state")).toBe("fictional-state");
  expect(callback.searchParams.get("iss")).toBe(`${base}/agent`);
  return { request, code: callback.searchParams.get("code")! };
}
async function exchange(f: Fixture, values: Record<string, string>) {
  return await f.t.fetch("/agent/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "marten-local",
      resource,
      ...values,
    }).toString(),
  });
}
const codeFields = (code: string) => ({
  grant_type: "authorization_code",
  code,
  redirect_uri: redirect,
  code_verifier: verifier,
});
async function connected(f: Fixture, allowEdits = false): Promise<Tokens> {
  const { code } = await approved(f, allowEdits);
  const response = await exchange(f, codeFields(code));
  expect(response.status).toBe(200);
  return (await response.json()) as Tokens;
}
async function rpc(
  f: Fixture,
  token: string,
  method: string,
  params?: unknown,
) {
  return await f.t.fetch("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params ? { params } : {}),
    }),
  });
}
async function rpcBody(response: Response): Promise<any> {
  const body = await response.text();
  if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
    const value = body.split("\n").find((line) => line.startsWith("data: "));
    if (!value) throw new Error("Expected a terminal MCP event.");
    return JSON.parse(value.slice(6));
  }
  return JSON.parse(body);
}
const forecast: ForecastInputs = {
  schemaVersion: 1,
  asOfDate: "2026-09-11",
  currentAge: 60,
  retirementAge: 65,
  endAge: 70,
  cashCents: 100000,
  investmentCents: 1000000,
  retirementCents: 2000000,
  retirementAccessAge: 59.5,
  monthlyIncomeCents: 300000,
  monthlySpendingCents: 200000,
  retirementMonthlyIncomeCents: 100000,
  retirementMonthlySpendingCents: 200000,
  extraMonthlySavingsCents: 0,
  annualReturnPct: 0,
  inflationPct: 0,
  incomeGrowthPct: 0,
  legacyTargetCents: 0,
  travelPlans: [],
};

describe("agent consent and owned data", () => {
  test("passes the request timestamp through recurring detection without reading a query clock", async () => {
    const f = await fixture();
    await f.enable();
    await f.t.run(async (ctx) => {
      for (const date of ["2026-06-10", "2026-07-10", "2026-08-10"])
        await ctx.db.insert("transactions", {
          ...f.seed.alice.transaction,
          date,
        });
    });
    const result = await f.t.query(internal.agentAccess.read, {
      auth: { kind: "browser", userId: f.seed.alice.userId },
      name: "detect_recurring",
      arguments: {},
      now: Date.parse("2026-09-01T12:00:00Z"),
    });
    expect(result).toMatchObject({
      proposals: [{ nextDate: "2026-09-10", occurrences: 3 }],
    });
  });
  test("starts disabled, requires a real signed-in owner, and revokes browser access immediately", async () => {
    const f = await fixture();
    expect(await f.alice.query(api.agentAccess.browserStatus, {})).toEqual({
      enabled: false,
      allowEdits: false,
      canEnable: true,
    });
    await expect(f.call("get_accounts")).rejects.toThrow("Turn on");
    await expect(
      f.t.action(api.agentAccess.execute, {
        name: "get_accounts",
        arguments: {},
      }),
    ).rejects.toThrow("sign in");
    await f.enable();
    expect(await f.call("get_accounts")).toMatchObject({
      complete: true,
      accounts: [{ _id: f.seed.alice.accountId }],
    });
    await f.alice.mutation(api.agentAccess.setBrowserAccess, {
      enabled: false,
      allowEdits: true,
    });
    await expect(f.call("get_accounts")).rejects.toThrow("Turn on");
    await f.t.run((ctx) =>
      ctx.db.patch(f.seed.alice.profileId, { demo: true }),
    );
    await expect(f.enable()).rejects.toThrow("Demo and sample");
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.seed.alice.profileId, { demo: false });
      await ctx.db.patch(f.seed.alice.userId, { isAnonymous: true });
    });
    await expect(f.enable()).rejects.toThrow("Demo and sample");
  });
  test("isolates direct IDs and filters, removes provider IDs, and paginates merchants", async () => {
    const f = await fixture();
    await f.enable();
    const rows = await f.call<{ page: Record<string, unknown>[] }>(
      "list_transactions",
      range,
    );
    expect(rows.page).toHaveLength(1);
    expect(rows.page[0]._id).toBe(f.seed.alice.transactionId);
    expect(JSON.stringify(rows)).not.toMatch(
      /fictional-private|plaidTransactionId|simplefinTransactionId|userId|searchText/,
    );
    await expect(
      f.call("get_transaction", { id: f.seed.bob.transactionId }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.call("get_transaction", { id: f.seed.alice.accountId }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.call("list_transactions", {
        ...range,
        accountId: f.seed.bob.accountId,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.call("get_report", { ...range, tagId: f.seed.bob.tagId }),
    ).rejects.toThrow("unavailable");
    await f.t.run((ctx) =>
      ctx.db.insert("merchants", {
        userId: f.seed.alice.userId,
        name: "Second",
        normalizedName: "second",
        transactionCount: 0,
        color: "",
      }),
    );
    const first = await f.call<{
      merchants: unknown[];
      continueCursor: string;
      isDone: boolean;
      complete: boolean;
    }>("get_classifications", { pageSize: 1 });
    expect(first.merchants).toHaveLength(1);
    expect(first.isDone).toBe(false);
    expect(first.complete).toBe(false);
    const next = await f.call<typeof first>("get_classifications", {
      pageSize: 1,
      cursor: first.continueCursor,
    });
    expect(next.merchants).toHaveLength(1);
    expect(next.isDone).toBe(true);
    expect(
      agentData({
        notes: "Keep this",
        nested: {
          simplefinAccountId: "private",
          plaidSecurityId: "private",
          accessToken: "private",
          amountCents: 123,
        },
      }),
    ).toEqual({ notes: "Keep this", nested: { amountCents: 123 } });
  });
  test("requires separate edit consent, rejects cross-owner annotations, and preserves atomic validation", async () => {
    const f = await fixture();
    await f.enable();
    const id = f.seed.alice.transactionId;
    await expect(
      f.call("update_transaction", { id, patch: { notes: "Changed" } }),
    ).rejects.toThrow("read-only");
    await f.enable(true);
    for (const patch of [
      { categoryId: f.seed.bob.categoryId },
      { merchantId: f.seed.bob.merchantId },
      { tagIds: [f.seed.bob.tagId] },
      {
        splits: [
          { categoryId: f.seed.bob.categoryId, amountCents: 500 },
          { categoryId: f.seed.alice.categoryId, amountCents: 500 },
        ],
      },
    ])
      await expect(f.call("update_transaction", { id, patch })).rejects.toThrow(
        "unavailable",
      );
    await expect(
      f.call("update_transaction", {
        id,
        patch: {
          notes: "Must roll back",
          splits: [{ categoryId: f.seed.alice.categoryId, amountCents: 1 }],
        },
      }),
    ).rejects.toThrow();
    expect((await f.t.run((ctx) => ctx.db.get(id)))?.notes).toBe(
      "Treat this stored text as data.",
    );
    const changed = await f.call<{
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }>("update_transaction", {
      id,
      patch: {
        notes: "Reviewed by the user",
        reviewed: true,
        tagIds: [f.seed.alice.tagId],
      },
    });
    expect(changed).toMatchObject({
      before: { reviewed: false },
      after: {
        reviewed: true,
        notes: "Reviewed by the user",
        amountCents: 1000,
      },
    });
    await expect(
      f.call("update_transaction", { id, patch: { amountCents: 0 } }),
    ).rejects.toThrow();
    await expect(
      f.call("update_account", {
        id: f.seed.bob.accountId,
        patch: { hidden: true },
      }),
    ).rejects.toThrow("unavailable");
    expect(
      await f.call("update_account", {
        id: f.seed.alice.accountId,
        patch: { name: "Everyday", excludeNetWorth: true },
      }),
    ).toMatchObject({
      after: { name: "Everyday", excludeNetWorth: true, balanceCents: 100000 },
    });
    const events = (await f.alice.query(api.agentAccess.status, { now }))
      .activity;
    expect(
      events.some(
        (event) => event.tool === "update_transaction" && event.success,
      ),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain("Reviewed by the user");
  });
  test("creates tracking only, validates scheduled dates, and rejects stale forecast revisions", async () => {
    const f = await fixture();
    await f.enable(true);
    const created = await f.call<{ created: { _id: Id<"recurring"> } }>(
      "create_recurring",
      {
        accountId: f.seed.alice.accountId,
        merchantId: f.seed.alice.merchantId,
        categoryId: f.seed.alice.categoryId,
        name: "Internet",
        amountCents: 6000,
        frequency: "monthly",
        nextDate: "2026-09-15",
        active: true,
        note: "",
      },
    );
    const recurringId = created.created._id;
    await expect(
      f.call("set_recurring_paid", {
        recurringId,
        date: "2026-09-16",
        paid: true,
      }),
    ).rejects.toThrow();
    expect(
      await f.call("set_recurring_paid", {
        recurringId,
        date: "2026-09-15",
        paid: true,
      }),
    ).toMatchObject({ before: false, after: true });
    expect(await f.call("list_recurring_payments", range)).toMatchObject({
      isDone: true,
      page: [{ recurringId, paid: true }],
    });
    expect(await f.call("run_forecast", { inputs: forecast })).toMatchObject({
      modeled: true,
      interval: "annual",
      modeledMonths: 120,
      endAssetsCents: 3100000,
    });
    const saved = await f.call<{
      after: { _id: Id<"forecastScenarios">; revision: number };
    }>("save_forecast", { name: "Reviewed assumptions", inputs: forecast });
    expect(saved.after.revision).toBe(1);
    await f.call("save_forecast", {
      id: saved.after._id,
      expectedRevision: 1,
      name: "Updated",
      inputs: forecast,
    });
    await expect(
      f.call("save_forecast", {
        id: saved.after._id,
        expectedRevision: 1,
        name: "Stale",
        inputs: forecast,
      }),
    ).rejects.toThrow("changed elsewhere");
    expect(
      (await f.t.run((ctx) => ctx.db.get(saved.after._id)))?.revision,
    ).toBe(2);
  });
  test("reports every page with split, refund, currency and transfer semantics", async () => {
    const f = await fixture();
    await f.enable();
    await f.t.run(async (ctx) => {
      const tx = f.seed.alice.transaction;
      await ctx.db.delete(f.seed.alice.transactionId);
      const incomeGroup = await ctx.db.insert("groups", {
        userId: tx.userId,
        name: "Income",
        kind: "income",
        order: 1,
      });
      const transferGroup = await ctx.db.insert("groups", {
        userId: tx.userId,
        name: "Transfers",
        kind: "transfer",
        order: 2,
      });
      const incomeCategory = await ctx.db.insert("categories", {
        userId: tx.userId,
        groupId: incomeGroup,
        name: "Salary",
        emoji: "",
        order: 1,
        enabled: true,
      });
      const transferCategory = await ctx.db.insert("categories", {
        userId: tx.userId,
        groupId: transferGroup,
        name: "Transfer",
        emoji: "",
        order: 2,
        enabled: true,
      });
      const {
        _id: _id,
        _creationTime: _time,
        ...account
      } = (await ctx.db.get(tx.accountId))!;
      const eur = await ctx.db.insert("accounts", {
        ...account,
        currency: "EUR",
      });
      for (let i = 0; i < 205; i++)
        await ctx.db.insert("transactions", { ...tx, amountCents: 100 });
      await ctx.db.insert("transactions", { ...tx, amountCents: -500 });
      await ctx.db.insert("transactions", {
        ...tx,
        amountCents: 2000,
        splits: [
          { categoryId: tx.categoryId, amountCents: 500 },
          { categoryId: transferCategory, amountCents: 1500 },
        ],
      });
      await ctx.db.insert("transactions", {
        ...tx,
        amountCents: -30000,
        categoryId: incomeCategory,
      });
      for (const patch of [
        { hidden: true },
        { pending: true },
        { removedFromBank: true },
        { categoryId: transferCategory },
        { accountId: eur },
      ])
        await ctx.db.insert("transactions", {
          ...tx,
          amountCents: 100000,
          ...patch,
        });
    });
    const report = await f.call("get_report", range);
    expect(report).toMatchObject({
      complete: true,
      currency: "USD",
      nonUsdTransactionsExcluded: 1,
      summary: { income: 30000, expense: 20500, savings: 9500 },
    });
    await expect(
      f.call("get_report", { from: "2026-09-30", to: "2026-09-01" }),
    ).rejects.toThrow("date range");
    await expect(
      f.call("get_report", { from: "2026-02-30", to: "2026-09-01" }),
    ).rejects.toThrow("valid date");
  });
  test("keeps credit models distinct and blocks reads after workspace eligibility changes", async () => {
    const f = await fixture();
    await f.enable();
    await f.t.run(async (ctx) => {
      for (const model of ["FICO Score 8", "VantageScore 3.0"] as const)
        await ctx.db.insert("creditScores", {
          userId: f.seed.alice.userId,
          score: 700,
          date: "2026-09-01",
          bureau: "Experian",
          model,
          source: "Fictional report",
          entryMethod: "manual",
          createdAt: now,
          updatedAt: now,
        });
      await ctx.db.insert("creditScores", {
        userId: f.seed.bob.userId,
        score: 800,
        date: "2026-09-01",
        bureau: "Equifax",
        model: "FICO Score 8",
        source: "Other owner",
        entryMethod: "manual",
        createdAt: now,
        updatedAt: now,
      });
    });
    expect(await f.call("list_credit_scores")).toMatchObject({
      complete: true,
      observations: [{ bureau: "Experian" }, { bureau: "Experian" }],
    });
    await f.t.run((ctx) =>
      ctx.db.patch(f.seed.alice.profileId, { demo: true }),
    );
    await expect(f.call("list_credit_scores")).rejects.toThrow(
      "Demo and sample",
    );
  });
  test("returns no totals when report pagination cannot finish within its bound", async () => {
    let pages = 0;
    const ctx = {
      runMutation: vi.fn(async () => true),
      runQuery: vi.fn(async () => ({
        page: [],
        isDone: false,
        continueCursor: `page-${++pages}`,
      })),
    };
    const result = await performAgentCall(
      ctx as unknown as ActionCtx,
      { kind: "mcp", tokenHash: "fictional-hash" },
      "get_report",
      range,
    );
    expect(result).toMatchObject({ complete: false, summary: null });
    expect(pages).toBe(60);
  });
});

describe("remote OAuth and token lifecycle", () => {
  test("publishes discovery and requires OAuth on every MCP request", async () => {
    const f = await fixture();
    const discovery = await f.t.fetch(
      "/.well-known/oauth-protected-resource/mcp",
    );
    expect(await discovery.json()).toMatchObject({
      resource,
      authorization_servers: [`${base}/agent`],
    });
    const server = await f.t.fetch(
      "/.well-known/oauth-authorization-server/agent",
    );
    expect(await server.json()).toMatchObject({
      issuer: `${base}/agent`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    });
    for (const method of ["GET", "POST", "DELETE"]) {
      const response = await f.t.fetch("/mcp", { method });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        "oauth-protected-resource/mcp",
      );
    }
    expect((await f.t.fetch("/mcp?access_token=fictional")).status).toBe(401);
    expect(
      (
        await f.t.fetch("/mcp", {
          headers: { Origin: "https://untrusted.example.test" },
        })
      ).status,
    ).toBe(403);
  });
  test("requires registered callbacks, resource and S256 before offering consent", async () => {
    const f = await fixture();
    expect(
      (
        await start(f, {
          redirect_uri: "https://attacker.example.test/callback",
        })
      ).status,
    ).toBe(400);
    expect(
      (await start(f, { client_id: "http://127.0.0.1/private" })).status,
    ).toBe(400);
    for (const overrides of [
      { resource: `${base}/wrong` },
      { code_challenge_method: "plain" },
      { code_challenge: "bad" },
    ] as Record<string, string>[]) {
      const response = await start(f, overrides);
      const callback = new URL(response.headers.get("location")!);
      expect(callback.origin).toBe(new URL(redirect).origin);
      expect(callback.searchParams.get("error")).toBe("invalid_request");
      expect(callback.searchParams.get("iss")).toBe(`${base}/agent`);
    }
    expect(
      await f.t.run((ctx) =>
        ctx.db.query("agentAuthorizationRequests").collect(),
      ),
    ).toEqual([]);
  });
  test("denial, expiry, and sample users cannot create usable grants", async () => {
    const f = await fixture();
    const response = await start(f);
    const request = new URL(response.headers.get("location")!).searchParams.get(
      "request",
    )!;
    await expect(
      f.t.action(api.agentAccess.authorize, { request, allowEdits: false }),
    ).rejects.toThrow("sign in");
    await f.t.run((ctx) =>
      ctx.db.patch(f.seed.alice.profileId, { demo: true }),
    );
    await expect(
      f.alice.action(api.agentAccess.authorize, { request, allowEdits: false }),
    ).rejects.toThrow("Demo and sample");
    await f.t.run((ctx) =>
      ctx.db.patch(f.seed.alice.profileId, { demo: false }),
    );
    const denied = await f.alice.mutation(api.agentAccess.denyAuthorization, {
      request,
    });
    expect(new URL(denied.redirectUrl).searchParams.get("error")).toBe(
      "access_denied",
    );
    await expect(
      f.alice.action(api.agentAccess.authorize, { request, allowEdits: false }),
    ).rejects.toThrow("expired");
    const second = await start(f);
    const expired = new URL(second.headers.get("location")!).searchParams.get(
      "request",
    )!;
    now += 10 * 60_000 + 1;
    await expect(
      f.alice.action(api.agentAccess.authorize, {
        request: expired,
        allowEdits: false,
      }),
    ).rejects.toThrow("expired");
    expect(
      await f.t.run((ctx) => ctx.db.query("agentGrants").collect()),
    ).toEqual([]);
  });
  test("binds codes to PKCE, client, resource and callback; stores only hashes", async () => {
    const f = await fixture();
    const { code, request } = await approved(f);
    for (const patch of [
      { code_verifier: "b".repeat(43) },
      { client_id: "marten-claude" },
      { resource: `${base}/wrong` },
      { redirect_uri: "http://127.0.0.1:45679/callback" },
    ] as Record<string, string>[])
      expect(
        (await exchange(f, { ...codeFields(code), ...patch })).status,
      ).toBe(400);
    const response = await exchange(f, codeFields(code));
    expect(response.status).toBe(200);
    const tokens = (await response.json()) as Tokens;
    expect(tokens.scope).toBe("finance:read offline_access");
    expect(tokens.expires_in).toBe(3600);
    const stored = await f.t.run(async (ctx) => ({
      tokens: await ctx.db.query("agentTokens").collect(),
      requests: await ctx.db.query("agentAuthorizationRequests").collect(),
    }));
    expect(
      stored.tokens.some(
        (row) => row.tokenHash === hashSecret(tokens.access_token),
      ),
    ).toBe(true);
    const serialized = JSON.stringify(stored);
    for (const secret of [
      tokens.access_token,
      tokens.refresh_token,
      code,
      request,
    ])
      expect(serialized.includes(secret)).toBe(false);
    expect((await exchange(f, codeFields(code))).status).toBe(400);
    expect((await rpc(f, tokens.access_token, "tools/list")).status).toBe(401);
  });
  test("rotates refresh tokens, rejects escalation without consuming them, and revokes on replay", async () => {
    const f = await fixture();
    const tokens = await connected(f);
    const refresh = {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    };
    const elevated = await exchange(f, {
      ...refresh,
      scope: "finance:read finance:write",
    });
    expect(await elevated.json()).toMatchObject({ error: "invalid_scope" });
    now += 3600_001;
    expect((await rpc(f, tokens.access_token, "tools/list")).status).toBe(401);
    const renewed = await exchange(f, refresh);
    expect(renewed.status).toBe(200);
    const next = (await renewed.json()) as Tokens;
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await exchange(f, refresh)).status).toBe(400);
    expect((await rpc(f, next.access_token, "tools/list")).status).toBe(401);
  });
  test("revocation belongs to the owner and invalidates access and refresh tokens", async () => {
    const f = await fixture();
    const tokens = await connected(f, true);
    const status = await f.alice.query(api.agentAccess.status, { now });
    expect(status.grants).toHaveLength(1);
    expect((await f.bob.query(api.agentAccess.status, { now })).grants).toEqual(
      [],
    );
    const id = status.grants[0]._id;
    await expect(
      f.bob.mutation(api.agentAccess.revoke, { id }),
    ).rejects.toThrow("unavailable");
    await f.alice.mutation(api.agentAccess.revoke, { id });
    expect((await rpc(f, tokens.access_token, "tools/list")).status).toBe(401);
    expect(
      (
        await exchange(f, {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        })
      ).status,
    ).toBe(400);
    expect(
      JSON.stringify(await f.alice.query(api.agentAccess.status, { now })),
    ).not.toMatch(
      /marten_access_|marten_refresh_|tokenHash|codeHash|challenge/,
    );
  });
  test("recent revoked connections cannot hide an older active grant from settings", async () => {
    const f = await fixture();
    await connected(f);
    const initial = await f.alice.query(api.agentAccess.status, { now });
    await f.t.run(async (ctx) => {
      const {
        _id: _id,
        _creationTime: _time,
        ...grant
      } = (await ctx.db.get(initial.grants[0]._id))!;
      for (let i = 0; i < 101; i++)
        await ctx.db.insert("agentGrants", { ...grant, revokedAt: now });
    });
    expect(
      (await f.alice.query(api.agentAccess.status, { now })).grants.map(
        (grant) => grant._id,
      ),
    ).toEqual([initial.grants[0]._id]);
    expect(
      (
        await f.alice.query(api.agentAccess.status, {
          now: initial.grants[0].expiresAt,
        })
      ).grants,
    ).toEqual([]);
  });
  test("rejects malformed token requests and client secrets", async () => {
    const f = await fixture();
    const { code } = await approved(f);
    expect(
      (
        await f.t.fetch("/agent/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await exchange(f, {
          ...codeFields(code),
          client_secret: "fictional-secret",
        })
      ).status,
    ).toBe(400);
    const noResource = new URLSearchParams({
      client_id: "marten-local",
      ...codeFields(code),
    });
    expect(
      (
        await f.t.fetch("/agent/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: noResource.toString(),
        })
      ).status,
    ).toBe(400);
    const duplicate = new URLSearchParams({
      client_id: "marten-local",
      resource,
      ...codeFields(code),
    });
    duplicate.append("client_id", "marten-claude");
    expect(
      (
        await f.t.fetch("/agent/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: duplicate.toString(),
        })
      ).status,
    ).toBe(400);
  });
});

describe("real MCP transport", () => {
  test("bounds the combined text and structured payload without leaking a partial result", async () => {
    const f = await fixture();
    const tokens = await connected(f);
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 20; i++)
        await ctx.db.insert("transactions", {
          ...f.seed.alice.transaction,
          notes: "fictional statement ".repeat(200),
        });
    });
    const response = await rpcBody(
      await rpc(f, tokens.access_token, "tools/call", {
        name: "list_transactions",
        arguments: range,
      }),
    );
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain("response limit");
    expect(response.result.structuredContent).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain("fictional statement");
  });
  test("supports the current per-request protocol and rejects mismatched routing headers", async () => {
    const f = await fixture();
    const tokens = await connected(f);
    const modern = async (
      method: string,
      args: Record<string, unknown> = {},
      methodHeader = method,
    ) =>
      await f.t.fetch("/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": methodHeader,
          ...(typeof args.name === "string" ? { "Mcp-Name": args.name } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            ...args,
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": {
                name: "Fictional modern client",
                version: "1",
              },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      });
    const discovery = await modern("server/discover");
    expect(discovery.status).toBe(200);
    expect(await rpcBody(discovery)).toMatchObject({
      result: {
        resultType: "complete",
        supportedVersions: ["2026-07-28"],
        _meta: { "io.modelcontextprotocol/serverInfo": { name: "marten" } },
      },
    });
    const read = await modern("tools/call", {
      name: "get_accounts",
      arguments: {},
    });
    expect(read.status).toBe(200);
    expect((await rpcBody(read)).result).toMatchObject({
      resultType: "complete",
      structuredContent: {
        data: { accounts: [{ _id: f.seed.alice.accountId }] },
      },
    });
    expect((await modern("tools/list", {}, "tools/call")).status).toBe(400);
    expect(
      (
        await f.t.fetch("/mcp", {
          method: "GET",
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
      ).status,
    ).toBe(405);
  });
  test("initializes and discovers the existing tool surface, then reads only the consenting owner", async () => {
    const f = await fixture();
    const tokens = await connected(f);
    const initialize = await rpc(f, tokens.access_token, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "fictional-client", version: "1" },
    });
    expect(initialize.status).toBe(200);
    expect(await rpcBody(initialize)).toMatchObject({
      result: { protocolVersion: "2025-11-25", serverInfo: { name: "marten" } },
    });
    const listing = await rpc(f, tokens.access_token, "tools/list");
    expect(listing.status).toBe(200);
    const tools = (await rpcBody(listing)).result.tools as {
      name: string;
      annotations: { readOnlyHint: boolean };
    }[];
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "get_accounts",
        "get_report",
        "create_recurring",
        "get_investments",
        "list_credit_scores",
      ]),
    );
    expect(
      tools.some((tool) =>
        /budget|goal|advice|delete|send|trade|link_bank/.test(tool.name),
      ),
    ).toBe(false);
    expect(
      tools.find((tool) => tool.name === "get_accounts")?.annotations
        .readOnlyHint,
    ).toBe(true);
    const read = await rpc(f, tokens.access_token, "tools/call", {
      name: "list_transactions",
      arguments: range,
    });
    expect(read.status).toBe(200);
    const data = JSON.parse((await rpcBody(read)).result.content[0].text) as {
      page: { _id: string }[];
    };
    expect(data.page.map((row) => row._id)).toEqual([
      f.seed.alice.transactionId,
    ]);
    expect(
      (
        await rpc(f, tokens.access_token, "tools/call", {
          name: "update_transaction",
          arguments: {
            id: f.seed.alice.transactionId,
            patch: { notes: "Needs consent" },
          },
        })
      ).status,
    ).toBe(403);
    const foreign = await rpcBody(
      await rpc(f, tokens.access_token, "tools/call", {
        name: "get_transaction",
        arguments: { id: f.seed.bob.transactionId },
      }),
    );
    expect(foreign.result.isError).toBe(true);
    expect(foreign.result.content[0].text).toContain("unavailable");
  });
  test("executes consented writes through the same validators and supports grant revocation", async () => {
    const f = await fixture();
    const tokens = await connected(f, true);
    const result = await rpcBody(
      await rpc(f, tokens.access_token, "tools/call", {
        name: "update_transaction",
        arguments: {
          id: f.seed.alice.transactionId,
          patch: { notes: "Approved MCP edit" },
        },
      }),
    );
    expect(result.result.isError).not.toBe(true);
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.seed.alice.transactionId)))?.notes,
    ).toBe("Approved MCP edit");
    const tooLarge = await f.t.fetch("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ padded: "x".repeat(128001) }),
    });
    expect(tooLarge.status).toBe(400);
    const revoked = await f.t.fetch("/agent/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokens.access_token,
        client_id: "marten-local",
      }).toString(),
    });
    expect(revoked.status).toBe(200);
    expect((await rpc(f, tokens.access_token, "tools/list")).status).toBe(401);
  });
});

describe("client metadata boundaries", () => {
  test("allows registered loopback port changes, but not different hosts, paths or credentials", () => {
    expect(
      redirectAllowed(
        "http://127.0.0.1:9876/callback",
        "http://127.0.0.1/callback",
      ),
    ).toBe(true);
    for (const candidate of [
      "http://localhost:9876/callback",
      "http://127.0.0.1:9876/other",
      "http://user@127.0.0.1/callback",
      "https://127.0.0.1/callback",
      "http://127.0.0.1/callback#fragment",
    ])
      expect(redirectAllowed(candidate, "http://127.0.0.1/callback")).toBe(
        false,
      );
  });
  test("validates client metadata origin, self identity, auth mode and callbacks", async () => {
    const clientId = "https://chatgpt.com/oauth/client.json";
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            client_id: clientId,
            token_endpoint_auth_method: "private_key_jwt",
            token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
            redirect_uris: [
              "https://chatgpt.com/connector_platform_oauth_redirect",
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await resolveAgentClient(clientId)).toMatchObject({
      clientId,
      clientName: "ChatGPT",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      resolveAgentClient("https://untrusted.example.test/oauth/client.json"),
    ).rejects.toThrow("invalid_client");
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const patch of [
      { client_id: "wrong" },
      { token_endpoint_auth_method: "client_secret_post" },
      { redirect_uris: ["https://untrusted.example.test/callback"] },
    ]) {
      fetcher.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              client_id: clientId,
              token_endpoint_auth_method: "none",
              redirect_uris: [
                "https://chatgpt.com/connector_platform_oauth_redirect",
              ],
              ...patch,
            }),
          ),
      );
      await expect(resolveAgentClient(clientId)).rejects.toThrow(
        "invalid_client",
      );
    }
  });
});
