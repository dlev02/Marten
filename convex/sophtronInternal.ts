import { ConvexError, v } from "convex/values";
import {
  env,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  sophtronAccount,
  sophtronConfiguration,
  sophtronSelection,
  sophtronTransaction,
  type SophtronConfig,
} from "./lib/sophtronApi";
import {
  applyRules,
  changeMerchantCount,
  refreshSearch,
  type TransactionFields,
} from "./lib/transactions";
import { normalize } from "./lib/finance";

const LEASE_MS = 120000;
const fenceArgs = {
  connectionId: v.id("sophtronConnections"),
  version: v.number(),
};
export async function requireSophtronOwner(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<SophtronConfig> {
  const config = sophtronConfiguration(env);
  if (!config)
    throw new ConvexError(
      "Sophtron needs a personal server configuration. Open the setup instructions in Bank connections.",
    );
  if (config.ownerUserId !== userId)
    throw new ConvexError(
      "This Sophtron configuration belongs to another Marten user. Use your own personal deployment.",
    );
  const user = await ctx.db.get(userId);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!user || user.isAnonymous || !profile || profile.demo)
    throw new ConvexError(
      "Create a personal workspace before importing from Sophtron. The public demo cannot access real bank data.",
    );
  return config;
}
function sameConfiguration(
  connection: Doc<"sophtronConnections">,
  config: SophtronConfig,
) {
  return (
    connection.apiUserId === config.apiUserId &&
    connection.customerId === config.customerId &&
    connection.environment === config.environment
  );
}
async function currentConnection(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
  config: SophtronConfig,
) {
  const connections = await ctx.db
    .query("sophtronConnections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(101);
  if (connections.length > 100)
    throw new ConvexError(
      "This workspace has too many previous Sophtron configurations.",
    );
  return {
    connections,
    connection:
      connections.find((row) => sameConfiguration(row, config)) ?? null,
  };
}
async function fenced(
  ctx: MutationCtx,
  args: { connectionId: Id<"sophtronConnections">; version: number },
) {
  const connection = await ctx.db.get(args.connectionId);
  if (
    !connection ||
    connection.status === "disconnected" ||
    connection.syncVersion !== args.version ||
    (connection.syncLease ?? 0) < Date.now()
  )
    throw new ConvexError(
      "This Sophtron import was stopped or superseded. Try again.",
    );
  const config = await requireSophtronOwner(ctx, connection.userId);
  if (!sameConfiguration(connection, config))
    throw new ConvexError(
      "The Sophtron server configuration changed. Stop this connection before importing again.",
    );
  await ctx.db.patch(connection._id, { syncLease: Date.now() + LEASE_MS });
  return connection;
}
export const context = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    connection: v.union(schema.doc("sophtronConnections"), v.null()),
    accounts: v.array(schema.doc("accounts")),
  }),
  handler: async (ctx, { userId }) => {
    const config = await requireSophtronOwner(ctx, userId);
    const { connection } = await currentConnection(ctx, userId, config);
    const accounts = connection
      ? await ctx.db
          .query("accounts")
          .withIndex("by_sophtronConnectionId", (q) =>
            q.eq("sophtronConnectionId", connection._id),
          )
          .take(101)
      : [];
    if (accounts.length > 100)
      throw new ConvexError("This Sophtron connection has too many accounts.");
    return { connection, accounts };
  },
});
const preparedAccount = v.object({
  selection: sophtronSelection,
  account: sophtronAccount,
  fromDate: v.string(),
});
export const begin = internalMutation({
  args: {
    userId: v.id("users"),
    accounts: v.array(preparedAccount),
    reconnect: v.boolean(),
    expectedVersion: v.optional(v.number()),
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
    const config = await requireSophtronOwner(ctx, args.userId);
    const { connections, connection } = await currentConnection(
      ctx,
      args.userId,
      config,
    );
    if (connection?.syncVersion !== args.expectedVersion)
      throw new ConvexError(
        "The Sophtron connection changed while its data was loading. Review the accounts and try again.",
      );
    if (
      connections.some(
        (row) =>
          row.status !== "disconnected" && !sameConfiguration(row, config),
      )
    )
      throw new ConvexError(
        "Stop the previous Sophtron connection before using a different customer configuration.",
      );
    if (connection?.status === "disconnected" && !args.reconnect)
      throw new ConvexError(
        "Sophtron imports are stopped. Review and import accounts to reconnect.",
      );
    if ((connection?.syncLease ?? 0) > Date.now())
      throw new ConvexError(
        "A Sophtron import is already running. Wait for it to finish.",
      );
    if (!args.accounts.length || args.accounts.length > 20)
      throw new ConvexError(
        "Import between 1 and 20 Sophtron accounts at a time.",
      );
    if (
      new Set(args.accounts.map((row) => row.account.externalId)).size !==
      args.accounts.length
    )
      throw new ConvexError("Select each Sophtron account once.");
    const version = (connection?.syncVersion ?? 0) + 1;
    const state = {
      status: "syncing" as const,
      syncVersion: version,
      syncLease: Date.now() + LEASE_MS,
      error: undefined,
    };
    const connectionId =
      connection?._id ??
      (await ctx.db.insert("sophtronConnections", {
        userId: args.userId,
        apiUserId: config.apiUserId,
        customerId: config.customerId,
        environment: config.environment,
        status: "syncing",
        syncVersion: version,
        syncLease: state.syncLease,
      }));
    if (connection) await ctx.db.patch(connectionId, state);
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
    let connectionAccountCount = (
      await ctx.db
        .query("accounts")
        .withIndex("by_sophtronConnectionId", (q) =>
          q.eq("sophtronConnectionId", connectionId),
        )
        .take(101)
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    for (const { selection, account: incoming, fromDate } of args.accounts) {
      if (selection.externalAccountId !== incoming.externalId)
        throw new ConvexError("Review the Sophtron account selection again.");
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_sophtronConnectionId_and_sophtronAccountId", (q) =>
          q
            .eq("sophtronConnectionId", connectionId)
            .eq("sophtronAccountId", incoming.externalId),
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
          "This Sophtron account is already imported. Use its existing Marten account.",
        );
      if (!target && ownedAccountCount >= 200)
        throw new ConvexError(
          "This workspace supports up to 200 accounts. Map an existing account before importing another.",
        );
      if (
        target?.sophtronConnectionId !== connectionId &&
        connectionAccountCount >= 100
      )
        throw new ConvexError(
          "This Sophtron connection supports up to 100 imported accounts.",
        );
      if (target && selectedTargets.has(target._id))
        throw new ConvexError(
          "Map each Sophtron account to a different Marten account.",
        );
      if (target) {
        selectedTargets.add(target._id);
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
            "Disconnect this account's Plaid connection before mapping it to Sophtron.",
          );
        if (
          target.sophtronAccountId &&
          target.sophtronAccountId !== incoming.externalId
        )
          throw new ConvexError(
            "This Marten account is mapped to a different Sophtron account.",
          );
        if (
          target.sophtronConnectionId &&
          target.sophtronConnectionId !== connectionId
        ) {
          const previous = await ctx.db.get(target.sophtronConnectionId);
          if (previous && previous.status !== "disconnected")
            throw new ConvexError(
              "Stop the previous Sophtron connection before moving this account.",
            );
        }
        if (!target.sophtronAccountId) {
          const latest = await ctx.db
            .query("transactions")
            .withIndex("by_userId_and_accountId_and_date", (q) =>
              q.eq("userId", args.userId).eq("accountId", target._id),
            )
            .order("desc")
            .first();
          if (latest && latest.date >= fromDate)
            throw new ConvexError(
              `Start the Sophtron import after ${latest.date} for ${target.name}. This keeps its existing history from being counted twice.`,
            );
        }
      }
      const data = {
        balanceCents: incoming.balanceCents,
        currency: incoming.currency,
        availableCents: incoming.availableCents,
        limitCents: incoming.limitCents,
        dueDate: incoming.dueDate,
        statementCents: undefined,
        minimumCents: undefined,
        statementDate: undefined,
        sophtronConnectionId: connectionId,
        sophtronAccountId: incoming.externalId,
        sophtronMemberId: incoming.memberId,
        sophtronImportFromDate:
          target?.sophtronImportFromDate &&
          target.sophtronImportFromDate < fromDate
            ? target.sophtronImportFromDate
            : fromDate,
        sophtronUsdConfirmed: selection.confirmUsd ?? false,
        sophtronDebtSign: selection.debtSign,
        sophtronUpdatedAt: incoming.lastUpdated,
        itemId: undefined,
        plaidAccountId: undefined,
        manual: false,
        updatedAt: Date.now(),
      };
      let accountId: Id<"accounts">;
      if (target) {
        accountId = target._id;
        await ctx.db.patch(accountId, data);
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
        fromDate: data.sophtronImportFromDate,
      });
      if (!target) ownedAccountCount++;
      if (target?.sophtronConnectionId !== connectionId)
        connectionAccountCount++;
    }
    return { connectionId, version, mappings };
  },
});
async function defaultCategory(
  ctx: MutationCtx,
  userId: Id<"users">,
  category: string,
) {
  // CREDIT also means refunds, so direction alone must never classify income.
  const key = normalize(category);
  const transfer =
    /^(transfer|transfers|credit card payment|credit card payments|loan payment|loan payments)$/.test(
      key,
    );
  const income =
    /^(income|salary|payroll|wages|interest income|dividend income)$/.test(key);
  const kind = transfer ? "transfer" : income ? "income" : "expense";
  const name = transfer ? "Transfers" : income ? "Income" : "Uncategorized";
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
  const found = categories.find(
    (c) =>
      c.name === name &&
      groups.some((g) => g._id === c.groupId && g.kind === kind),
  );
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
    transactions: v.array(sophtronTransaction),
  },
  returns: v.object({ imported: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const connection = await fenced(ctx, args);
    const account = await ctx.db.get(args.accountId);
    if (
      !account ||
      account.userId !== connection.userId ||
      account.sophtronConnectionId !== connection._id
    )
      throw new ConvexError(
        "This Sophtron account mapping changed. Review the account before retrying.",
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
        incoming.externalAccountId !== account.sophtronAccountId ||
        incoming.date < (account.sophtronImportFromDate ?? "0000")
      )
        throw new ConvexError(
          "The Sophtron transaction is outside this account's import range.",
        );
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_accountId_and_sophtronTransactionId", (q) =>
          q
            .eq("accountId", account._id)
            .eq("sophtronTransactionId", incoming.externalId),
        )
        .unique();
      if (existing) {
        if (
          existing.userId !== connection.userId ||
          existing.source !== "sophtron"
        )
          throw new ConvexError(
            "This Sophtron transaction identity is unavailable.",
          );
        const fields: TransactionFields = {
          accountId: existing.accountId,
          merchantId: existing.merchantId,
          categoryId: existing.categoryId,
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
            message: `Sophtron changed the posted amount from ${(existing.amountCents / 100).toFixed(2)} to ${(fields.amountCents / 100).toFixed(2)} USD. Your split allocations are saved for review; reports use the updated total until reconciled.`,
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
        source: "sophtron",
        sophtronTransactionId: incoming.externalId,
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
export const finish = internalMutation({
  args: {
    ...fenceArgs,
    fromDate: v.string(),
    toDate: v.string(),
    warning: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await fenced(ctx, args);
    await ctx.db.patch(connection._id, {
      status: "connected",
      syncedAt: Date.now(),
      syncLease: undefined,
      fromDate: args.fromDate,
      toDate: args.toDate,
      warning: args.warning,
      error: undefined,
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
      });
    return null;
  },
});
