/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  lunchflowError,
  parseLunchflowAccounts,
  parseLunchflowBalance,
  parseLunchflowTransactions,
  parseLunchflowHoldings,
} from "./lib/lunchflowApi";
import {
  normalizeSimplefinAccount,
  normalizeSimplefinTransactions,
} from "./lib/simplefinApi";
const modules = import.meta.glob("./**/*.ts");
const remoteAccount = {
  id: 1,
  name: "Fictional Checking",
  institution_name: "Example Bank",
  institution_logo: "https://example.com/logo.png",
  provider: "finicity",
  currency: "USD",
  status: "ACTIVE",
};
const transaction = {
  id: "purchase",
  accountId: 1,
  amount: -12.34,
  currency: "USD",
  date: "2026-09-10",
  merchant: "Fictional Cafe",
  description: "Fictional cafe purchase",
  isPending: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const [userId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "lunchflow-test@example.test" }),
    await ctx.db.insert("users", { email: "other@example.test" }),
  ]);
  const owner = t.withIdentity({ subject: userId }),
    other = t.withIdentity({ subject: otherId });
  await owner.mutation(api.workspace.initialize, { sample: false });
  await other.mutation(api.workspace.initialize, { sample: false });
  const remote = { amount: 1234.56, transactions: [transaction], fail: false };
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(url.origin).toBe("https://lunchflow.app");
    expect(init?.redirect).toBe("error");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
      "fictional-api-key",
    );
    if (remote.fail)
      return new Response("DO NOT EXPOSE THIS BODY fictional-api-key", {
        status: 401,
      });
    if (url.pathname.endsWith("/balance"))
      return Response.json({
        balance: { amount: remote.amount, currency: "USD" },
      });
    if (url.pathname.endsWith("/transactions"))
      return Response.json({
        transactions: remote.transactions,
        total: remote.transactions.length,
      });
    return Response.json({ accounts: [remoteAccount], total: 1 });
  });
  vi.stubGlobal("fetch", fetcher);
  return { t, userId, owner, other, remote, fetcher };
}
describe("Lunch Flow data contract", () => {
  test("validates identities, signed cents, currency, dates and complete lists", () => {
    const account = parseLunchflowAccounts({
      accounts: [remoteAccount],
      total: 1,
    })[0];
    account.balanceCents = parseLunchflowBalance(
      { balance: { amount: -123.45, currency: "USD" } },
      "USD",
    );
    expect(
      normalizeSimplefinAccount(account, {
        externalAccountId: account.id,
        kind: "credit",
      }).balanceCents,
    ).toBe(12345);
    account.transactions = parseLunchflowTransactions(
      {
        transactions: [
          transaction,
          { ...transaction, id: "refund", amount: 2.34 },
          { ...transaction, id: "pending", isPending: true },
        ],
        total: 3,
      },
      account,
    );
    const normalized = normalizeSimplefinTransactions(
      account,
      "2026-09-01",
      "2026-09-30",
    );
    expect(normalized.transactions.map((row) => row.amountCents)).toEqual([
      1234, -234,
    ]);
    expect(normalized.skippedPending).toBe(1);
    for (const patch of [
      { accountId: 2 },
      { currency: "EUR" },
      { date: "2026-02-30" },
      { amount: NaN },
      { isPending: "false" },
    ]) {
      expect(() =>
        parseLunchflowTransactions(
          { transactions: [{ ...transaction, ...patch }], total: 1 },
          account,
        ),
      ).toThrow();
    }
    expect(() =>
      parseLunchflowAccounts({ accounts: [remoteAccount], total: 2 }),
    ).toThrow();
    expect(() =>
      parseLunchflowTransactions(
        { transactions: [transaction, transaction], total: 2 },
        account,
      ),
    ).toThrow();
    expect(() =>
      parseLunchflowBalance({ balance: { amount: 1, currency: "EUR" } }, "USD"),
    ).toThrow();
    expect(() => parseLunchflowHoldings({}, "USD")).toThrow();
    expect(
      parseLunchflowHoldings({ holdings: [], currency: "USD" }, "USD"),
    ).toEqual([]);
    expect(
      parseLunchflowHoldings(
        {
          holdings: [
            {
              security: {
                name: "Fictional Fund",
                tickerSymbol: "FICTIONAL",
                currency: "USD",
              },
              quantity: 2,
              value: 40,
              price: 20,
              currency: "USD",
            },
          ],
          currency: "USD",
        },
        "USD",
      )[0].valueCents,
    ).toBe(4000);
  });
  test("never exposes provider bodies or unknown errors", () => {
    expect(lunchflowError(new Error("fictional-api-key"))).not.toContain(
      "fictional-api-key",
    );
  });
});
describe("Lunch Flow owned import lifecycle", () => {
  test("coexists with SimpleFIN, preserves edits on retry, fences disconnect, and forgets only its credential", async () => {
    const { t, userId, owner, other, remote } = await fixture();
    vi.stubEnv("CREDENTIALS_KEY", btoa("a".repeat(32)));
    await t.run((ctx) =>
      ctx.db.insert("simplefinConnections", {
        userId,
        accessUrl: "fictional-simplefin",
        host: "bridge.example.com",
        status: "connected",
        syncVersion: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const connected = await owner.action(api.simplefin.connect, {
      provider: "lunchflow",
      setupToken: "fictional-api-key",
    });
    expect(connected.preview?.accounts).toHaveLength(1);
    const status = await owner.query(api.simplefin.status, {
      provider: "lunchflow",
    });
    const id = status.connection!._id;
    expect(status.connection?.sealed).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(id)))?.accessUrl).not.toContain(
      "fictional-api-key",
    );
    expect(JSON.stringify(status)).not.toContain("fictional-api-key");
    expect(
      (await owner.query(api.simplefin.status, {})).connection?._id,
    ).not.toBe(id);
    expect(
      (await other.query(api.simplefin.status, { provider: "lunchflow" }))
        .connection,
    ).toBeNull();
    await expect(
      other.mutation(api.simplefin.disconnect, { connectionId: id }),
    ).rejects.toThrow();
    const args = {
      provider: "lunchflow" as const,
      fromDate: "2026-09-01",
      accounts: [{ externalAccountId: "lunchflow:1", kind: "cash" as const }],
    };
    expect(
      (await owner.action(api.simplefin.importAccounts, args)).imported,
    ).toBe(1);
    const before = await t.run((ctx) => ctx.db.query("transactions").first());
    expect(before?.source).toBe("lunchflow");
    await t.run((ctx) =>
      ctx.db.patch(before!._id, { notes: "Keep my note", reviewed: true }),
    );
    remote.transactions = [{ ...transaction, amount: -15 }];
    const retried = await owner.action(api.simplefin.importAccounts, args);
    expect(retried.imported).toBe(0);
    expect(retried.updated).toBe(1);
    const saved = await t.run((ctx) => ctx.db.query("transactions").collect());
    expect(saved).toHaveLength(1);
    expect(saved[0].notes).toBe("Keep my note");
    expect(saved[0].amountCents).toBe(1500);
    const account = (await owner.query(api.workspace.metadata, {})).accounts[0];
    expect(account.connectionProvider).toBe("finicity");
    expect(account.bankProvider).toBe("lunchflow");
    const connection = await t.run((ctx) => ctx.db.get(id));
    await owner.mutation(api.simplefin.disconnect, { connectionId: id });
    await expect(
      t.mutation(internal.simplefinInternal.ingest, {
        connectionId: id,
        version: connection!.syncVersion,
        accountId: account._id,
        transactions: [],
      }),
    ).rejects.toThrow();
    await owner.mutation(api.simplefin.remove, { provider: "lunchflow" });
    expect(
      (await owner.query(api.simplefin.status, {})).connection,
    ).not.toBeNull();
    expect(
      (await owner.query(api.workspace.metadata, {})).accounts[0].manual,
    ).toBe(true);
    expect(
      await t.run((ctx) => ctx.db.query("transactions").collect()),
    ).toHaveLength(1);
  });
  test("invalid responses change no balances and rejected replacement keys keep the old connection", async () => {
    const { owner, remote } = await fixture();
    await owner.action(api.simplefin.connect, {
      provider: "lunchflow",
      setupToken: "fictional-api-key",
    });
    const before = await owner.query(api.simplefin.status, {
      provider: "lunchflow",
    });
    remote.fail = true;
    await expect(
      owner.action(api.simplefin.connect, {
        provider: "lunchflow",
        setupToken: "fictional-api-key",
      }),
    ).rejects.toThrow("rejected");
    expect(
      await owner.query(api.simplefin.status, { provider: "lunchflow" }),
    ).toEqual(before);
    remote.fail = false;
    remote.transactions = [{ ...transaction, currency: "EUR" }];
    await expect(
      owner.action(api.simplefin.importAccounts, {
        provider: "lunchflow",
        fromDate: "2026-09-01",
        accounts: [{ externalAccountId: "lunchflow:1", kind: "cash" }],
      }),
    ).rejects.toThrow();
    expect(
      (await owner.query(api.workspace.metadata, {})).accounts,
    ).toHaveLength(0);
  });
  test("demo workspaces cannot connect and chart defaults reject unsupported combinations", async () => {
    const { t, owner } = await fixture();
    const guestId = await t.run((ctx) =>
      ctx.db.insert("users", { isAnonymous: true }),
    );
    const guest = t.withIdentity({ subject: guestId });
    await guest.mutation(api.workspace.initialize, { sample: true });
    expect(
      (await guest.query(api.workspace.metadata, {})).profile?.widgets,
    ).toContain("creditScore");
    await expect(
      guest.action(api.simplefin.connect, {
        provider: "lunchflow",
        setupToken: "fictional-api-key",
      }),
    ).rejects.toThrow();
    await owner.mutation(api.workspace.saveProfile, {
      chartDefaults: {
        spending: "treemap",
        income: "donut",
        cashflow: "sankey",
      },
    });
    expect(
      (await owner.query(api.workspace.metadata, {})).profile?.chartDefaults
        ?.spending,
    ).toBe("treemap");
    await expect(
      owner.mutation(api.workspace.saveProfile, {
        chartDefaults: { spending: "sankey", income: "bar", cashflow: "bar" },
      } as never),
    ).rejects.toThrow();
    const scores = await t.run((ctx) =>
      ctx.db
        .query("creditScores")
        .withIndex("by_userId_and_date", (q) => q.eq("userId", guestId))
        .collect(),
    );
    expect(scores).toHaveLength(6);
    expect(
      scores.every((score) => score.source === "Fictional demo observation"),
    ).toBe(true);
    await guest.mutation(api.workspace.initialize, { sample: true });
    expect(
      await t.run((ctx) => ctx.db.query("creditScores").collect()),
    ).toHaveLength(6);
  });
});
