/// <reference types="vite/client" />
/**
 * Unattended assistant access: inactivity-based grant lifetimes, refresh
 * retries, scope handling, dynamic client registration, personal access keys
 * and pending account deletion. Fictional data only; no network calls.
 */
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  AGENT_NEVER,
  hashSecret,
  pkceChallenge,
  validateRegistration,
} from "./lib/agentAuth";

const modules = import.meta.glob("./**/*.ts");
const base = "https://marten-fixture.convex.site";
const resource = `${base}/mcp`;
const loopbackRedirect = "http://127.0.0.1:45678/callback";
const verifier = "b".repeat(43);
const DAY = 24 * 60 * 60_000;
let now: number;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  now = Date.parse("2026-09-29T14:00:00Z");
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
      return { userId, profileId, accountId };
    }
    return { alice: await owner("alice"), bob: await owner("bob") };
  });
  return {
    t,
    seed,
    alice: t.withIdentity({ subject: seed.alice.userId }),
    bob: t.withIdentity({ subject: seed.bob.userId }),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Tokens = { access_token: string; refresh_token: string; scope: string };

async function start(
  f: Fixture,
  { clientId = "marten-local", redirect = loopbackRedirect, scope = "" } = {},
) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    resource,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    ...(scope ? { scope } : {}),
  });
  return await f.t.fetch(`/agent/oauth/authorize?${params.toString()}`);
}
async function connect(
  f: Fixture,
  {
    clientId = "marten-local",
    redirect = loopbackRedirect,
    scope = "finance:read finance:write offline_access",
    allowEdits = false,
    lifetime = undefined as "idle" | "fixed" | "untilRevoked" | undefined,
  } = {},
) {
  const started = await start(f, { clientId, redirect, scope });
  expect(started.status).toBe(302);
  const request = new URL(started.headers.get("location")!).searchParams.get(
    "request",
  )!;
  const { redirectUrl } = await f.alice.action(api.agentAccess.authorize, {
    request,
    allowEdits,
    ...(lifetime ? { lifetime } : {}),
  });
  const code = new URL(redirectUrl).searchParams.get("code")!;
  const response = await token(f, clientId, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Tokens;
}
async function token(
  f: Fixture,
  clientId: string,
  values: Record<string, string>,
) {
  return await f.t.fetch("/agent/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      resource,
      ...values,
    }).toString(),
  });
}
const refresh = (f: Fixture, refreshToken: string, clientId = "marten-local") =>
  token(f, clientId, { grant_type: "refresh_token", refresh_token: refreshToken });
async function call(f: Fixture, bearer: string, name: string, args = {}) {
  return await f.t.fetch("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}
async function register(f: Fixture, body: unknown, address = "203.0.113.7") {
  return await f.t.fetch("/agent/oauth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": address,
    },
    body: JSON.stringify(body),
  });
}
const grants = (f: Fixture) =>
  f.t.run((ctx) => ctx.db.query("agentGrants").collect());

describe("discovery for unattended clients", () => {
  test("advertises every scope, offline_access and a registration endpoint", async () => {
    const f = await fixture();
    const unauthenticated = await f.t.fetch("/mcp", { method: "POST" });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toContain(
      'scope="finance:read finance:write offline_access"',
    );
    const protectedResource = await (
      await f.t.fetch("/.well-known/oauth-protected-resource/mcp")
    ).json();
    expect(protectedResource.scopes_supported).toEqual([
      "finance:read",
      "finance:write",
      "offline_access",
    ]);
    const server = await (
      await f.t.fetch("/.well-known/oauth-authorization-server/agent")
    ).json();
    expect(server).toMatchObject({
      registration_endpoint: `${base}/agent/oauth/register`,
      scopes_supported: ["finance:read", "finance:write", "offline_access"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
  test("requesting every advertised scope still defaults to read-only", async () => {
    const f = await fixture();
    const tokens = await connect(f);
    expect(tokens.scope).toBe("finance:read offline_access");
    expect(tokens.refresh_token).toMatch(/^marten_refresh_/);
    const write = await call(f, tokens.access_token, "update_account", {
      id: f.seed.alice.accountId,
      patch: { name: "Renamed" },
    });
    expect(write.status).toBe(403);
    expect(write.headers.get("www-authenticate")).toContain(
      'scope="finance:read finance:write"',
    );
  });
});

describe("grant lifetimes", () => {
  test("a while-in-use grant outlives 30 days of use and ends after 90 idle days", async () => {
    const f = await fixture();
    let tokens = await connect(f);
    const [grant] = await grants(f);
    expect(grant).toMatchObject({ lifetime: "idle", credential: "oauth" });
    expect(grant.expiresAt).toBe(now + 90 * DAY);
    // Weekly use over two months, refreshing each time.
    for (let week = 0; week < 9; week++) {
      now += 7 * DAY;
      const renewed = await refresh(f, tokens.refresh_token);
      expect(renewed.status).toBe(200);
      tokens = (await renewed.json()) as Tokens;
      expect(
        (await call(f, tokens.access_token, "get_accounts")).status,
      ).toBe(200);
    }
    const [used] = await grants(f);
    expect(used.expiresAt).toBe(now + 90 * DAY);
    expect(used.lastUsedAt).toBe(now);
    const status = await f.alice.query(api.agentAccess.status, { now });
    expect(status.grants[0]).toMatchObject({
      lifetime: "idle",
      lastUsedAt: now,
      trust: "local",
    });
    // Ninety days without any use ends it.
    now += 90 * DAY + 1;
    expect((await refresh(f, tokens.refresh_token)).status).toBe(400);
    expect(
      (await f.alice.query(api.agentAccess.status, { now })).grants,
    ).toEqual([]);
  });
  test("a 30-day grant ends on its date even when used", async () => {
    const f = await fixture();
    let tokens = await connect(f, { lifetime: "fixed" });
    const created = now;
    for (let week = 0; week < 4; week++) {
      now += 7 * DAY;
      tokens = (await (await refresh(f, tokens.refresh_token)).json()) as Tokens;
    }
    expect((await grants(f))[0].expiresAt).toBe(created + 30 * DAY);
    now = created + 30 * DAY;
    expect((await refresh(f, tokens.refresh_token)).status).toBe(400);
  });
  test("an until-disconnected grant has no deadline and stops only when revoked", async () => {
    const f = await fixture();
    let tokens = await connect(f, { lifetime: "untilRevoked" });
    expect((await grants(f))[0].expiresAt).toBe(AGENT_NEVER);
    now += 400 * DAY;
    const renewed = await refresh(f, tokens.refresh_token);
    expect(renewed.status).toBe(200);
    tokens = (await renewed.json()) as Tokens;
    expect((await call(f, tokens.access_token, "get_accounts")).status).toBe(
      200,
    );
    const [grant] = (await f.alice.query(api.agentAccess.status, { now }))
      .grants;
    await f.alice.mutation(api.agentAccess.revoke, { id: grant._id });
    expect((await call(f, tokens.access_token, "get_accounts")).status).toBe(
      401,
    );
    // Revocation removes the grant's tokens instead of leaving them to expire.
    expect(
      await f.t.run((ctx) => ctx.db.query("agentTokens").collect()),
    ).toEqual([]);
  });
  test("the hourly sweep removes expired and replay-window token rows", async () => {
    const f = await fixture();
    const tokens = await connect(f);
    await refresh(f, tokens.refresh_token);
    const count = async () =>
      (await f.t.run((ctx) => ctx.db.query("agentTokens").collect())).length;
    expect(await count()).toBe(4);
    now += 2 * DAY;
    await f.t.mutation(internal.agentAccess.sweepTokens, {});
    // Both access tokens and the used refresh token are gone; the live one stays.
    expect(await count()).toBe(1);
  });
});

describe("pending account deletion", () => {
  test("stops existing tokens, refresh, consent and key creation", async () => {
    const f = await fixture();
    const tokens = await connect(f);
    await f.t.run((ctx) =>
      ctx.db.patch(f.seed.alice.profileId, { deletionRequestedAt: now }),
    );
    expect((await call(f, tokens.access_token, "get_accounts")).status).toBe(
      401,
    );
    expect((await refresh(f, tokens.refresh_token)).status).toBe(400);
    const started = await start(f);
    const request = new URL(started.headers.get("location")!).searchParams.get(
      "request",
    )!;
    await expect(
      f.alice.action(api.agentAccess.authorize, { request, allowEdits: false }),
    ).rejects.toThrow("personal workspace");
    await expect(
      f.alice.action(api.agentAccess.createAccessKey, {
        name: "Muse",
        allowEdits: false,
        lifetime: "90d",
      }),
    ).rejects.toThrow("personal workspace");
    expect(
      (await f.alice.query(api.agentAccess.browserStatus, {})).canEnable,
    ).toBe(false);
  });
});

describe("dynamic client registration", () => {
  const grok = {
    client_name: "Grok",
    redirect_uris: ["https://grok.example.test/oauth/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
  test("registers a public client that completes PKCE and is shown as unverified", async () => {
    const f = await fixture();
    const response = await register(f, grok);
    expect(response.status).toBe(201);
    const client = await response.json();
    expect(client).toMatchObject({
      client_name: "Grok",
      redirect_uris: grok.redirect_uris,
      token_endpoint_auth_method: "none",
    });
    expect(client.client_id).toMatch(/^marten_client_[A-Za-z0-9_-]{43}$/);
    expect(client.client_secret).toBeUndefined();

    // Callbacks must match exactly; a different host or path is refused.
    for (const redirect of [
      "https://evil.example.test/oauth/callback",
      "https://grok.example.test/other",
    ])
      expect(
        (await start(f, { clientId: client.client_id, redirect })).status,
      ).toBe(400);

    const started = await start(f, {
      clientId: client.client_id,
      redirect: grok.redirect_uris[0],
      scope: "finance:read finance:write offline_access",
    });
    const request = new URL(started.headers.get("location")!).searchParams.get(
      "request",
    )!;
    expect(
      await f.alice.query(api.agentAccess.authorizationRequest, { request }),
    ).toMatchObject({ clientName: "Grok", trust: "unverified" });
    const { redirectUrl } = await f.alice.action(api.agentAccess.authorize, {
      request,
      allowEdits: false,
    });
    const callback = new URL(redirectUrl);
    expect(callback.origin).toBe("https://grok.example.test");
    const code = callback.searchParams.get("code")!;
    // Without the verifier the code is useless.
    expect(
      (
        await token(f, client.client_id, {
          grant_type: "authorization_code",
          code,
          redirect_uri: grok.redirect_uris[0],
          code_verifier: "c".repeat(43),
        })
      ).status,
    ).toBe(400);
  });
  test("completes a full DCR connection and appears unverified in Settings", async () => {
    const f = await fixture();
    const client = await (await register(f, grok)).json();
    const tokens = await connect(f, {
      clientId: client.client_id,
      redirect: grok.redirect_uris[0],
    });
    expect((await call(f, tokens.access_token, "get_accounts")).status).toBe(
      200,
    );
    expect(
      (await refresh(f, tokens.refresh_token, client.client_id)).status,
    ).toBe(200);
    const status = await f.alice.query(api.agentAccess.status, { now });
    expect(status.grants[0]).toMatchObject({
      clientName: "Grok",
      trust: "unverified",
    });
  });
  test("rejects secrets, unsafe callbacks and unsupported grant types", async () => {
    const f = await fixture();
    for (const body of [
      { ...grok, token_endpoint_auth_method: "client_secret_basic" },
      { ...grok, redirect_uris: ["http://grok.example.test/callback"] },
      { ...grok, redirect_uris: ["https://grok.example.test/cb#frag"] },
      { ...grok, redirect_uris: ["https://user:pw@grok.example.test/cb"] },
      { ...grok, redirect_uris: ["javascript:alert(1)"] },
      { ...grok, redirect_uris: [] },
      { ...grok, grant_types: ["client_credentials"] },
      { ...grok, response_types: ["token"] },
      [grok],
    ]) {
      const response = await register(f, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(
        /^invalid_(redirect_uri|client_metadata)$/,
      );
    }
    expect(
      (
        await f.t.fetch("/agent/oauth/register", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    expect(
      await f.t.run((ctx) => ctx.db.query("agentClients").collect()),
    ).toEqual([]);
    // Loopback HTTP is allowed for native and development clients.
    expect(
      validateRegistration({
        redirect_uris: ["http://127.0.0.1/callback", "http://localhost:3000/cb"],
      }),
    ).toMatchObject({ clientName: "127.0.0.1" });
    // Self-asserted names lose control and direction-override characters.
    expect(
      validateRegistration({
        client_name: "Gr‮ok\u0000  app",
        redirect_uris: ["https://grok.example.test/cb"],
      }).clientName,
    ).toBe("Grok app");
  });
  test("rate limits registration per address", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++)
      expect((await register(f, grok)).status).toBe(201);
    expect((await register(f, grok)).status).toBe(429);
    expect((await register(f, grok, "198.51.100.9")).status).toBe(201);
  });
  test("removes registrations with no live connection after a day", async () => {
    const f = await fixture();
    const unused = await (await register(f, grok)).json();
    const used = await (await register(f, grok, "198.51.100.9")).json();
    await connect(f, {
      clientId: used.client_id,
      redirect: grok.redirect_uris[0],
    });
    now += 2 * DAY;
    await f.t.mutation(internal.agentClients.sweep, { cursor: null });
    const remaining = await f.t.run((ctx) =>
      ctx.db.query("agentClients").collect(),
    );
    expect(remaining.map((client) => client.clientId)).toEqual([
      used.client_id,
    ]);
    expect(
      (await start(f, {
        clientId: unused.client_id,
        redirect: grok.redirect_uris[0],
      })).status,
    ).toBe(400);
  });
});

describe("personal access keys", () => {
  test("are shown once, stored hashed, scoped, logged and revocable", async () => {
    const f = await fixture();
    const { key, id } = await f.alice.action(
      api.agentAccess.createAccessKey,
      { name: "  Muse  ", allowEdits: false, lifetime: "never" },
    );
    expect(key).toMatch(/^mrtn_[A-Za-z0-9_-]{43}$/);
    const stored = JSON.stringify(
      await f.t.run(async (ctx) => ({
        grants: await ctx.db.query("agentGrants").collect(),
        tokens: await ctx.db.query("agentTokens").collect(),
      })),
    );
    expect(stored.includes(key)).toBe(false);
    expect(stored.includes(hashSecret(key))).toBe(true);

    const read = await call(f, key, "get_accounts");
    expect(read.status).toBe(200);
    expect(await read.text()).toContain("alice checking");
    const write = await call(f, key, "update_account", {
      id: f.seed.alice.accountId,
      patch: { name: "Renamed" },
    });
    expect(write.status).toBe(403);

    const status = await f.alice.query(api.agentAccess.status, { now });
    expect(status.grants).toEqual([]);
    expect(status.keys).toHaveLength(1);
    expect(status.keys[0]).toMatchObject({
      _id: id,
      clientName: "Muse",
      scopes: ["finance:read"],
      lifetime: "untilRevoked",
      lastUsedAt: now,
    });
    expect(status.activity[0]).toMatchObject({
      tool: "get_accounts",
      source: "mcp",
      connection: "Muse",
    });
    expect(JSON.stringify(status)).not.toMatch(/mrtn_|tokenHash/);

    // A key is not an OAuth credential.
    expect((await refresh(f, key, "marten-access-key")).status).toBe(400);
    await f.t.fetch("/agent/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: key }).toString(),
    });
    expect((await call(f, key, "get_accounts")).status).toBe(200);

    await expect(
      f.bob.mutation(api.agentAccess.revoke, { id }),
    ).rejects.toThrow("unavailable");
    await f.alice.mutation(api.agentAccess.revoke, { id });
    expect((await call(f, key, "get_accounts")).status).toBe(401);
  });
  test("edit keys can write, fixed keys expire, and bad names or formats fail", async () => {
    const f = await fixture();
    const { key } = await f.alice.action(api.agentAccess.createAccessKey, {
      name: "Muse edits",
      allowEdits: true,
      lifetime: "30d",
    });
    const write = await call(f, key, "update_account", {
      id: f.seed.bob.accountId,
      patch: { name: "Not yours" },
    });
    expect(write.status).toBe(200);
    expect(await write.text()).toContain("unavailable");
    expect(
      (
        await call(f, key, "update_account", {
          id: f.seed.alice.accountId,
          patch: { name: "Everyday" },
        })
      ).status,
    ).toBe(200);
    now += 30 * DAY;
    expect((await call(f, key, "get_accounts")).status).toBe(401);
    await expect(
      f.alice.action(api.agentAccess.createAccessKey, {
        name: "   ",
        allowEdits: false,
        lifetime: "90d",
      }),
    ).rejects.toThrow("Name this key");
    expect((await call(f, "mrtn_short", "get_accounts")).status).toBe(401);
    expect(
      (await call(f, `mrtn_${"x".repeat(43)}`, "get_accounts")).status,
    ).toBe(401);
    // Guests and sample workspaces cannot create keys.
    await f.t.run((ctx) =>
      ctx.db.patch(f.seed.bob.profileId, { demo: true }),
    );
    await expect(
      f.bob.action(api.agentAccess.createAccessKey, {
        name: "Sample",
        allowEdits: false,
        lifetime: "30d",
      }),
    ).rejects.toThrow("Demo and sample");
  });
});
