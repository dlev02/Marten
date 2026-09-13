import {
  bankProvider,
  providerName,
  type BankProvider,
} from "./lib/bankProviders";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  simplefinAccount,
  simplefinSelection,
  simplefinTransaction,
  simplefinHolding,
} from "./lib/simplefinApi";
import { providerRateLimiter } from "./lib/providerLimits";
import {
  applyRules,
  changeMerchantCount,
  refreshSearch,
  type TransactionFields,
  findMatchingTransaction,
} from "./lib/transactions";
import { normalize } from "./lib/finance";

const LEASE_MS = 120000;
const fenceArgs = {
  connectionId: v.id("simplefinConnections"),
  version: v.number(),
};
/** Real bank data is only ever imported into a signed-in, non-demo workspace. */
export async function requirePersonalWorkspace(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!user || user.isAnonymous || !profile || profile.demo)
    throw new ConvexError(
      "Create a personal workspace before connecting a bank. The public demo cannot access real bank data.",
    );
}
/** One connection per user and provider; a reconnect replaces its access URL in place. */
export async function savedConnection(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
  provider: BankProvider = "simplefin",
) {
  const rows = await ctx.db
    .query("simplefinConnections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(3);
  const matches = rows.filter(
    (row) => (row.provider ?? "simplefin") === provider,
  );
  if (rows.length > 2 || matches.length > 1)
    throw new ConvexError(
      "This workspace has duplicate connections for a bank service.",
    );
  return matches[0] ?? null;
}
export async function requireConnection(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
  provider: BankProvider = "simplefin",
): Promise<Doc<"simplefinConnections">> {
  await requirePersonalWorkspace(ctx, userId);
  const connection = await savedConnection(ctx, userId, provider);
  if (!connection)
    throw new ConvexError(
      `Connect ${providerName(provider)} before importing accounts.`,
    );
  return connection;
}
async function fenced(
  ctx: MutationCtx,
  args: { connectionId: Id<"simplefinConnections">; version: number },
) {
  const connection = await ctx.db.get(args.connectionId);
  if (
    !connection ||
    connection.status === "disconnected" ||
    connection.syncVersion !== args.version ||
    (connection.syncLease ?? 0) < Date.now()
  )
    throw new ConvexError(
      "This bank import was stopped or superseded. Try again.",
    );
  await requirePersonalWorkspace(ctx, connection.userId);
  await ctx.db.patch(connection._id, { syncLease: Date.now() + LEASE_MS });
  return connection;
}
/** Server-only: the stored access URL is returned so an action can open it. */
export const context = internalQuery({
  args: { userId: v.id("users"), provider: v.optional(bankProvider) },
  returns: v.object({
    connection: schema.doc("simplefinConnections"),
    accounts: v.array(schema.doc("accounts")),
    allowPending: v.boolean(),
    investmentActivity: v.boolean(),
  }),
  handler: async (ctx, { userId, provider }) => {
    const connection = await requireConnection(ctx, userId, provider);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_simplefinConnectionId", (q) =>
        q.eq("simplefinConnectionId", connection._id),
      )
      .take(101);
    if (accounts.length > 100)
      throw new ConvexError("This bank connection has too many accounts.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      connection,
      accounts,
      allowPending: profile?.allowPending ?? false,
      investmentActivity: profile?.investmentActivity ?? false,
    };
  },
});
/** Reserves one connect attempt before a token is claimed. */
export const reserveConnect = internalMutation({
  args: { userId: v.id("users"), provider: v.optional(bankProvider) },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await requirePersonalWorkspace(ctx, userId);
    const limited = await providerRateLimiter.limit(ctx, "simplefinConnect", {
      key: userId,
    });
    if (!limited.ok)
      throw new ConvexError(
        "Too many bank connection attempts. Wait a few minutes and try again.",
      );
    return null;
  },
});
/** Saves a freshly claimed access URL (already sealed by the action). */
export const store = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.optional(bankProvider),
    accessUrl: v.string(),
    host: v.string(),
  },
  returns: v.id("simplefinConnections"),
  handler: async (ctx, { userId, provider, accessUrl, host }) => {
    await requirePersonalWorkspace(ctx, userId);
    const now = Date.now();
    const existing = await savedConnection(ctx, userId, provider);
    if (existing) {
      // A new token supersedes any import fenced to the old one.
      await ctx.db.patch(existing._id, {
        accessUrl,
        host,
        status: "connected",
        syncVersion: existing.syncVersion + 1,
        syncLease: undefined,
        error: undefined,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("simplefinConnections", {
      userId,
      provider,
      accessUrl,
      host,
      status: "connected",
      syncVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});
/** Records a problem on the connection without touching imported data. */
export const note = internalMutation({
  args: {
    connectionId: v.id("simplefinConnections"),
    error: v.optional(v.string()),
    providerErrors: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { connectionId, error, providerErrors }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.status === "disconnected") return null;
    await ctx.db.patch(connectionId, {
      ...(error !== undefined ? { error, status: "error" as const } : {}),
      ...(providerErrors ? { providerErrors } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
/** Connections the daily catch-up should refresh: connected and not synced within 20 hours. */
export const due = internalQuery({
  args: { before: v.number() },
  returns: v.array(
    v.object({ userId: v.id("users"), provider: v.optional(bankProvider) }),
  ),
  handler: async (ctx, { before }) => {
    const rows = await ctx.db
      .query("simplefinConnections")
      .withIndex("by_status_and_syncedAt", (q) =>
        q.eq("status", "connected").lt("syncedAt", before),
      )
      .take(50);
    return rows.map((row) => ({ userId: row.userId, provider: row.provider }));
  },
});
const preparedAccount = v.object({
  selection: simplefinSelection,
  account: simplefinAccount,
  fromDate: v.string(),
});
export const begin = internalMutation({
  args: {
    userId: v.id("users"),
    accounts: v.array(preparedAccount),
    reconnect: v.boolean(),
    expectedVersion: v.number(),
    provider: v.optional(bankProvider),
  },
  returns: v.object({
    ...fenceArgs,
    mappings: v.array(
      v.object({
        externalId: v.string(),
        accountId: v.id("accounts"),
        fromDate: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const connection = await requireConnection(ctx, args.userId, args.provider);
    if (connection.syncVersion !== args.expectedVersion)
      throw new ConvexError(
        "The bank connection changed while its data was loading. Review the accounts and try again.",
      );
    if (connection.status === "disconnected" && !args.reconnect)
      throw new ConvexError(
        "Bank imports are stopped. Review and import accounts to resume.",
      );
    if ((connection.syncLease ?? 0) > Date.now())
      throw new ConvexError(
        "A bank import is already running. Wait for it to finish.",
      );
    if (!args.accounts.length || args.accounts.length > 25)
      throw new ConvexError("Import between 1 and 25 bank accounts at a time.");
    if (
      new Set(args.accounts.map((row) => row.account.externalId)).size !==
      args.accounts.length
    )
      throw new ConvexError("Select each bank account once.");
    const version = connection.syncVersion + 1;
    const connectionId = connection._id;
    await ctx.db.patch(connectionId, {
      status: "syncing",
      syncVersion: version,
      syncLease: Date.now() + LEASE_MS,
      error: undefined,
      updatedAt: Date.now(),
    });
    const mappings: {
      externalId: string;
      accountId: Id<"accounts">;
      fromDate: string;
    }[] = [];
    const selectedTargets = new Set<string>();
    let ownedAccountCount = (
      await ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .take(201)
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    for (const { selection, account: incoming, fromDate } of args.accounts) {
      if (
        selection.externalAccountId !== incoming.externalId ||
        selection.kind !== incoming.kind
      )
        throw new ConvexError("Review the bank account selection again.");
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_simplefinConnectionId_and_simplefinAccountId", (q) =>
          q
            .eq("simplefinConnectionId", connectionId)
            .eq("simplefinAccountId", incoming.externalId),
        )
        .unique();
      const target = selection.targetAccountId
        ? await ctx.db.get(selection.targetAccountId)
        : existing;
      if (
        selection.targetAccountId &&
        (!target || target.userId !== args.userId)
      )
        throw new ConvexError("The selected Marten account is unavailable.");
      if (existing && target?._id !== existing._id)
        throw new ConvexError(
          "This bank account is already imported. Use its existing Marten account.",
        );
      if (!target && ownedAccountCount >= 200)
        throw new ConvexError(
          "This workspace supports up to 200 accounts. Map an existing account before importing another.",
        );
      if (target && selectedTargets.has(target._id))
        throw new ConvexError(
          "Map each bank account to a different Marten account.",
        );
      if (target) {
        selectedTargets.add(target._id);
        if (
          target.simplefinConnectionId &&
          target.simplefinConnectionId !== connectionId
        )
          throw new ConvexError(
            "Remove the previous bank connection before mapping this account to another provider. Your saved history will stay.",
          );
        if (target.closed)
          throw new ConvexError(
            "Reopen this Marten account before importing into it.",
          );
        if (target.kind !== incoming.kind || target.currency !== "USD")
          throw new ConvexError(
            "Choose a Marten account with the same account type and USD currency.",
          );
        const plaid = target.itemId ? await ctx.db.get(target.itemId) : null;
        if (plaid && plaid.status !== "disconnected")
          throw new ConvexError(
            "Disconnect this account's Plaid connection before mapping it to this provider.",
          );
        if (
          target.simplefinAccountId &&
          target.simplefinAccountId !== incoming.externalId
        )
          throw new ConvexError(
            "This Marten account is mapped to a different bank account.",
          );
        if (!target.simplefinAccountId) {
          // Existing history from another source must end before the new import begins.
          const latest = await ctx.db
            .query("transactions")
            .withIndex("by_userId_and_accountId_and_date", (q) =>
              q.eq("userId", args.userId).eq("accountId", target._id),
            )
            .order("desc")
            .first();
          if (latest && latest.date >= fromDate)
            throw new ConvexError(
              `Start the bank import after ${latest.date} for ${target.name}. This keeps its existing history from being counted twice.`,
            );
        }
      }
      const data = {
        balanceCents: incoming.balanceCents,
        currency: incoming.currency,
        availableCents: incoming.availableCents,
        simplefinConnectionId: connectionId,
        bankProvider: connection.provider ?? "simplefin",
        connectionProvider: incoming.connectionProvider,
        ...(incoming.logoUrl ? { logoUrl: incoming.logoUrl } : {}),
        simplefinAccountId: incoming.externalId,
        simplefinImportFromDate:
          target?.simplefinImportFromDate &&
          target.simplefinImportFromDate < fromDate
            ? target.simplefinImportFromDate
            : fromDate,
        simplefinUpdatedAt: incoming.lastUpdated,
        itemId: undefined,
        plaidAccountId: undefined,
        manual: false,
        updatedAt: Date.now(),
      };
      let accountId: Id<"accounts">;
      if (target) {
        accountId = target._id;
        await ctx.db.patch(accountId, {
          ...data,
          ...(target.institution === "Manual"
            ? { institution: incoming.institution }
            : {}),
        });
      } else
        accountId = await ctx.db.insert("accounts", {
          ...data,
          userId: args.userId,
          name: incoming.name,
          institution: incoming.institution,
          mask: incoming.mask,
          kind: incoming.kind,
          subtype: incoming.subtype,
          hidden: false,
          excludeNetWorth: false,
          closed: false,
        });
      const snapshot = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q.eq("accountId", accountId).eq("date", today),
        )
        .unique();
      if (snapshot)
        await ctx.db.patch(snapshot._id, {
          balanceCents: incoming.balanceCents,
        });
      else
        await ctx.db.insert("balances", {
          userId: args.userId,
          accountId,
          date: today,
          balanceCents: incoming.balanceCents,
        });
      mappings.push({
        externalId: incoming.externalId,
        accountId,
        fromDate: data.simplefinImportFromDate,
      });
      if (!target) ownedAccountCount++;
    }
    return { connectionId, version, mappings };
  },
});
/**
 * Providers may omit categories. A merchant category code, or an obvious
 * transfer/income description, chooses a starting category when the user
 * already has one by that name; everything else starts uncategorized.
 */
async function defaultCategory(
  ctx: MutationCtx,
  userId: Id<"users">,
  description: string,
  hint: string,
) {
  const key = normalize(description);
  const transfer =
    /\b(transfer|autopay|automatic payment|payment thank you|online payment|card payment)\b/.test(
      key,
    );
  const income =
    /\b(payroll|direct dep|direct deposit|salary|interest paid|interest payment|dividend)\b/.test(
      key,
    );
  const kind = transfer ? "transfer" : income ? "income" : "expense";
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(501);
  if (categories.length > 500)
    throw new ConvexError(
      "This workspace has too many categories to safely apply bank import rules.",
    );
  const groups = await ctx.db
    .query("groups")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(101);
  if (groups.length > 100)
    throw new ConvexError("This workspace has too many category groups.");
  const byName = (name: string, groupKind: typeof kind) =>
    categories.find(
      (c) =>
        c.enabled &&
        normalize(c.name) === normalize(name) &&
        groups.some((g) => g._id === c.groupId && g.kind === groupKind),
    );
  if (kind === "expense" && hint) {
    const hinted =
      byName(hint, "expense") ??
      (hint === "Fuel" ? byName("Gas", "expense") : undefined);
    if (hinted) return hinted._id;
  }
  const name = transfer ? "Transfers" : income ? "Income" : "Uncategorized";
  const found = byName(name, kind);
  if (found) return found._id;
  const groupId =
    groups.find((g) => g.kind === kind)?._id ??
    (await ctx.db.insert("groups", {
      userId,
      name:
        kind === "expense"
          ? "Expenses"
          : kind === "income"
            ? "Income"
            : "Transfers",
      kind,
      order: groups.length,
    }));
  return await ctx.db.insert("categories", {
    userId,
    groupId,
    name,
    emoji: transfer ? "↔" : "•",
    order: categories.length,
    enabled: true,
  });
}
export const ingest = internalMutation({
  args: {
    ...fenceArgs,
    accountId: v.id("accounts"),
    transactions: v.array(simplefinTransaction),
  },
  returns: v.object({ imported: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const connection = await fenced(ctx, args);
    const account = await ctx.db.get(args.accountId);
    if (
      !account ||
      account.userId !== connection.userId ||
      account.simplefinConnectionId !== connection._id
    )
      throw new ConvexError(
        "This bank account mapping changed. Review the account before retrying.",
      );
    if (args.transactions.length > 100)
      throw new ConvexError("Import at most 100 transactions per batch.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", connection.userId))
      .unique();
    const userCtx = { ...ctx, userId: connection.userId };
    let imported = 0,
      updated = 0;
    for (const incoming of args.transactions) {
      if (
        incoming.externalAccountId !== account.simplefinAccountId ||
        incoming.date < (account.simplefinImportFromDate ?? "0000")
      )
        throw new ConvexError(
          "The bank transaction is outside this account's import range.",
        );
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_accountId_and_simplefinTransactionId", (q) =>
          q
            .eq("accountId", account._id)
            .eq("simplefinTransactionId", incoming.externalId),
        )
        .unique();
      if (existing) {
        if (
          existing.userId !== connection.userId ||
          existing.source !== (connection.provider ?? "simplefin")
        )
          throw new ConvexError(
            "This bank transaction identity is unavailable.",
          );
        let categoryId = existing.categoryId;
        // Only enrich an untouched fallback. Reviewed, split, manually edited,
        // and already categorized transactions retain their chosen category.
        if (
          incoming.category &&
          !existing.reviewed &&
          !existing.splits.length &&
          !existing.splitDraft?.length &&
          !existing.editedFields.includes("categoryId")
        ) {
          const category = await ctx.db.get(existing.categoryId);
          if (
            category?.userId === connection.userId &&
            normalize(category.name) === "uncategorized"
          ) {
            categoryId = await defaultCategory(
              ctx,
              connection.userId,
              incoming.name,
              incoming.category,
            );
          }
        }
        // Retries keep the user's edits, notes, tags, receipts and review state.
        const fields: TransactionFields = {
          accountId: existing.accountId,
          merchantId: existing.merchantId,
          categoryId,
          date: existing.editedFields.includes("date")
            ? existing.date
            : incoming.date,
          amountCents: existing.editedFields.includes("amountCents")
            ? existing.amountCents
            : incoming.amountCents,
          originalName: incoming.name,
          notes: existing.notes,
          tagIds: existing.tagIds,
          reviewed: existing.reviewed,
          hidden: existing.hidden,
          pending: false,
          splits: existing.splits,
        };
        let splitDraft = existing.splitDraft;
        if (
          fields.splits.length &&
          fields.splits.reduce((sum, split) => sum + split.amountCents, 0) !==
            fields.amountCents
        ) {
          splitDraft = fields.splits;
          fields.splits = [];
          fields.reviewed = false;
          await ctx.db.insert("activity", {
            userId: connection.userId,
            transactionId: existing._id,
            message: `bank changed the posted amount from ${(existing.amountCents / 100).toFixed(2)} to ${(fields.amountCents / 100).toFixed(2)} USD. Your split allocations are saved for review; reports use the updated total until reconciled.`,
          });
        }
        await ctx.db.patch(existing._id, {
          ...fields,
          splitDraft,
          removedFromBank: false,
          updatedAt: Date.now(),
          searchText: await refreshSearch(userCtx, fields),
        });
        if (existing.removedFromBank)
          await changeMerchantCount(ctx, null, existing.merchantId);
        updated++;
        continue;
      }
      // A spreadsheet row for this purchase (imported before the bridge was
      // connected) becomes the provider's row and keeps its annotations.
      const spreadsheetRow = await findMatchingTransaction(
        userCtx,
        {
          accountId: account._id,
          date: incoming.date,
          amountCents: incoming.amountCents,
          originalName: incoming.name,
        },
        (row) =>
          row.source === "csv" &&
          !row.plaidTransactionId &&
          !row.simplefinTransactionId &&
          !row.removedFromBank,
      );
      if (spreadsheetRow) {
        const fields: TransactionFields = {
          accountId: spreadsheetRow.accountId,
          merchantId: spreadsheetRow.merchantId,
          categoryId: spreadsheetRow.categoryId,
          date: spreadsheetRow.editedFields.includes("date")
            ? spreadsheetRow.date
            : incoming.date,
          amountCents: spreadsheetRow.amountCents,
          originalName: incoming.name,
          notes: spreadsheetRow.notes,
          tagIds: spreadsheetRow.tagIds,
          reviewed: spreadsheetRow.reviewed,
          hidden: spreadsheetRow.hidden,
          pending: false,
          splits: spreadsheetRow.splits,
        };
        await ctx.db.patch(spreadsheetRow._id, {
          ...fields,
          source: connection.provider ?? "simplefin",
          simplefinTransactionId: incoming.externalId,
          removedFromBank: false,
          updatedAt: Date.now(),
          searchText: await refreshSearch(userCtx, fields),
        });
        updated++;
        continue;
      }
      const normalizedName = normalize(incoming.merchant);
      let merchant = await ctx.db
        .query("merchants")
        .withIndex("by_userId_and_normalizedName", (q) =>
          q
            .eq("userId", connection.userId)
            .eq("normalizedName", normalizedName),
        )
        .unique();
      if (!merchant) {
        const merchantId = await ctx.db.insert("merchants", {
          userId: connection.userId,
          name: incoming.merchant,
          normalizedName,
          color: "#64748b",
          transactionCount: 0,
        });
        merchant = (await ctx.db.get(merchantId))!;
      }
      const fields = await applyRules(userCtx, {
        accountId: account._id,
        merchantId: merchant._id,
        categoryId: await defaultCategory(
          ctx,
          connection.userId,
          incoming.name,
          incoming.category,
        ),
        date: incoming.date,
        amountCents: incoming.amountCents,
        originalName: incoming.name,
        notes: "",
        tagIds: [],
        reviewed: !(profile?.reviewNew ?? true),
        hidden: false,
        pending: false,
        splits: [],
      });
      await ctx.db.insert("transactions", {
        ...fields,
        userId: connection.userId,
        source: connection.provider ?? "simplefin",
        simplefinTransactionId: incoming.externalId,
        editedFields: [],
        updatedAt: Date.now(),
        searchText: await refreshSearch(userCtx, fields),
      });
      await changeMerchantCount(ctx, null, fields.merchantId);
      imported++;
    }
    return { imported, updated };
  },
});
/** Publish a complete account snapshot atomically; malformed or missing arrays never clear positions. */
export const ingestHoldings = internalMutation({
  args: {
    ...fenceArgs,
    accountId: v.id("accounts"),
    holdings: v.array(simplefinHolding),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await fenced(ctx, args);
    const account = await ctx.db.get(args.accountId);
    if (
      !account ||
      account.userId !== connection.userId ||
      account.simplefinConnectionId !== connection._id ||
      account.kind !== "investment"
    )
      throw new ConvexError("This investment account is unavailable.");
    if (args.holdings.length > 1000)
      throw new ConvexError("Import up to 1,000 holdings per account.");
    const saved = await ctx.db
      .query("investmentHoldings")
      .withIndex("by_userId_and_accountId", (q) =>
        q.eq("userId", connection.userId).eq("accountId", args.accountId),
      )
      .take(1001);
    if (saved.length > 1000)
      throw new ConvexError("This account has too many saved holdings.");
    const previous = new Map<
      string,
      {
        holding: Doc<"investmentHoldings">;
        security: Doc<"investmentSecurities">;
      }
    >();
    for (const holding of saved) {
      if (holding.simplefinConnectionId !== connection._id) continue;
      const security = await ctx.db.get(holding.securityId);
      if (
        !security ||
        security.userId !== connection.userId ||
        security.simplefinConnectionId !== connection._id
      )
        throw new ConvexError(
          "Saved investment details could not be verified.",
        );
      previous.set(security.providerSecurityId, { holding, security });
    }
    const seen = new Set<string>();
    for (const row of args.holdings) {
      if (
        !row.id ||
        seen.has(row.id) ||
        !Number.isSafeInteger(row.valueCents) ||
        !Number.isFinite(row.quantity) ||
        (row.price !== null && (!Number.isFinite(row.price) || row.price < 0))
      )
        throw new ConvexError(
          "The investment snapshot contains invalid or duplicate positions.",
        );
      seen.add(row.id);
      const before = previous.get(row.id);
      const security = {
        userId: connection.userId,
        simplefinConnectionId: connection._id,
        providerSecurityId: row.id,
        name: row.name,
        ticker: row.symbol,
        type: "other",
        currency: row.currency,
        isCashEquivalent: false,
        closePrice: null,
        closePriceDate: null,
        cusip: null,
        isin: null,
      };
      const securityId =
        before?.security._id ??
        (await ctx.db.insert("investmentSecurities", security));
      if (before) await ctx.db.patch(securityId, security);
      const position = {
        userId: connection.userId,
        simplefinConnectionId: connection._id,
        accountId: account._id,
        securityId,
        quantity: row.quantity,
        valueCents: row.valueCents,
        price: row.price,
        currency: row.currency,
        basisCents: null,
        priceDate: null,
        syncedAt: Date.now(),
      };
      if (before) await ctx.db.patch(before.holding._id, position);
      else await ctx.db.insert("investmentHoldings", position);
    }
    for (const [id, before] of previous)
      if (!seen.has(id)) {
        await ctx.db.delete(before.holding._id);
        await ctx.db.delete(before.security._id);
      }
    return null;
  },
});
export const finish = internalMutation({
  args: {
    ...fenceArgs,
    fromDate: v.string(),
    toDate: v.string(),
    warning: v.string(),
    providerErrors: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await fenced(ctx, args);
    await ctx.db.patch(connection._id, {
      status: "connected",
      syncedAt: Date.now(),
      syncLease: undefined,
      fromDate:
        connection.fromDate && connection.fromDate < args.fromDate
          ? connection.fromDate
          : args.fromDate,
      toDate: args.toDate,
      warning: args.warning,
      providerErrors: args.providerErrors,
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const fail = internalMutation({
  args: { ...fenceArgs, error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (
      connection &&
      connection.syncVersion === args.version &&
      connection.status !== "disconnected"
    )
      await ctx.db.patch(connection._id, {
        status: "error",
        syncLease: undefined,
        error: args.error,
        updatedAt: Date.now(),
      });
    return null;
  },
});
