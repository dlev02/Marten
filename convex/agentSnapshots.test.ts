/// <reference types="vite/client" />
/**
 * Snapshot tools (accounts, balances, statements, credit scores), provenance
 * of assistant-written values, and the audited activity log with retention.
 * Fictional data only; no network calls.
 */
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { agentToolAnnotations, agentToolSchemas } from "./lib/agentTools";
import { auditValue, AUDIT_CHANGE_LIMIT } from "./lib/agentAudit";
import { dueReminders, defaultReminderPreferences } from "./lib/reminders";

const modules = import.meta.glob("./**/*.ts");
const base = "https://marten-fixture.convex.site";
type Row = Record<string, any>;
const DAY = 86_400_000;
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

const account = (
  userId: Id<"users">,
  fields: Partial<Doc<"accounts">>,
): Omit<Doc<"accounts">, "_id" | "_creationTime"> => ({
  userId,
  name: "Account",
  institution: "Fictional Bank",
  mask: "0001",
  kind: "cash",
  subtype: "checking",
  balanceCents: 0,
  currency: "USD",
  hidden: false,
  excludeNetWorth: false,
  closed: false,
  manual: true,
  updatedAt: now - 10 * DAY,
  ...fields,
});

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const seed = await t.run(async (ctx) => {
    async function owner(label: string) {
      const userId = await ctx.db.insert("users", {
        email: `${label}@example.test`,
      });
      await ctx.db.insert("profiles", {
        userId,
        name: label,
        demo: false,
        reviewNew: true,
        allowPending: false,
        widgets: [],
      });
      const card = await ctx.db.insert(
        "accounts",
        account(userId, {
          name: `${label} store card`,
          institution: "Fictional Card Co",
          mask: "4321",
          kind: "credit",
          subtype: "credit card",
          balanceCents: 12000,
          dueDate: "2026-09-05",
          statementCents: 9000,
          minimumCents: 2500,
        }),
      );
      const cash = await ctx.db.insert(
        "accounts",
        account(userId, { name: `${label} savings`, balanceCents: 50000 }),
      );
      // A Plaid card whose feed supplies statements, and a SimpleFIN card
      // whose feed supplies none.
      const plaidCard = await ctx.db.insert(
        "accounts",
        account(userId, {
          name: `${label} bank card`,
          mask: "7777",
          kind: "credit",
          subtype: "credit card",
          manual: false,
          plaidAccountId: `plaid-${label}`,
          balanceCents: 30000,
          dueDate: "2026-10-12",
          statementCents: 28000,
          minimumCents: 3500,
        }),
      );
      const simplefinCard = await ctx.db.insert(
        "accounts",
        account(userId, {
          name: `${label} other card`,
          mask: "8888",
          kind: "credit",
          subtype: "credit card",
          manual: false,
          bankProvider: "simplefin",
          balanceCents: 4000,
        }),
      );
      const merchantId = await ctx.db.insert("merchants", {
        userId,
        name: "Fictional Grocer",
        normalizedName: "fictional grocer",
        color: "#123456",
        transactionCount: 0,
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
      const diningId = await ctx.db.insert("categories", {
        userId,
        groupId,
        name: "Dining",
        emoji: "",
        order: 1,
        enabled: true,
      });
      const transactionId = await ctx.db.insert("transactions", {
        userId,
        accountId: cash,
        merchantId,
        categoryId,
        amountCents: 1000,
        date: "2026-09-28",
        originalName: "FICTIONAL GROCER",
        notes: "",
        tagIds: [],
        reviewed: false,
        hidden: false,
        pending: false,
        splits: [],
        source: "manual",
        searchText: "fictional grocer",
        updatedAt: now,
        editedFields: [],
      });
      return {
        userId,
        card,
        cash,
        plaidCard,
        simplefinCard,
        merchantId,
        categoryId,
        diningId,
        transactionId,
      };
    }
    return { alice: await owner("alice"), bob: await owner("bob") };
  });
  const alice = t.withIdentity({ subject: seed.alice.userId });
  const call = <T = Row>(name: string, args: unknown = {}) =>
    alice.action(api.agentAccess.execute, {
      name,
      arguments: args,
    }) as Promise<T>;
  const enable = (allowEdits = true) =>
    alice.mutation(api.agentAccess.setBrowserAccess, {
      enabled: true,
      allowEdits,
    });
  const balances = (accountId: Id<"accounts">) =>
    t.run((ctx) =>
      ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) => q.eq("accountId", accountId))
        .collect(),
    );
  const get = <T extends "accounts" | "creditScores">(id: Id<T>) =>
    t.run((ctx) => ctx.db.get(id)) as Promise<Doc<T>>;
  return { t, seed, alice, call, enable, balances, get };
}

/** An MCP tool call with a personal access key, parsed from the response. */
async function mcp(
  f: Awaited<ReturnType<typeof fixture>>,
  key: string,
  name: string,
  args: unknown,
) {
  const response = await f.t.fetch("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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
  expect(response.status).toBe(200);
  const body = await response.text();
  const json = JSON.parse(
    body.startsWith("{") ? body : body.slice(body.indexOf("{")),
  ) as Row;
  return JSON.parse(json.result.content[0].text) as Row;
}

describe("record_account_snapshot", () => {
  test("upserts one balance per account and date, so a rerun changes nothing", async () => {
    const f = await fixture();
    await f.enable();
    const snapshot = {
      snapshots: [
        {
          accountId: f.seed.alice.cash,
          asOf: "2026-09-28",
          balanceCents: 51234,
        },
      ],
    };
    const first = await f.call("record_account_snapshot", snapshot);
    expect(first).toMatchObject({ updated: 1, unchanged: 0, refused: 0 });
    expect(first.results[0].changes).toEqual(
      expect.arrayContaining([
        { field: "balance on 2026-09-28", before: null, after: 51234 },
        { field: "balanceCents", before: 50000, after: 51234 },
      ]),
    );
    const again = await f.call("record_account_snapshot", snapshot);
    expect(again).toMatchObject({ updated: 0, unchanged: 1, refused: 0 });
    expect(again.results[0].status).toBe("unchanged");
    const rows = await f.balances(f.seed.alice.cash);
    expect(rows.filter((row) => row.date === "2026-09-28")).toHaveLength(1);
    // A new value for the same date replaces it instead of adding a row.
    await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.cash,
          asOf: "2026-09-28",
          balanceCents: 52000,
        },
      ],
    });
    const after = await f.balances(f.seed.alice.cash);
    expect(after.filter((row) => row.date === "2026-09-28")).toEqual([
      expect.objectContaining({
        balanceCents: 52000,
        writtenBy: expect.objectContaining({ name: "Browser assistant" }),
      }),
    ]);
    const saved = await f.get(f.seed.alice.cash);
    expect(saved.balanceCents).toBe(52000);
    expect(saved.writtenBy).toMatchObject({
      name: "Browser assistant",
      at: now,
    });
    // An older snapshot is history only; it never replaces the current balance.
    const older = await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.cash,
          asOf: "2026-09-01",
          balanceCents: 40000,
        },
      ],
    });
    expect(older.results[0].warnings[0]).toContain("later balance");
    expect((await f.get(f.seed.alice.cash)).balanceCents).toBe(52000);
  });

  test("refuses bank-connected balances and statements the feed supplies", async () => {
    const f = await fixture();
    await f.enable();
    const result = await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.plaidCard,
          asOf: "2026-09-29",
          balanceCents: 99999,
          dueDate: "2026-10-20",
          statementCents: 1,
        },
        {
          accountId: f.seed.alice.simplefinCard,
          asOf: "2026-09-29",
          balanceCents: 4000,
          dueDate: "2026-10-15",
          statementCents: 3900,
          minimumCents: 500,
          statementDate: "2026-09-20",
        },
      ],
    });
    const [plaid, simplefin] = result.results;
    expect(plaid.status).toBe("refused");
    expect(plaid.refusedFields.map((r: Row) => r.field)).toEqual(
      expect.arrayContaining(["balanceCents", "dueDate", "statementCents"]),
    );
    const plaidAfter = await f.get(f.seed.alice.plaidCard);
    expect(plaidAfter).toMatchObject({
      balanceCents: 30000,
      dueDate: "2026-10-12",
      statementCents: 28000,
    });
    expect(plaidAfter.statementReminder).toBeUndefined();
    expect(await f.balances(f.seed.alice.plaidCard)).toEqual([]);
    // Missing statement fields are added as a reminder; the equal balance
    // is not a refusal, and the statement date has nowhere to live.
    expect(simplefin.status).toBe("updated");
    expect(simplefin.refusedFields).toEqual([
      expect.objectContaining({ field: "statementDate" }),
    ]);
    const other = await f.get(f.seed.alice.simplefinCard);
    expect(other.balanceCents).toBe(4000);
    expect(other.dueDate).toBeUndefined();
    expect(other.writtenBy).toBeUndefined();
    expect(other.statementReminder).toMatchObject({
      dueDate: "2026-10-15",
      statementCents: 3900,
      minimumCents: 500,
      writtenBy: { name: "Browser assistant" },
    });
  });

  test("statement fields feed reminders and Recurring, and stale statements are refused", async () => {
    const f = await fixture();
    await f.enable();
    const result = await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.card,
          asOf: "2026-09-29",
          balanceCents: 15000,
          statementCents: 14000,
          statementDate: "2026-09-08",
          dueDate: "2026-10-01",
          minimumCents: 3500,
        },
      ],
    });
    expect(result.results[0].status).toBe("updated");
    const card = await f.get(f.seed.alice.card);
    expect(card).toMatchObject({
      balanceCents: 15000,
      statementCents: 14000,
      statementDate: "2026-09-08",
      dueDate: "2026-10-01",
      minimumCents: 3500,
      writtenBy: { name: "Browser assistant" },
    });
    const reminders = dueReminders({
      schedules: [],
      accounts: [card],
      paid: new Set(),
      timing: defaultReminderPreferences,
      now,
    });
    expect(reminders).toEqual([
      {
        occurrenceKey: `statement:${card._id}:2026-10-01`,
        dueDate: "2026-10-01",
      },
    ]);
    const recurring = await f.call("list_recurring");
    expect(recurring.statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: card._id,
          dueDate: "2026-10-01",
          statementCents: 14000,
          minimumCents: 3500,
        }),
      ]),
    );
    // A new due date is a new statement: amounts it omits are cleared.
    await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.card,
          asOf: "2026-09-29",
          dueDate: "2026-11-01",
        },
      ],
    });
    const next = await f.get(f.seed.alice.card);
    expect(next.dueDate).toBe("2026-11-01");
    expect(next.statementCents).toBeUndefined();
    // An assistant working from older data cannot move the due date back.
    const stale = await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.card,
          asOf: "2026-09-29",
          dueDate: "2026-10-01",
          statementCents: 14000,
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({ status: "refused" });
    expect(stale.results[0].reason).toContain("later statement");
    expect((await f.get(f.seed.alice.card)).dueDate).toBe("2026-11-01");
  });

  test("validates dates, signs, kinds and duplicates per account", async () => {
    const f = await fixture();
    await f.enable();
    const result = await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.simplefinCard,
          asOf: "2026-10-05",
          balanceCents: 1,
        },
        {
          accountId: f.seed.alice.card,
          asOf: "2026-09-29",
          dueDate: "2026-10-01",
          statementCents: 1000,
          minimumCents: 2000,
        },
        {
          accountId: f.seed.alice.cash,
          asOf: "2026-09-29",
          dueDate: "2026-10-01",
        },
        { accountId: f.seed.alice.cash, asOf: "2026-09-29", balanceCents: 5 },
      ],
    });
    const [future, minimum, notDebt, duplicate] = result.results;
    expect(future.reason).toContain("future");
    expect(minimum.reason).toContain("minimumCents cannot exceed");
    expect(notDebt).toMatchObject({ status: "refused" });
    expect(notDebt.refusedFields[0].reason).toContain("credit and loan");
    expect(duplicate.reason).toContain("more than once");
    // Tomorrow is allowed (time zones); a negative card balance is kept but flagged.
    const [negative] = (
      await f.call("record_account_snapshot", {
        snapshots: [
          {
            accountId: f.seed.alice.card,
            asOf: "2026-09-30",
            balanceCents: -500,
          },
        ],
      })
    ).results;
    expect(negative.status).toBe("updated");
    expect(negative.warnings[0]).toContain("credit balance");
    expect(() =>
      agentToolSchemas.record_account_snapshot.parse({
        snapshots: [{ accountId: "x", asOf: "2026-09-29", balanceCents: 1.5 }],
      }),
    ).toThrow();
    expect(() =>
      agentToolSchemas.record_account_snapshot.parse({
        snapshots: Array.from({ length: 51 }, () => ({
          accountId: "x",
          asOf: "2026-09-29",
          balanceCents: 1,
        })),
      }),
    ).toThrow();
  });
});

describe("create_account and record_balance_history", () => {
  test("creates a manual account once, dated when observed", async () => {
    const f = await fixture();
    await f.enable();
    const input = {
      name: "Fictional Store Card",
      institution: "Fictional Retail Credit",
      kind: "credit",
      mask: "1234",
      balanceCents: 8200,
      balanceDate: "2026-09-27",
      limitCents: 300000,
    };
    const created = await f.call("create_account", input);
    expect(created.created).toMatchObject({
      name: "Fictional Store Card",
      subtype: "credit card",
      manual: true,
      balanceCents: 8200,
      limitCents: 300000,
    });
    const id = created.created._id as Id<"accounts">;
    expect(await f.balances(id)).toEqual([
      expect.objectContaining({
        date: "2026-09-27",
        balanceCents: 8200,
        writtenBy: expect.objectContaining({ name: "Browser assistant" }),
      }),
    ]);
    expect((await f.get(id)).writtenBy?.name).toBe("Browser assistant");
    const again = await f.call("create_account", {
      ...input,
      institution: " fictional retail credit ",
    });
    expect(again.created).toBeNull();
    expect(again.existing._id).toBe(id);
    // A connected account is found, never duplicated as a manual one.
    const connected = await f.call("create_account", {
      name: "Card",
      institution: "Fictional Bank",
      kind: "credit",
      mask: "7777",
      balanceCents: 1,
    });
    expect(connected.existing._id).toBe(f.seed.alice.plaidCard);
    expect(connected.hint).toContain("connected");
    await expect(
      f.call("create_account", { ...input, mask: "123456789012" }),
    ).rejects.toThrow("last 4 digits");
    await expect(
      f.call("create_account", { ...input, mask: "9999", subtype: "mortgage" }),
    ).rejects.toThrow("subtype for credit accounts");
  });

  test("backfills history idempotently and only for manual accounts", async () => {
    const f = await fixture();
    await f.enable();
    const rows = [
      { date: "2026-07-31", balanceCents: 45000 },
      { date: "2026-08-31", balanceCents: 47000 },
      { date: "2026-09-29", balanceCents: 49000 },
    ];
    const first = await f.call("record_balance_history", {
      accountId: f.seed.alice.cash,
      rows,
    });
    expect(first).toMatchObject({
      inserted: 3,
      updated: 0,
      unchanged: 0,
      currentBalanceCents: 49000,
      currentBalanceChanged: true,
    });
    const again = await f.call("record_balance_history", {
      accountId: f.seed.alice.cash,
      rows,
    });
    expect(again).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
    expect(await f.balances(f.seed.alice.cash)).toHaveLength(3);
    await expect(
      f.call("record_balance_history", {
        accountId: f.seed.alice.plaidCard,
        rows,
      }),
    ).rejects.toThrow("bank connection");
    await expect(
      f.call("record_balance_history", {
        accountId: f.seed.alice.cash,
        rows: [rows[0], rows[0]],
      }),
    ).rejects.toThrow("each date once");
    await expect(
      f.call("record_balance_history", {
        accountId: f.seed.alice.cash,
        rows: [{ date: "2026-10-30", balanceCents: 1 }],
      }),
    ).rejects.toThrow("future");
  });

  test("an owner's edit makes the balance theirs again", async () => {
    const f = await fixture();
    await f.enable();
    await f.call("record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.cash,
          asOf: "2026-09-29",
          balanceCents: 60000,
        },
      ],
    });
    const assisted = await f.get(f.seed.alice.cash);
    expect(assisted.writtenBy).toBeDefined();
    // Renaming through the assistant keeps the provenance of the balance.
    await f.call("update_account", {
      id: f.seed.alice.cash,
      patch: { name: "Renamed savings" },
    });
    expect((await f.get(f.seed.alice.cash)).writtenBy).toBeDefined();
    const {
      _id,
      _creationTime,
      userId,
      manual,
      updatedAt,
      writtenBy,
      ...rest
    } = assisted;
    void [_creationTime, userId, manual, updatedAt, writtenBy];
    await f.alice.mutation(api.workspace.saveAccount, {
      ...rest,
      id: _id,
      name: "Renamed savings",
      balanceCents: 61000,
    });
    expect((await f.get(f.seed.alice.cash)).writtenBy).toBeUndefined();
  });
});

describe("save_credit_score", () => {
  test("upserts on bureau, model and date and never replaces the owner's entry", async () => {
    const f = await fixture();
    await f.enable();
    const score = {
      bureau: "Experian",
      model: "VantageScore 3.0",
      score: 742,
      date: "2026-09-15",
    };
    const first = await f.call("save_credit_score", score);
    expect(first).toMatchObject({
      status: "created",
      observation: {
        score: 742,
        entryMethod: "agent",
        source: "Browser assistant",
      },
    });
    expect((await f.call("save_credit_score", score)).status).toBe("unchanged");
    const updated = await f.call("save_credit_score", { ...score, score: 745 });
    expect(updated).toMatchObject({
      status: "updated",
      before: { score: 742 },
    });
    const rows = await f.alice.query(api.creditScores.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      score: 745,
      entryMethod: "agent",
      writtenBy: { name: "Browser assistant" },
    });
    // The owner's own entry wins over a different relayed score.
    await f.alice.mutation(api.creditScores.save, {
      bureau: "TransUnion",
      model: "FICO Score 8",
      score: 760,
      date: "2026-09-01",
      source: "Card statement",
      entryMethod: "manual",
    });
    const refused = await f.call("save_credit_score", {
      bureau: "TransUnion",
      model: "FICO Score 8",
      score: 700,
      date: "2026-09-01",
    });
    expect(refused).toMatchObject({ status: "refused" });
    expect(refused.reason).toContain("manually entered score of 760");
    expect(
      (
        await f.call("save_credit_score", {
          bureau: "TransUnion",
          model: "FICO Score 8",
          score: 760,
          date: "2026-09-01",
        })
      ).status,
    ).toBe("unchanged");
    // Saving the assistant's entry from the form makes it the owner's.
    await f.alice.mutation(api.creditScores.save, {
      id: rows[0]._id,
      bureau: "Experian",
      model: "VantageScore 3.0",
      score: 745,
      date: "2026-09-15",
      source: "Browser assistant",
      entryMethod: "agent",
    });
    const edited = await f.get(rows[0]._id);
    expect(edited.entryMethod).toBe("manual");
    expect(edited.writtenBy).toBeUndefined();
    await expect(
      f.call("save_credit_score", { ...score, date: "2026-10-30" }),
    ).rejects.toThrow("up to today");
    expect(() =>
      agentToolSchemas.save_credit_score.parse({ ...score, score: 900 }),
    ).toThrow();
  });
});

describe("consent, ownership and tool hints", () => {
  test("every snapshot tool needs edit consent", async () => {
    const f = await fixture();
    await f.enable(false);
    for (const [name, args] of [
      [
        "create_account",
        { name: "A", institution: "B", kind: "cash", balanceCents: 1 },
      ],
      [
        "record_account_snapshot",
        {
          snapshots: [
            {
              accountId: f.seed.alice.cash,
              asOf: "2026-09-29",
              balanceCents: 1,
            },
          ],
        },
      ],
      [
        "record_balance_history",
        {
          accountId: f.seed.alice.cash,
          rows: [{ date: "2026-09-29", balanceCents: 1 }],
        },
      ],
      [
        "save_credit_score",
        {
          bureau: "Experian",
          model: "FICO Score 8",
          score: 700,
          date: "2026-09-01",
        },
      ],
    ] as const)
      await expect(f.call(name, args)).rejects.toThrow("read-only");
    expect((await f.get(f.seed.alice.cash)).balanceCents).toBe(50000);
  });

  test("another owner's accounts are unavailable and untouched", async () => {
    const f = await fixture();
    await f.enable();
    const result = await f.call("record_account_snapshot", {
      snapshots: [
        { accountId: f.seed.bob.cash, asOf: "2026-09-29", balanceCents: 1 },
        { accountId: "not-an-id", asOf: "2026-09-29", balanceCents: 1 },
      ],
    });
    expect(result.results.map((row: Row) => row.reason)).toEqual([
      "This account is unavailable.",
      "This account is unavailable.",
    ]);
    await expect(
      f.call("record_balance_history", {
        accountId: f.seed.bob.cash,
        rows: [{ date: "2026-09-29", balanceCents: 1 }],
      }),
    ).rejects.toThrow("unavailable");
    expect((await f.get(f.seed.bob.cash)).balanceCents).toBe(50000);
    expect(await f.balances(f.seed.bob.cash)).toEqual([]);
  });

  test("MCP hints mark merges destructive and snapshots as upserts", () => {
    expect(agentToolAnnotations("merge_merchants", false)).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
    });
    expect(
      agentToolAnnotations("merge_categories", false).destructiveHint,
    ).toBe(true);
    for (const name of ["create_merchant", "create_account"] as const)
      expect(agentToolAnnotations(name, false)).toMatchObject({
        destructiveHint: false,
        idempotentHint: false,
      });
    for (const name of [
      "record_account_snapshot",
      "record_balance_history",
      "save_credit_score",
    ] as const)
      expect(agentToolAnnotations(name, false)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      });
  });
});

describe("provenance and audit log", () => {
  test("names the connection on values, transaction history and activity", async () => {
    const f = await fixture();
    const { key, id: grantId } = await f.alice.action(
      api.agentAccess.createAccessKey,
      { name: "ChatGPT", allowEdits: true, lifetime: "never" },
    );
    await mcp(f, key, "record_account_snapshot", {
      snapshots: [
        {
          accountId: f.seed.alice.cash,
          asOf: "2026-09-29",
          balanceCents: 70000,
        },
      ],
    });
    await mcp(f, key, "save_credit_score", {
      bureau: "Experian",
      model: "VantageScore 3.0",
      score: 731,
      date: "2026-09-20",
    });
    await mcp(f, key, "update_transactions", {
      ids: [f.seed.alice.transactionId],
      patch: { categoryId: f.seed.alice.diningId, reviewed: true },
    });
    const cash = await f.get(f.seed.alice.cash);
    expect(cash.writtenBy).toEqual({ grantId, name: "ChatGPT", at: now });
    const [score] = await f.alice.query(api.creditScores.list, {});
    expect(score).toMatchObject({
      source: "ChatGPT",
      writtenBy: { name: "ChatGPT", grantId },
    });
    const detail = await f.alice.query(api.transactions.detail, {
      id: f.seed.alice.transactionId,
    });
    expect(detail.activity[0]).toMatchObject({
      message: "Changed category and review status",
      actor: "ChatGPT",
      grantId,
    });

    const stored = await f.t.run((ctx) =>
      ctx.db.query("agentActivity").collect(),
    );
    const writes = stored.filter((row) => !row.readOnly);
    expect(writes.map((row) => row.summary)).toEqual([
      "Updated 1 account",
      "Added an Experian VantageScore 3.0 score",
      "Changed category and review status on 1 transaction",
    ]);
    expect(writes[2]).toMatchObject({
      connection: "ChatGPT",
      grantId,
      counts: { transactions: 1 },
      changes: expect.arrayContaining([
        {
          target: `transaction ${f.seed.alice.transactionId}`,
          field: "categoryId",
          before: f.seed.alice.categoryId,
          after: f.seed.alice.diningId,
        },
        {
          target: `transaction ${f.seed.alice.transactionId}`,
          field: "reviewed",
          before: "false",
          after: "true",
        },
      ]),
    });
    expect(JSON.stringify(stored)).not.toContain(key);

    // The name stays with the history after the key is revoked.
    await f.alice.mutation(api.agentAccess.revoke, { id: grantId });
    const status = await f.alice.query(api.agentAccess.status, { now });
    expect(status.activity[0]).toMatchObject({
      connection: "ChatGPT",
      summary: "Changed category and review status on 1 transaction",
    });
    expect(status.activity[0]).not.toHaveProperty("changes");
  });

  test("keeps before/after bounded and truncates long text", async () => {
    const f = await fixture();
    await f.enable();
    const ids = await f.t.run(async (ctx) => {
      const base = await ctx.db.get(f.seed.alice.transactionId);
      const { _id, _creationTime, ...fields } = base!;
      void [_id, _creationTime];
      const rows: Id<"transactions">[] = [];
      for (let index = 0; index < 30; index++)
        rows.push(await ctx.db.insert("transactions", fields));
      return rows;
    });
    await f.call("update_transactions", {
      ids,
      patch: { categoryId: f.seed.alice.diningId },
    });
    await f.call("update_transaction", {
      id: f.seed.alice.transactionId,
      patch: { notes: "n".repeat(500) },
    });
    const [bulk, note] = (
      await f.t.run((ctx) => ctx.db.query("agentActivity").collect())
    ).filter((row) => !row.readOnly);
    expect(bulk.summary).toBe("Recategorized 30 transactions");
    expect(bulk.counts).toEqual({ transactions: 30 });
    expect(bulk.changes).toHaveLength(AUDIT_CHANGE_LIMIT);
    expect(bulk.changesTruncated).toBe(true);
    expect(note.summary).toBe("Edited notes on 1 transaction");
    expect(note.changes![0].after!.length).toBeLessThanOrEqual(80);
    expect(auditValue({ secret: "x" })).toBe("(changed)");
    expect(auditValue([{ a: 1 }, { b: 2 }])).toBe("2 items");
  });

  test("apply_rule records its count and tags each changed transaction", async () => {
    const f = await fixture();
    await f.enable();
    const rule = await f.call("save_rule", {
      name: "Grocer is dining",
      match: "all",
      conditions: [
        { field: "merchant", operator: "contains", value: "Grocer" },
      ],
      actions: { categoryId: f.seed.alice.diningId },
    });
    await f.call("apply_rule", { id: rule.after._id });
    const activity = await f.t.run((ctx) =>
      ctx.db.query("agentActivity").collect(),
    );
    expect(activity.map((row) => row.summary)).toEqual([
      "Added rule “Grocer is dining”",
      "Applied a rule to 1 transaction",
    ]);
    const detail = await f.alice.query(api.transactions.detail, {
      id: f.seed.alice.transactionId,
    });
    expect(detail.activity[0]).toMatchObject({
      message: "Applied rule “Grocer is dining”",
      actor: "Browser assistant",
    });
  });

  test("removes activity older than 90 days in bounded batches", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const row = {
        userId: f.seed.alice.userId,
        tool: "get_accounts",
        source: "browser" as const,
        readOnly: true,
        success: true,
      };
      for (let index = 0; index < 501; index++)
        await ctx.db.insert("agentActivity", {
          ...row,
          createdAt: now - 91 * DAY - index,
        });
      await ctx.db.insert("agentActivity", {
        ...row,
        createdAt: now - 89 * DAY,
      });
    });
    await f.t.mutation(internal.agentAccess.pruneActivity, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await f.t.run((ctx) =>
      ctx.db.query("agentActivity").collect(),
    );
    expect(left.map((row) => row.createdAt)).toEqual([now - 89 * DAY]);
  });
});
