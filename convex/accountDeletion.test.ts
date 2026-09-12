/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema, { type default as Schema } from "./schema";
import type { ActionCtx, MutationCtx } from "./_generated/server";

const modules = import.meta.glob("./**/*.ts");
const now = Date.parse("2026-09-12T12:00:00Z");
type TableName = keyof typeof Schema.tables;

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// `t.run` exposes the action storage writer so tests can store blobs directly.
type SeedCtx = MutationCtx & Pick<ActionCtx, "storage">;

/** A user with sign-in records and a few rows in every user-owned table family. */
async function seedUser(
  ctx: SeedCtx,
  label: string,
  { plaid = true, rows = 3 }: { plaid?: boolean; rows?: number } = {},
) {
  const email = `${label}@example.test`;
  const userId = await ctx.db.insert("users", { email, name: label });
  const sessionId = await ctx.db.insert("authSessions", {
    userId,
    expirationTime: now + 86400000,
  });
  await ctx.db.insert("authRefreshTokens", {
    sessionId,
    expirationTime: now + 86400000,
  });
  await ctx.db.insert("authVerifiers", {
    sessionId,
    signature: `${label}-verifier`,
  });
  const authAccountId = await ctx.db.insert("authAccounts", {
    userId,
    provider: "password",
    providerAccountId: email,
    secret: "fictional-hash",
  });
  await ctx.db.insert("authVerificationCodes", {
    accountId: authAccountId,
    provider: "folio-password-reset",
    code: "fictional-code",
    expirationTime: now + 900000,
  });
  await ctx.db.insert("authRateLimits", {
    identifier: authAccountId,
    lastAttemptTime: now,
    attemptsLeft: 5,
  });
  await ctx.db.insert("authRateLimits", {
    identifier: email,
    lastAttemptTime: now,
    attemptsLeft: 5,
  });
  await ctx.db.insert("resetEmailLimits", {
    email,
    lastSentAt: now,
    windowStartedAt: now,
    requests: 1,
  });
  const photoStorageId = await ctx.storage.store(
    new Blob(["fictional photo"], { type: "image/png" }),
  );
  await ctx.db.insert("profiles", {
    userId,
    name: label,
    photoStorageId,
    demo: false,
    reviewNew: true,
    allowPending: false,
    widgets: [],
  });
  const itemId = plaid
    ? await ctx.db.insert("plaidItems", {
        userId,
        plaidItemId: `${label}-item`,
        accessToken: `${label}-fictional-token`,
        institutionId: "ins_fictional",
        institution: "Fictional Bank",
        products: ["transactions"],
        environment: "sandbox",
        status: "connected",
        syncVersion: 0,
      })
    : undefined;
  const simplefinConnectionId = await ctx.db.insert("simplefinConnections", {
    userId,
    accessUrl: "https://fictional:secret@bridge.example.org/simplefin",
    host: "bridge.example.org",
    status: "connected",
    syncVersion: 0,
    createdAt: now,
    updatedAt: now,
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
    manual: false,
    updatedAt: now,
    itemId,
    simplefinConnectionId,
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
  const logoStorageId = await ctx.storage.store(
    new Blob(["fictional logo"], { type: "image/png" }),
  );
  const merchantId = await ctx.db.insert("merchants", {
    userId,
    name: `${label} market`,
    normalizedName: `${label} market`,
    color: "#123456",
    logoStorageId,
    transactionCount: rows,
  });
  const uploadStorageId = await ctx.storage.store(
    new Blob(["fictional upload"], { type: "image/png" }),
  );
  await ctx.db.insert("uploads", {
    userId,
    storageId: uploadStorageId,
    purpose: "merchant",
  });
  await ctx.db.insert("forecastScenarios", {
    userId,
    name: "Fictional plan",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    inputs: {
      schemaVersion: 1,
      asOfDate: "2026-09-12",
      currentAge: 40,
      retirementAge: 65,
      endAge: 95,
      cashCents: 1000000,
      investmentCents: 5000000,
      retirementCents: 20000000,
      retirementAccessAge: 60,
      monthlyIncomeCents: 800000,
      monthlySpendingCents: 500000,
      retirementMonthlyIncomeCents: 200000,
      retirementMonthlySpendingCents: 450000,
      extraMonthlySavingsCents: 0,
      annualReturnPct: 5,
      inflationPct: 2.5,
      incomeGrowthPct: 2,
      legacyTargetCents: 0,
      travelPlans: [],
    },
  });
  const tagId = await ctx.db.insert("tags", {
    userId,
    name: "Fictional tag",
    color: "#123456",
    order: 0,
  });
  const receipts: Id<"_storage">[] = [];
  for (let i = 0; i < rows; i++) {
    const transactionId = await ctx.db.insert("transactions", {
      userId,
      accountId,
      merchantId,
      categoryId,
      amountCents: 1000 + i,
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      originalName: "FICTIONAL MARKET",
      notes: "",
      tagIds: [tagId],
      reviewed: false,
      hidden: false,
      pending: false,
      splits: [],
      source: "manual",
      searchText: "fictional market",
      updatedAt: now,
      editedFields: [],
    });
    const storageId = await ctx.storage.store(
      new Blob([`receipt ${i}`], { type: "application/pdf" }),
    );
    receipts.push(storageId);
    await ctx.db.insert("attachments", {
      userId,
      transactionId,
      storageId,
      name: `receipt-${i}.pdf`,
      contentType: "application/pdf",
      size: 9,
    });
    await ctx.db.insert("activity", {
      userId,
      transactionId,
      message: "Added",
    });
    await ctx.db.insert("balances", {
      userId,
      accountId,
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      balanceCents: 100000 - i,
    });
  }
  await ctx.db.insert("rules", {
    userId,
    name: "Groceries rule",
    match: "all",
    conditions: [],
    actions: { categoryId },
    enabled: true,
    order: 0,
  });
  const recurringId = await ctx.db.insert("recurring", {
    userId,
    merchantId,
    accountId,
    categoryId,
    amountCents: 1200,
    frequency: "monthly",
    nextDate: "2026-10-01",
    active: true,
    source: "manual",
    note: "",
  });
  await ctx.db.insert("recurringPayments", {
    userId,
    recurringId,
    date: "2026-09-01",
    paid: true,
  });
  await ctx.db.insert("savedReports", {
    userId,
    name: "Spending",
    report: "spending",
    groupBy: "category",
    chart: "bar",
    from: "2026-01-01",
    to: "2026-12-31",
  });
  await ctx.db.insert("creditScores", {
    userId,
    score: 742,
    date: "2026-09-01",
    bureau: "TransUnion",
    model: "FICO Score 8",
    source: "Fictional statement",
    entryMethod: "manual",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("reminderPreferences", {
    userId,
    emailEnabled: true,
    verifiedEmail: email,
    daysBefore: 3,
    timeMinutes: 540,
    timeZone: "America/Chicago",
    updatedAt: now,
  });
  await ctx.db.insert("reminderEmailVerifications", {
    userId,
    email,
    codeHash: "fictional",
    expiresAt: now + 900000,
    sentAt: now,
    attempts: 0,
    windowStartedAt: now,
    requests: 1,
  });
  await ctx.db.insert("reminderDeliveries", {
    userId,
    occurrenceKey: `${recurringId}:2026-09-01`,
    dueDate: "2026-09-01",
    channel: "email",
    status: "sent",
    batchId: "fictional-batch",
    claimedAt: now,
    completedAt: now,
  });
  await ctx.db.insert("agentPreferences", {
    userId,
    browserEnabled: true,
    browserAllowEdits: false,
    updatedAt: now,
  });
  const grantId = await ctx.db.insert("agentGrants", {
    userId,
    clientId: "fictional-client",
    clientName: "Fictional assistant",
    scopes: ["read"],
    resource: "https://example.test/mcp",
    issuer: "https://example.test",
    createdAt: now,
    expiresAt: now + 86400000,
  });
  await ctx.db.insert("agentTokens", {
    grantId,
    tokenHash: `${label}-access`,
    kind: "access",
    expiresAt: now + 3600000,
  });
  await ctx.db.insert("agentTokens", {
    grantId,
    tokenHash: `${label}-refresh`,
    kind: "refresh",
    expiresAt: now + 86400000,
  });
  await ctx.db.insert("agentAuthorizationRequests", {
    requestHash: `${label}-request`,
    clientId: "fictional-client",
    clientName: "Fictional assistant",
    redirectUri: "http://127.0.0.1:45678/callback",
    challenge: "a".repeat(43),
    scopes: ["read"],
    resource: "https://example.test/mcp",
    issuer: "https://example.test",
    createdAt: now,
    expiresAt: now + 600000,
    codeHash: `${label}-code`,
    grantId,
    completedAt: now,
  });
  await ctx.db.insert("agentActivity", {
    userId,
    grantId,
    tool: "get_accounts",
    source: "mcp",
    readOnly: true,
    success: true,
    createdAt: now,
  });
  if (itemId) {
    const securityId = await ctx.db.insert("investmentSecurities", {
      userId,
      itemId,
      providerSecurityId: `${label}-security`,
      name: "Fictional Index Fund",
      ticker: "FICT",
      type: "etf",
      currency: "USD",
      isCashEquivalent: false,
      closePrice: 100,
      closePriceDate: "2026-09-01",
      cusip: null,
      isin: null,
    });
    await ctx.db.insert("investmentHoldings", {
      userId,
      itemId,
      accountId,
      securityId,
      quantity: 10,
      basisCents: 90000,
      valueCents: 100000,
      price: 100,
      priceDate: "2026-09-01",
      currency: "USD",
      syncedAt: now,
    });
    await ctx.db.insert("investmentTransactions", {
      userId,
      itemId,
      accountId,
      securityId,
      providerTransactionId: `${label}-buy`,
      date: "2026-08-01",
      name: "Buy FICT",
      type: "buy",
      subtype: "buy",
      quantity: 10,
      amountCents: 90000,
      price: 90,
      feesCents: 0,
      currency: "USD",
      cancelTransactionId: null,
      canceled: false,
      removed: false,
    });
    await ctx.db.insert("investmentSyncStates", {
      userId,
      itemId,
      syncedAt: now,
      historyFrom: null,
      historyTo: null,
      error: null,
    });
  }
  return {
    userId,
    email,
    sessionId,
    authAccountId,
    grantId,
    storage: [photoStorageId, logoStorageId, uploadStorageId, ...receipts],
  };
}

const userTables: TableName[] = [
  "agentPreferences",
  "agentGrants",
  "agentActivity",
  "creditScores",
  "forecastScenarios",
  "reminderPreferences",
  "reminderEmailVerifications",
  "reminderDeliveries",
  "profiles",
  "simplefinConnections",
  "accounts",
  "balances",
  "groups",
  "categories",
  "merchants",
  "tags",
  "transactions",
  "attachments",
  "uploads",
  "activity",
  "rules",
  "recurring",
  "recurringPayments",
  "savedReports",
  "investmentSecurities",
  "investmentHoldings",
  "investmentTransactions",
  "investmentSyncStates",
  "plaidItems",
  "authSessions",
  "authAccounts",
];

function fixture() {
  const t = convexTest(schema, modules);
  vi.stubEnv("PLAID_CLIENT_ID", "fictional-client");
  vi.stubEnv("PLAID_SECRET", "fictional-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  return t;
}

async function rowsOwnedBy(t: ReturnType<typeof fixture>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of userTables) {
      const rows = await ctx.db.query(table).collect();
      const owned = rows.filter(
        (row) => "userId" in row && row.userId === userId,
      );
      if (owned.length) counts[table] = owned.length;
    }
    return counts;
  });
}

/** Scheduled runs that have not finished; completed ones stay in the system table. */
async function pendingScheduled(t: ReturnType<typeof fixture>) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs
      .filter(
        (job) =>
          job.state.kind === "pending" || job.state.kind === "inProgress",
      )
      .map((job) => job.name);
  });
}

async function runScheduled(t: ReturnType<typeof fixture>) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
}

describe("account deletion", () => {
  test("removes every owned row, receipt blob, and sign-in while another user survives", async () => {
    const t = fixture();
    const revoked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (!url.endsWith("/item/remove")) throw new Error("Unexpected call");
        const body = JSON.parse(String(init.body)) as { access_token: string };
        revoked.push(body.access_token);
        return Response.json({ removed: true, request_id: "fictional" });
      }),
    );
    // More transactions than one batch so the sweep must reschedule itself.
    const leaving = await t.run((ctx) =>
      seedUser(ctx, "leaving", { rows: 90 }),
    );
    const staying = await t.run((ctx) => seedUser(ctx, "staying"));
    const before = await rowsOwnedBy(t, staying.userId);
    const asLeaving = t.withIdentity({ subject: leaving.userId });

    await asLeaving.mutation(api.accountDeletion.deleteAccount, {
      confirmation: "DELETE",
      email: "  Leaving@Example.TEST ",
    });
    expect(
      (await asLeaving.query(api.accountDeletion.status, {})).requestedAt,
    ).toBeTypeOf("number");
    await expect(
      asLeaving.mutation(api.accountDeletion.deleteAccount, {
        confirmation: "DELETE",
        email: leaving.email,
      }),
    ).rejects.toThrow("already being deleted");

    await runScheduled(t);

    expect(revoked).toEqual(["leaving-fictional-token"]);
    expect(await rowsOwnedBy(t, leaving.userId)).toEqual({});
    expect(await rowsOwnedBy(t, staying.userId)).toEqual(before);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(leaving.userId)).toBeNull();
      expect(await ctx.db.get(staying.userId)).not.toBeNull();
      for (const storageId of leaving.storage)
        expect(await ctx.storage.getUrl(storageId)).toBeNull();
      for (const storageId of staying.storage)
        expect(await ctx.storage.getUrl(storageId)).not.toBeNull();
      expect(
        (await ctx.db.query("authRefreshTokens").collect()).map(
          (row) => row.sessionId,
        ),
      ).toEqual([staying.sessionId]);
      expect(
        (await ctx.db.query("authVerificationCodes").collect()).map(
          (row) => row.accountId,
        ),
      ).toEqual([staying.authAccountId]);
      expect(
        (await ctx.db.query("authRateLimits").collect())
          .map((row) => row.identifier)
          .sort(),
      ).toEqual([staying.authAccountId, staying.email].sort());
      expect(
        (await ctx.db.query("resetEmailLimits").collect()).map(
          (row) => row.email,
        ),
      ).toEqual([staying.email]);
      expect(
        (await ctx.db.query("agentTokens").collect()).map(
          (row) => row.tokenHash,
        ),
      ).toEqual(["staying-access", "staying-refresh"]);
      expect(
        (await ctx.db.query("agentAuthorizationRequests").collect()).map(
          (row) => row.grantId,
        ),
      ).toEqual([staying.grantId]);
      expect(
        (await ctx.db.query("authVerifiers").collect()).map(
          (row) => row.sessionId,
        ),
      ).toEqual([staying.sessionId]);
      expect(await ctx.db.system.query("_storage").collect()).toHaveLength(
        staying.storage.length,
      );
    });
    expect(await pendingScheduled(t)).toEqual([]);
  });

  test("still deletes everything when Plaid revocation fails", async () => {
    const t = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const leaving = await t.run((ctx) => seedUser(ctx, "leaving"));
    await t
      .withIdentity({ subject: leaving.userId })
      .mutation(api.accountDeletion.deleteAccount, {
        confirmation: "DELETE",
        email: leaving.email,
      });
    await runScheduled(t);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Plaid revocation failed"),
      expect.any(String),
    );
    expect(await rowsOwnedBy(t, leaving.userId)).toEqual({});
    expect(await t.run((ctx) => ctx.db.get(leaving.userId))).toBeNull();
  });

  test("requires the exact confirmation and the account's own email", async () => {
    const t = fixture();
    const leaving = await t.run((ctx) => seedUser(ctx, "leaving"));
    const asLeaving = t.withIdentity({ subject: leaving.userId });
    await expect(
      asLeaving.mutation(api.accountDeletion.deleteAccount, {
        confirmation: "delete",
        email: leaving.email,
      }),
    ).rejects.toThrow("Type DELETE");
    await expect(
      asLeaving.mutation(api.accountDeletion.deleteAccount, {
        confirmation: "DELETE",
        email: "someone-else@example.test",
      }),
    ).rejects.toThrow("email address you sign in with");
    expect(
      (await asLeaving.query(api.accountDeletion.status, {})).requestedAt,
    ).toBeNull();
    expect(await rowsOwnedBy(t, leaving.userId)).not.toEqual({});
  });

  test("demo guests cannot delete and nothing is scheduled", async () => {
    const t = fixture();
    const guestId = await t.run((ctx) =>
      ctx.db.insert("users", { isAnonymous: true }),
    );
    await expect(
      t
        .withIdentity({ subject: guestId })
        .mutation(api.accountDeletion.deleteAccount, {
          confirmation: "DELETE",
          email: "",
        }),
    ).rejects.toThrow("Demo guests");
    expect(await pendingScheduled(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(guestId))).toMatchObject({
      isAnonymous: true,
    });
  });
});
