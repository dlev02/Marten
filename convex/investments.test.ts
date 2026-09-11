/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import schema from "./schema";
import {
  normalizeInvestmentEvent,
  normalizePosition,
  normalizeSecurity,
} from "./lib/investmentData";
import { syncInvestments } from "./lib/investmentSync";

const modules = import.meta.glob("./**/*.ts");
const providerSecurity = {
  security_id: "security-one",
  name: "Fictional fund",
  ticker_symbol: "FICT",
  type: "etf",
  iso_currency_code: "USD",
  close_price: 10.025,
  close_price_as_of: "2026-09-10",
};
const providerHolding = {
  account_id: "account-one",
  security_id: "security-one",
  quantity: 12.34567,
  institution_value: 123.77,
  cost_basis: null,
  institution_price: 10.025,
  iso_currency_code: "USD",
  institution_price_as_of: "2026-09-10",
};
const providerEvent = {
  investment_transaction_id: "event-one",
  account_id: "account-one",
  security_id: "security-one",
  date: "2026-09-09",
  name: "Purchase",
  type: "buy",
  subtype: "buy",
  amount: 100.01,
  fees: null,
  quantity: 9.975,
  price: 10.025,
  iso_currency_code: "USD",
  cancel_transaction_id: null,
};
const snapshot = {
  securities: [normalizeSecurity(providerSecurity)],
  holdings: [normalizePosition(providerHolding)],
  events: [normalizeInvestmentEvent(providerEvent)],
  from: "2024-09-11",
  to: "2026-09-11",
};

async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "investor@example.test",
    });
    const otherId = await ctx.db.insert("users", {
      email: "other@example.test",
    });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Investor",
      demo: false,
      reviewNew: true,
      allowPending: true,
      widgets: [],
    });
    const itemId = await ctx.db.insert("plaidItems", {
      userId,
      plaidItemId: "fictional-item",
      accessToken: "fictional-token",
      institutionId: "fictional-bank",
      institution: "Fictional bank",
      products: ["investments"],
      environment: "sandbox",
      status: "syncing",
      syncVersion: 1,
      syncLease: Date.now() + 120000,
    });
    const accountId = await ctx.db.insert("accounts", {
      userId,
      itemId,
      plaidAccountId: "account-one",
      name: "Brokerage",
      institution: "Fictional bank",
      kind: "investment",
      subtype: "brokerage",
      balanceCents: 12377,
      currency: "USD",
      mask: "0000",
      manual: false,
      excludeNetWorth: false,
      updatedAt: Date.now(),
      closed: false,
      hidden: false,
    });
    const otherAccountId = await ctx.db.insert("accounts", {
      userId: otherId,
      name: "Other brokerage",
      institution: "Other bank",
      kind: "investment",
      subtype: "brokerage",
      balanceCents: 999,
      currency: "USD",
      mask: "0000",
      manual: false,
      excludeNetWorth: false,
      updatedAt: Date.now(),
      closed: false,
      hidden: false,
    });
    return { userId, otherId, profileId, itemId, accountId, otherAccountId };
  });
  return {
    t,
    ...data,
    lease: { itemId: data.itemId, version: 1 },
    user: t.withIdentity({ subject: data.userId }),
    other: t.withIdentity({ subject: data.otherId }),
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("investment ingestion", () => {
  test("preserves fractional values and unknown basis, rejects malformed data", () => {
    expect(normalizePosition(providerHolding)).toMatchObject({
      quantity: 12.34567,
      price: 10.025,
      valueCents: 12377,
      basisCents: null,
    });
    expect(
      normalizePosition({ ...providerHolding, cost_basis: 0 }).basisCents,
    ).toBe(0);
    expect(() =>
      normalizePosition({ ...providerHolding, institution_value: NaN }),
    ).toThrow();
    expect(() =>
      normalizeInvestmentEvent({ ...providerEvent, date: "2026-02-30" }),
    ).toThrow();
  });

  test("repeated snapshots keep holding identity, update values, and remove vanished positions", async () => {
    const { t, lease } = await fixture();
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
    });
    const first = (
      await t.run((ctx) => ctx.db.query("investmentHoldings").collect())
    )[0];
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
      holdings: [{ ...snapshot.holdings[0], valueCents: 14000 }],
    });
    expect(await t.run((ctx) => ctx.db.get(first._id))).toMatchObject({
      _id: first._id,
      valueCents: 14000,
      basisCents: null,
    });
    expect(
      await t.run((ctx) => ctx.db.query("investmentTransactions").collect()),
    ).toHaveLength(1);
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
      holdings: [],
    });
    expect(
      await t.run((ctx) => ctx.db.query("investmentHoldings").collect()),
    ).toHaveLength(0);
  });

  test("invalid account or duplicate holdings roll back every write and keep the last snapshot", async () => {
    const { t, lease } = await fixture();
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
    });
    for (const holdings of [
      [{ ...snapshot.holdings[0], providerAccountId: "foreign-account" }],
      [snapshot.holdings[0], snapshot.holdings[0]],
    ]) {
      await expect(
        t.mutation(internal.investmentInternal.commit, {
          ...lease,
          ...snapshot,
          securities: [{ ...snapshot.securities[0], name: "Should roll back" }],
          holdings,
        }),
      ).rejects.toThrow();
      expect(
        (
          await t.run((ctx) => ctx.db.query("investmentSecurities").collect())
        )[0].name,
      ).toBe("Fictional fund");
      expect(
        (await t.run((ctx) => ctx.db.query("investmentHoldings").collect()))[0]
          .valueCents,
      ).toBe(12377);
    }
  });

  test("handles cancellation across snapshots and marks missing events as removed", async () => {
    const { t, lease } = await fixture();
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
    });
    const original = (
      await t.run((ctx) => ctx.db.query("investmentTransactions").collect())
    )[0];
    const reversal = {
      ...snapshot.events[0],
      providerTransactionId: "event-reversal",
      cancelTransactionId: "event-one",
      date: "2026-09-10",
      amountCents: -10001,
    };
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
      from: "2026-09-10",
      events: [reversal],
    });
    expect(await t.run((ctx) => ctx.db.get(original._id))).toMatchObject({
      canceled: true,
      removed: false,
    });
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
      events: [],
    });
    expect(await t.run((ctx) => ctx.db.get(original._id))).toMatchObject({
      removed: true,
    });
  });

  test("rejects expired/superseded leases and live writes into the sample workspace", async () => {
    const { t, lease, profileId } = await fixture();
    await expect(
      t.mutation(internal.investmentInternal.commit, {
        ...lease,
        ...snapshot,
        version: 2,
      }),
    ).rejects.toThrow("superseded");
    await t.run((ctx) => ctx.db.patch(profileId, { demo: true }));
    await expect(
      t.mutation(internal.investmentInternal.commit, { ...lease, ...snapshot }),
    ).rejects.toThrow("personal workspace");
  });
});

describe("investment reads", () => {
  test("anonymous users cannot start or commit a live investment sync even with a personal profile", async () => {
    const { t, user, userId, lease } = await fixture();
    await t.run((ctx) => ctx.db.patch(userId, { isAnonymous: true }));
    await expect(user.mutation(api.investments.sync, {})).rejects.toThrow(
      "public demo",
    );
    await expect(
      t.mutation(internal.investmentInternal.commit, { ...lease, ...snapshot }),
    ).rejects.toThrow("public demo");
    expect(
      await t.run((ctx) => ctx.db.query("investmentHoldings").collect()),
    ).toHaveLength(0);
  });
  test("rejects foreign account filters across every public endpoint", async () => {
    const { user, otherAccountId } = await fixture();
    await expect(
      user.query(api.investments.overview, { accountId: otherAccountId }),
    ).rejects.toThrow();
    await expect(
      user.query(api.investments.history, {
        accountId: otherAccountId,
        from: snapshot.from,
        to: snapshot.to,
      }),
    ).rejects.toThrow();
    await expect(
      user.query(api.investments.activity, {
        accountId: otherAccountId,
        from: snapshot.from,
        to: snapshot.to,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.investments.sync, { accountId: otherAccountId }),
    ).rejects.toThrow();
  });

  test("history waits for complete selected-account coverage and uses the pre-range baseline", async () => {
    const { t, user, userId, accountId } = await fixture();
    await t.run(async (ctx) => {
      const account = await ctx.db.get(accountId);
      if (!account) throw Error("missing fixture");
      const second = await ctx.db.insert("accounts", {
        userId,
        name: "IRA",
        institution: "Fictional bank",
        mask: "0001",
        kind: "investment",
        subtype: "ira",
        balanceCents: 200,
        currency: "USD",
        hidden: false,
        closed: false,
        manual: true,
        excludeNetWorth: false,
        updatedAt: Date.now(),
      });
      for (const [id, day, value] of [
        [accountId, "2026-09-01", 100],
        [accountId, "2026-09-02", 110],
        [second, "2026-09-03", 200],
        [accountId, "2026-09-04", 120],
      ] as const)
        await ctx.db.insert("balances", {
          userId,
          accountId: id,
          date: day,
          balanceCents: value,
        });
    });
    expect(
      await user.query(api.investments.history, {
        from: "2026-09-01",
        to: "2026-09-05",
      }),
    ).toEqual({
      complete: true,
      points: [
        { date: "2026-09-03", value: 310 },
        { date: "2026-09-04", value: 320 },
      ],
    });
    expect(
      await user.query(api.investments.history, {
        from: "2026-09-05",
        to: "2026-09-10",
      }),
    ).toEqual({ complete: true, points: [{ date: "2026-09-05", value: 320 }] });
  });

  test("sample positions are idempotent and sum exactly to account balances", async () => {
    const { t, user, profileId, accountId } = await fixture();
    await expect(
      user.mutation(api.investments.prepareSample, {}),
    ).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(profileId, { demo: true }));
    await user.mutation(api.investments.prepareSample, {});
    await user.mutation(api.investments.prepareSample, {});
    const data = await user.query(api.investments.overview, { accountId });
    expect(data.holdings).toHaveLength(4);
    expect(data.holdings.reduce((sum, row) => sum + row.valueCents, 0)).toBe(
      12377,
    );
    expect(data.holdings.filter((row) => row.basisCents === null)).toHaveLength(
      1,
    );
  });
});

describe("complete provider pagination", () => {
  async function providerFixture(failSecond = false) {
    const result = await fixture();
    vi.stubEnv("PLAID_CLIENT_ID", "fictional-client");
    vi.stubEnv("PLAID_SECRET", "fictional-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");
    const offsets: number[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        options?: { offset: number };
      };
      if (url.endsWith("/investments/holdings/get"))
        return Response.json({
          holdings: [providerHolding],
          securities: [providerSecurity],
        });
      offsets.push(body.options?.offset ?? -1);
      if (body.options?.offset === 0)
        return Response.json({
          investment_transactions: [providerEvent],
          securities: [providerSecurity],
          total_investment_transactions: 2,
        });
      if (failSecond)
        return Response.json(
          {
            error_code: "INTERNAL_SERVER_ERROR",
            error_message: "fictional provider failure",
          },
          { status: 500 },
        );
      return Response.json({
        investment_transactions: [
          {
            ...providerEvent,
            investment_transaction_id: "event-two",
            amount: -100.01,
            cancel_transaction_id: "event-one",
          },
        ],
        securities: [providerSecurity],
        total_investment_transactions: 2,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const actionCtx = {
      runMutation: result.t.mutation.bind(result.t),
    } as unknown as ActionCtx;
    const item = await result.t.run((ctx) => ctx.db.get(result.itemId));
    if (!item) throw Error("missing item");
    return { ...result, item, actionCtx, offsets, fetchMock };
  }

  test("consumes every page before publishing and resolves cross-page cancellation", async () => {
    const { t, item, actionCtx, offsets } = await providerFixture();
    await syncInvestments(actionCtx, item, 1);
    expect(offsets).toEqual([0, 1]);
    const rows = await t.run((ctx) =>
      ctx.db.query("investmentTransactions").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.find((row) => row.providerTransactionId === "event-one")?.canceled,
    ).toBe(true);
  });

  test("a later-page failure does not replace previously cached holdings or activity", async () => {
    const { t, lease, item, actionCtx } = await providerFixture(true);
    await t.mutation(internal.investmentInternal.commit, {
      ...lease,
      ...snapshot,
      holdings: [{ ...snapshot.holdings[0], valueCents: 777 }],
    });
    await expect(syncInvestments(actionCtx, item, 1)).rejects.toThrow();
    expect(
      (await t.run((ctx) => ctx.db.query("investmentHoldings").collect()))[0]
        .valueCents,
    ).toBe(777);
    expect(
      await t.run((ctx) => ctx.db.query("investmentTransactions").collect()),
    ).toHaveLength(1);
  });
});
