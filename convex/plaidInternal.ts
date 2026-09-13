import { importedAccountMatch } from "./lib/importedAccounts";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  bankAccount,
  bankTransaction,
  environment,
  safeError,
  defaultBankCategory,
  plaidAllowedFor,
  plaidRestrictedMessage,
} from "./lib/plaidApi";
import {
  applyRules,
  changeMerchantCount,
  refreshSearch,
  type TransactionFields,
  findMatchingTransaction,
} from "./lib/transactions";
import { normalize } from "./lib/finance";
const itemArgs = { itemId: v.id("plaidItems"), version: v.number() };
const LEASE_MS = 120000;
async function liveProfile(ctx: Pick<QueryCtx, "db">, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || user.isAnonymous)
    throw new ConvexError(
      "Create an account before connecting a bank. The public demo cannot access real bank data.",
    );
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile || profile.demo)
    throw new ConvexError(
      "Create a personal workspace before connecting a bank. Sample data cannot be mixed with live accounts.",
    );
  return profile;
}
async function fenced(
  ctx: MutationCtx,
  args: { itemId: Id<"plaidItems">; version: number },
) {
  const item = await ctx.db.get(args.itemId);
  if (
    !item ||
    item.status === "disconnected" ||
    item.syncVersion !== args.version ||
    !item.syncLease ||
    item.syncLease < Date.now()
  )
    throw new ConvexError("This sync was superseded. Try again.");
  await liveProfile(ctx, item.userId);
  await ctx.db.patch(item._id, { syncLease: Date.now() + LEASE_MS });
  return item;
}
export const context = internalQuery({
  args: {
    userId: v.id("users"),
    itemId: v.optional(v.id("plaidItems")),
    // Linking (new tokens and exchanges) honors PLAID_ALLOWED_EMAILS; syncing an
    // existing connection does not, so a later allowlist change cannot strand data.
    link: v.optional(v.boolean()),
  },
  returns: v.union(schema.doc("plaidItems"), v.null()),
  handler: async (ctx, args) => {
    await liveProfile(ctx, args.userId);
    if (args.link) {
      const user = await ctx.db.get(args.userId);
      if (!plaidAllowedFor(user?.email, user?.emailVerificationTime))
        throw new ConvexError(plaidRestrictedMessage);
    }
    if (!args.itemId) return null;
    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== args.userId)
      throw new ConvexError("This bank connection is unavailable.");
    return item;
  },
});
export const saveItem = internalMutation({
  args: {
    userId: v.id("users"),
    plaidItemId: v.string(),
    accessToken: v.string(),
    institutionId: v.string(),
    institution: v.string(),
    logoUrl: v.optional(v.string()),
    products: v.array(v.string()),
    environment,
  },
  returns: v.object({
    itemId: v.id("plaidItems"),
    duplicate: v.boolean(),
    sameItem: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await liveProfile(ctx, args.userId);
    const exact = await ctx.db
      .query("plaidItems")
      .withIndex("by_plaidItemId", (q) => q.eq("plaidItemId", args.plaidItemId))
      .unique();
    if (exact) {
      if (exact.userId !== args.userId)
        throw new ConvexError("This bank connection is already in use.");
      return { itemId: exact._id, duplicate: false, sameItem: true };
    }
    const same = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId_and_institutionId", (q) =>
        q.eq("userId", args.userId).eq("institutionId", args.institutionId),
      )
      .take(100);
    const existing = same.find(
      (item) =>
        item.status !== "disconnected" && item.environment === args.environment,
    );
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "error",
        error:
          "Another connection was attempted at this bank. Reconnect this existing connection to restore access.",
        syncVersion: (existing.syncVersion ?? 0) + 1,
        syncLease: undefined,
      });
      return { itemId: existing._id, duplicate: true, sameItem: false };
    }
    const itemId = await ctx.db.insert("plaidItems", {
      ...args,
      status: "connected",
      syncVersion: 0,
    });
    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
    return { itemId, duplicate: false, sameItem: false };
  },
});
export const acquire = internalMutation({
  args: { itemId: v.id("plaidItems") },
  returns: v.union(schema.doc("plaidItems"), v.null()),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.status === "disconnected" ||
      (item.syncLease ?? 0) > Date.now()
    )
      return null;
    await liveProfile(ctx, item.userId);
    const syncVersion = (item.syncVersion ?? 0) + 1;
    const syncLease = Date.now() + LEASE_MS;
    await ctx.db.patch(item._id, {
      syncVersion,
      syncLease,
      status: "syncing",
      error: undefined,
    });
    return { ...item, syncVersion, syncLease, status: "syncing" as const };
  },
});
export const heartbeat = internalMutation({
  args: itemArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await fenced(ctx, args);
    return null;
  },
});
export const updateAccounts = internalMutation({
  args: {
    ...itemArgs,
    accounts: v.array(bankAccount),
    logoUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await fenced(ctx, args);
    if (args.accounts.length > 100)
      throw new ConvexError("This connection has too many accounts.");
    const today = new Date().toISOString().slice(0, 10);
    const ownedAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", item.userId))
      .take(201);
    if (ownedAccounts.length > 200)
      throw new ConvexError("This workspace has too many accounts.");
    for (const incoming of args.accounts) {
      const { accountId: plaidAccountId, ...data } = incoming;
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_userId_and_plaidAccountId", (q) =>
          q.eq("userId", item.userId).eq("plaidAccountId", plaidAccountId),
        )
        .unique();
      const balances = {
        balanceCents: data.balanceCents,
        currency: data.currency,
        availableCents: data.availableCents,
        limitCents: data.limitCents,
        statementCents: data.statementCents,
        minimumCents: data.minimumCents,
        dueDate: data.dueDate,
        statementDate: data.statementDate,
        updatedAt: Date.now(),
      };
      let accountId: Id<"accounts">;
      if (existing) {
        accountId = existing._id;
        // Name and visibility are user preferences. Cached bank data never replaces them.
        await ctx.db.patch(existing._id, {
          ...balances,
          itemId: item._id,
          ...(args.logoUrl ? { logoUrl: args.logoUrl } : {}),
        });
      } else {
        const imported = importedAccountMatch(
          ownedAccounts,
          data,
          args.accounts,
        );
        if (imported) {
          accountId = imported._id;
          await ctx.db.patch(accountId, {
            ...balances,
            itemId: item._id,
            plaidAccountId,
            manual: false,
            institution: item.institution,
            subtype: data.subtype,
            ...(args.logoUrl ? { logoUrl: args.logoUrl } : {}),
          });
          // The original ID keeps transactions, annotations and balance history attached.
          imported.manual = false;
        } else {
          if (ownedAccounts.length >= 200)
            throw new ConvexError("This connection would exceed 200 accounts.");
          accountId = await ctx.db.insert("accounts", {
            ...data,
            userId: item.userId,
            itemId: item._id,
            plaidAccountId,
            institution: item.institution,
            hidden: false,
            excludeNetWorth: false,
            closed: false,
            manual: false,
            updatedAt: Date.now(),
            ...(args.logoUrl ? { logoUrl: args.logoUrl } : {}),
          });
          ownedAccounts.push((await ctx.db.get(accountId))!);
        }
      }
      const snapshot = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q.eq("accountId", accountId).eq("date", today),
        )
        .unique();
      if (snapshot)
        await ctx.db.patch(snapshot._id, { balanceCents: data.balanceCents });
      else
        await ctx.db.insert("balances", {
          userId: item.userId,
          accountId,
          date: today,
          balanceCents: data.balanceCents,
        });
    }
    return null;
  },
});
async function defaultCategory(
  ctx: MutationCtx,
  userId: Id<"users">,
  primary: string,
  amount: number,
) {
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(500);
  const { name, kind } = defaultBankCategory(primary, amount);
  const found = categories.find((c) => c.name === name);
  if (found) return found._id;
  const groups = await ctx.db
    .query("groups")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
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
    emoji: kind === "transfer" ? "↔" : "•",
    order: categories.length,
    enabled: true,
  });
}
export const ingestTransactions = internalMutation({
  args: { ...itemArgs, transactions: v.array(bankTransaction) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await fenced(ctx, args);
    if (args.transactions.length > 100)
      throw new ConvexError(
        "Sync batches must contain at most 100 transactions.",
      );
    const profile = await liveProfile(ctx, item.userId);
    const userCtx = { ...ctx, userId: item.userId };
    for (const incoming of args.transactions) {
      const account = await ctx.db
        .query("accounts")
        .withIndex("by_userId_and_plaidAccountId", (q) =>
          q.eq("userId", item.userId).eq("plaidAccountId", incoming.accountId),
        )
        .unique();
      if (!account || account.itemId !== item._id)
        throw new ConvexError(
          "A transaction account is unavailable. Reconnect to update the shared accounts.",
        );
      // Investment activity is opt-in; see profiles.investmentActivity.
      if (account.kind === "investment" && !profile?.investmentActivity)
        continue;
      const posted = await ctx.db
        .query("transactions")
        .withIndex("by_userId_and_plaidTransactionId", (q) =>
          q
            .eq("userId", item.userId)
            .eq("plaidTransactionId", incoming.transactionId),
        )
        .unique();
      const pending = incoming.pendingTransactionId
        ? await ctx.db
            .query("transactions")
            .withIndex("by_userId_and_plaidTransactionId", (q) =>
              q
                .eq("userId", item.userId)
                .eq("plaidTransactionId", incoming.pendingTransactionId),
            )
            .unique()
        : null;
      const existing = posted ?? pending;
      if (existing) {
        // Carry the pending row (and therefore attachments/activity) into its posted identity.
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
          pending: incoming.pending,
          splits: existing.splits,
        };
        // A changed authorization amount needs a review when a user has already split it.
        let splitDraft = existing.splitDraft;
        if (
          fields.splits.length &&
          fields.splits.reduce((sum, s) => sum + s.amountCents, 0) !==
            fields.amountCents
        ) {
          splitDraft = fields.splits;
          fields.splits = [];
          fields.reviewed = false;
          await ctx.db.insert("activity", {
            userId: item.userId,
            transactionId: existing._id,
            message: `The bank changed the amount from ${(existing.amountCents / 100).toFixed(2)} to ${(fields.amountCents / 100).toFixed(2)} USD. Your original split allocations are saved for review. Reports use the posted total until the split is reconciled.`,
          });
        }
        await ctx.db.patch(existing._id, {
          ...fields,
          splitDraft,
          plaidTransactionId: incoming.transactionId,
          pendingTransactionId: incoming.pendingTransactionId,
          removedFromBank: false,
          updatedAt: Date.now(),
          searchText: await refreshSearch(userCtx, fields),
        });
        if (existing.removedFromBank)
          await changeMerchantCount(ctx, null, existing.merchantId);
        continue;
      }
      // A row imported from a spreadsheet (such as a Monarch export) before
      // this bank connected becomes the bank's row, keeping its annotations.
      const imported = await findMatchingTransaction(
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
      if (imported) {
        const fields: TransactionFields = {
          accountId: imported.accountId,
          merchantId: imported.merchantId,
          categoryId: imported.categoryId,
          date: imported.editedFields.includes("date")
            ? imported.date
            : incoming.date,
          amountCents: imported.amountCents,
          originalName: incoming.name,
          notes: imported.notes,
          tagIds: imported.tagIds,
          reviewed: imported.reviewed,
          hidden: imported.hidden,
          pending: incoming.pending,
          splits: imported.splits,
        };
        await ctx.db.patch(imported._id, {
          ...fields,
          source: "plaid",
          plaidTransactionId: incoming.transactionId,
          pendingTransactionId: incoming.pendingTransactionId,
          removedFromBank: false,
          updatedAt: Date.now(),
          searchText: await refreshSearch(userCtx, fields),
        });
        continue;
      }
      const normalizedName = normalize(incoming.merchant);
      let merchant = await ctx.db
        .query("merchants")
        .withIndex("by_userId_and_normalizedName", (q) =>
          q.eq("userId", item.userId).eq("normalizedName", normalizedName),
        )
        .unique();
      if (!merchant) {
        const id = await ctx.db.insert("merchants", {
          userId: item.userId,
          name: incoming.merchant,
          normalizedName,
          color: "#64748b",
          transactionCount: 0,
          ...(incoming.logoUrl ? { logoUrl: incoming.logoUrl } : {}),
        });
        merchant = (await ctx.db.get(id))!;
      } else if (
        incoming.logoUrl &&
        !merchant.logoUrl &&
        !merchant.logoStorageId
      )
        await ctx.db.patch(merchant._id, { logoUrl: incoming.logoUrl });
      const fields = await applyRules(userCtx, {
        accountId: account._id,
        merchantId: merchant._id,
        categoryId: await defaultCategory(
          ctx,
          item.userId,
          incoming.category,
          incoming.amountCents,
        ),
        date: incoming.date,
        amountCents: incoming.amountCents,
        originalName: incoming.name,
        notes: "",
        tagIds: [],
        reviewed: !profile.reviewNew,
        hidden: false,
        pending: incoming.pending,
        splits: [],
      });
      await ctx.db.insert("transactions", {
        ...fields,
        userId: item.userId,
        source: "plaid",
        plaidTransactionId: incoming.transactionId,
        ...(incoming.pendingTransactionId
          ? { pendingTransactionId: incoming.pendingTransactionId }
          : {}),
        updatedAt: Date.now(),
        editedFields: [],
        searchText: await refreshSearch(userCtx, fields),
      });
      await changeMerchantCount(ctx, null, fields.merchantId);
    }
    return null;
  },
});
export const removeTransactions = internalMutation({
  args: { ...itemArgs, transactionIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await fenced(ctx, args);
    if (args.transactionIds.length > 100)
      throw new ConvexError(
        "Sync batches must contain at most 100 transactions.",
      );
    for (const plaidId of args.transactionIds) {
      const row = await ctx.db
        .query("transactions")
        .withIndex("by_userId_and_plaidTransactionId", (q) =>
          q.eq("userId", item.userId).eq("plaidTransactionId", plaidId),
        )
        .unique();
      if (row && !row.removedFromBank) {
        const account = await ctx.db.get(row.accountId);
        if (account?.itemId !== item._id) continue;
        await ctx.db.patch(row._id, {
          removedFromBank: true,
          updatedAt: Date.now(),
        });
        await changeMerchantCount(ctx, row.merchantId, null);
      }
    }
    return null;
  },
});
export const finish = internalMutation({
  args: {
    ...itemArgs,
    cursor: v.optional(v.string()),
    products: v.array(v.string()),
    warning: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await fenced(ctx, args);
    await ctx.db.patch(item._id, {
      cursor: args.cursor ?? item.cursor,
      products: args.products,
      syncedAt: Date.now(),
      syncLease: undefined,
      status: args.warning ? "error" : "connected",
      error: args.warning,
    });
    return null;
  },
});
export const fail = internalMutation({
  args: { ...itemArgs, error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item?.syncVersion === args.version && item.status !== "disconnected")
      await ctx.db.patch(item._id, {
        status: "error",
        error: args.error,
        syncLease: undefined,
      });
    return null;
  },
});
export const disconnectStart = internalMutation({
  args: { itemId: v.id("plaidItems"), userId: v.id("users") },
  returns: schema.doc("plaidItems"),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== args.userId)
      throw new ConvexError("This bank connection is unavailable.");
    await ctx.db.patch(item._id, {
      status: "disconnected",
      syncVersion: (item.syncVersion ?? 0) + 1,
      syncLease: undefined,
    });
    // Disconnect changes data access, not the underlying bank accounts. Keep
    // cached balances and user account flags intact until explicitly edited.
    return item;
  },
});
export const disconnectFinish = internalMutation({
  args: { itemId: v.id("plaidItems"), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item?.status === "disconnected")
      await ctx.db.patch(item._id, {
        ...(args.error ? {} : { accessToken: "" }),
        error: args.error,
      });
    return null;
  },
});
export const webhook = internalMutation({
  args: {
    plaidItemId: v.string(),
    code: v.string(),
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_plaidItemId", (q) => q.eq("plaidItemId", args.plaidItemId))
      .unique();
    if (!item || item.status === "disconnected") return null;
    if (args.code === "USER_PERMISSION_REVOKED") {
      await ctx.db.patch(item._id, {
        status: "error",
        error:
          "Bank access was revoked. Disconnect this connection or reconnect to grant access again.",
        syncVersion: (item.syncVersion ?? 0) + 1,
        syncLease: undefined,
      });
      return null;
    }
    if (
      args.errorCode ||
      args.code === "PENDING_DISCONNECT" ||
      args.code === "PENDING_EXPIRATION"
    ) {
      await ctx.db.patch(item._id, {
        status: "error",
        error: safeError(args.errorCode ?? args.code),
      });
      return null;
    }
    // DEFAULT_UPDATE also covers HOLDINGS and INVESTMENTS_TRANSACTIONS;
    // their signed webhooks refresh the same complete cached snapshot.
    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, {
      itemId: item._id,
    });
    return null;
  },
});
export const sweep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("plaidItems")
      .paginate({ cursor: args.cursor, numItems: 25 });
    for (const item of page.page)
      if (item.status !== "disconnected" && (item.syncLease ?? 0) < Date.now())
        await ctx.scheduler.runAfter(0, internal.plaid.syncItem, {
          itemId: item._id,
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(1000, internal.plaidInternal.sweep, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
