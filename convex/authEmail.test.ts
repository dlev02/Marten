/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const alice = "reset-alice@example.test";
const bob = "reset-bob@example.test";
const oldPassword = "Fictional-old-password-123";
const newPassword = "Fictional-new-password-456";
let privateKey: string;
let now: number;
let deliveries: { email: string; code: string }[];
let deliveryFailure: "http" | "network" | null;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = await exportPKCS8(pair.privateKey);
});
beforeEach(() => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubEnv("JWT_PRIVATE_KEY", privateKey);
  vi.stubEnv("CONVEX_SITE_URL", "https://fictional-auth.convex.site");
  vi.stubEnv("SITE_URL", "https://folio.example.test");
  vi.stubEnv("AUTH_BREVO_KEY", "fictional-email-provider-key");
  vi.stubEnv("AUTH_EMAIL_FROM", "folio@example.test");
  vi.stubEnv("AUTH_LOG_LEVEL", "ERROR");
  deliveries = [];
  deliveryFailure = null;
  // Only this mocked delivery endpoint is permitted; no real messages leave the test.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input) !== "https://api.brevo.com/v3/smtp/email" ||
        init?.method !== "POST"
      )
        throw new Error("Unexpected network request in password-reset test.");
      if (deliveryFailure === "network")
        throw new Error("fictional-private-provider-diagnostic");
      if (deliveryFailure === "http")
        return new Response("fictional-private-provider-diagnostic", {
          status: 503,
        });
      const body = JSON.parse(String(init.body)) as {
        to: { email: string }[];
        textContent: string;
      };
      const code = body.textContent.match(/code is (\d{8})\./)?.[1];
      if (!code)
        throw new Error("Expected an eight-digit code in the mocked message.");
      deliveries.push({ email: body.to[0].email, code });
      return new Response(JSON.stringify({ messageId: "fictional-delivery" }), {
        status: 201,
      });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function authFixture() {
  const t = convexTest(schema, modules);
  const signUp = (email: string) =>
    t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signUp", email, password: oldPassword },
    });
  const request = (email = alice) =>
    t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email },
    });
  const verify = (code: string, email = alice) =>
    t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset-verification", email, code, newPassword },
    });
  const signIn = (password: string, email = alice) =>
    t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password },
    });
  return { t, signUp, request, verify, signIn };
}

describe("real Password provider reset flow", () => {
  test("a rate-limited resend preserves the first code; reset changes the password and consumes the code", async () => {
    const { t, signUp, request, verify, signIn } = authFixture();
    expect((await signUp(alice)).tokens?.token !== undefined).toBe(true);
    const originalSessions = await t.run((ctx) =>
      ctx.db.query("authSessions").collect(),
    );
    await request();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].email).toBe(alice);
    const code = deliveries[0].code;
    const before = await t.run((ctx) =>
      ctx.db.query("authVerificationCodes").unique(),
    );
    expect(before?.expirationTime).toBe(now + 15 * 60 * 1000);
    now += 30_000;
    await expect(request(`  ${alice.toUpperCase()}  `)).rejects.toThrow(
      "wait a minute",
    );
    expect(deliveries).toHaveLength(1);
    const after = await t.run((ctx) =>
      ctx.db.query("authVerificationCodes").unique(),
    );
    expect(after?._id).toBe(before?._id);
    expect((await verify(code)).tokens?.token !== undefined).toBe(true);
    const activeSessions = await t.run((ctx) =>
      ctx.db.query("authSessions").collect(),
    );
    expect(
      activeSessions.some((session) =>
        originalSessions.some((original) => original._id === session._id),
      ),
    ).toBe(false);
    await expect(signIn(oldPassword)).rejects.toThrow();
    expect((await signIn(newPassword)).tokens?.token !== undefined).toBe(true);
    await expect(verify(code)).rejects.toThrow();
  });

  test("an expired code is rejected without changing the password", async () => {
    const { signUp, request, verify, signIn } = authFixture();
    await signUp(alice);
    await request();
    const code = deliveries[0].code;
    now += 15 * 60 * 1000 + 1;
    await expect(verify(code)).rejects.toThrow();
    expect((await signIn(oldPassword)).tokens?.token !== undefined).toBe(true);
    await expect(signIn(newPassword)).rejects.toThrow();
  });

  test("signup cannot claim verified email; a completed mailbox reset unlocks the Plaid allowlist", async () => {
    vi.stubEnv("PLAID_ALLOWED_EMAILS", alice);
    const { t, request, verify } = authFixture();
    await t.action(api.auth.signIn, {
      provider: "password",
      params: {
        flow: "signUp",
        email: alice,
        password: oldPassword,
        emailVerified: true,
        emailVerificationTime: now,
      },
    });
    const user = await t.run((ctx) => ctx.db.query("users").unique());
    if (!user) throw new Error("Expected fictional signup user");
    const asUser = t.withIdentity({ subject: user._id });
    expect(user.emailVerificationTime).toBeUndefined();
    expect(await asUser.query(api.plaid.status, {})).toMatchObject({
      restricted: true,
    });
    await request();
    expect(
      (await t.run((ctx) => ctx.db.get(user._id)))?.emailVerificationTime,
    ).toBeUndefined();
    expect(await asUser.query(api.plaid.status, {})).toMatchObject({
      restricted: true,
    });
    await verify(deliveries[0].code);
    expect(
      (await t.run((ctx) => ctx.db.get(user._id)))?.emailVerificationTime,
    ).toBe(now);
    expect(await asUser.query(api.plaid.status, {})).toMatchObject({
      restricted: false,
    });
  });

  test("another account and noncanonical spellings cannot redeem a valid code", async () => {
    const { signUp, request, verify, signIn } = authFixture();
    await signUp(alice);
    await signUp(bob);
    await request();
    const code = deliveries[0].code;
    await expect(verify(code, bob)).rejects.toThrow();
    await expect(verify(code, alice.toUpperCase())).rejects.toThrow();
    await expect(verify(code, ` ${alice} `)).rejects.toThrow();
    expect((await verify(code)).tokens?.token !== undefined).toBe(true);
    expect((await signIn(oldPassword, bob)).tokens?.token !== undefined).toBe(
      true,
    );
    await expect(signIn(newPassword, bob)).rejects.toThrow();
  });

  test.each(["http", "network"] as const)(
    "%s delivery failures return a safe retry message without provider diagnostics",
    async (failure) => {
      const { signUp, request } = authFixture();
      await signUp(alice);
      deliveryFailure = failure;
      const message = await request().then(
        () => "",
        (error: unknown) => String(error),
      );
      expect(message.includes("We couldn’t send the code")).toBe(true);
      expect(message.includes("fictional-private-provider-diagnostic")).toBe(
        false,
      );
      expect(message.includes("fictional-email-provider-key")).toBe(false);
      expect(deliveries).toHaveLength(0);
    },
  );
});
