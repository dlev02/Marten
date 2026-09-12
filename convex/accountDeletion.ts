import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { userMutation, userQuery } from "./lib/access";
import { plaidRequest } from "./lib/plaidApi";

/**
 * Self-service account deletion.
 *
 * The public mutation only records the request and schedules the work; every
 * owned document is then removed in bounded batches by `deleteBatch`, which
 * reschedules itself until each table is empty. Bank access at Plaid is revoked
 * first, but a failed revocation never blocks deletion: the user must always be
 * able to leave. The auth user row goes last so the sweep can be re-run safely.
 */

const BATCH = 200;
const CONFIRMATION = "DELETE";

// Every table that stores a document for one user, grouped by the index whose
// first field is `userId`. Keep this list in sync with schema.ts.
const byUserId = [
  "agentPreferences",
  "agentActivity",
  "reminderPreferences",
  "reminderEmailVerifications",
  "forecastScenarios",
  "investmentSyncStates",
  "investmentHoldings",
  "investmentTransactions",
  "investmentSecurities",
  "attachments",
  "uploads",
  "activity",
  "recurring",
  "savedReports",
  "tags",
  "merchants",
  "categories",
  "groups",
  "accounts",
  "simplefinConnections",
  "plaidItems",
] as const;
const byUserIdAndDate = [
  "creditScores",
  "transactions",
  "balances",
  "recurringPayments",
] as const;

async function deleteStorage(
  ctx: MutationCtx,
  row: Doc<(typeof byUserId)[number]>,
) {
  if ("storageId" in row) await ctx.storage.delete(row.storageId);
  if ("logoStorageId" in row && row.logoStorageId)
    await ctx.storage.delete(row.logoStorageId);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const status = userQuery({
  args: {},
  returns: v.object({
    email: v.union(v.string(), v.null()),
    anonymous: v.boolean(),
    requestedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    return {
      email: user?.email ?? null,
      anonymous: !!user?.isAnonymous,
      requestedAt: profile?.deletionRequestedAt ?? null,
    };
  },
});

export const deleteAccount = userMutation({
  args: { confirmation: v.string(), email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    if (!user || user.isAnonymous || !user.email)
      throw new ConvexError(
        "Demo guests have no account to delete. Exit the demo to leave.",
      );
    if (args.confirmation !== CONFIRMATION)
      throw new ConvexError(`Type ${CONFIRMATION} to confirm.`);
    if (normalizeEmail(args.email) !== normalizeEmail(user.email))
      throw new ConvexError("Enter the email address you sign in with.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (profile?.deletionRequestedAt)
      throw new ConvexError("This account is already being deleted.");
    if (profile)
      await ctx.db.patch(profile._id, { deletionRequestedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.revokeBanks, {
      userId: ctx.userId,
    });
    return null;
  },
});

export const plaidItemsForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("plaidItems"),
      accessToken: v.string(),
      environment: v.union(v.literal("sandbox"), v.literal("production")),
      status: v.string(),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(101);
    return items.map(({ _id, accessToken, environment, status }) => ({
      _id,
      accessToken,
      environment,
      status,
    }));
  },
});

/**
 * Revokes each Plaid Item, reusing the disconnect path so in-flight syncs stop,
 * then hands off to the batched sweep. SimpleFIN keeps no server-side grant to
 * revoke; the stored access URL is simply deleted with the connection row.
 */
export const revokeBanks = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const items = await ctx.runQuery(
      internal.accountDeletion.plaidItemsForUser,
      { userId },
    );
    for (const item of items) {
      try {
        await ctx.runMutation(internal.plaidInternal.disconnectStart, {
          itemId: item._id,
          userId,
        });
        if (item.accessToken && item.status !== "disconnected")
          await plaidRequest(
            "/item/remove",
            { access_token: item.accessToken },
            item.environment,
          );
      } catch (error) {
        // Deletion must not depend on the provider; the token is erased with the row.
        console.warn(
          `Account deletion: Plaid revocation failed for item ${item._id}`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    await ctx.scheduler.runAfter(0, internal.accountDeletion.deleteBatch, {
      userId,
    });
    return null;
  },
});

/**
 * Removes up to BATCH documents per run, oldest tables first, and reschedules
 * itself until nothing owned remains. Only then are the sign-in records and the
 * user row deleted.
 */
export const deleteBatch = internalMutation({
  args: { userId: v.id("users") },
  returns: v.object({ done: v.boolean(), deleted: v.number() }),
  handler: async (ctx, { userId }) => {
    let deleted = 0;
    const continueLater = async () => {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.deleteBatch, {
        userId,
      });
      return { done: false, deleted };
    };
    const budget = () => BATCH - deleted;

    // Agent grants own their tokens and the short-lived authorization requests
    // that created them; a grant goes only once its dependents are gone.
    const grants = await ctx.db
      .query("agentGrants")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(20);
    for (const grant of grants) {
      const tokens = await ctx.db
        .query("agentTokens")
        .withIndex("by_grantId", (q) => q.eq("grantId", grant._id))
        .take(50);
      for (const token of tokens) await ctx.db.delete(token._id);
      deleted += tokens.length;
      // Requests have no grant index; the table only holds pending OAuth flows.
      const requests = await ctx.db
        .query("agentAuthorizationRequests")
        .filter((q) => q.eq(q.field("grantId"), grant._id))
        .take(10);
      for (const request of requests) await ctx.db.delete(request._id);
      deleted += requests.length;
      if (tokens.length < 50 && requests.length < 10) {
        await ctx.db.delete(grant._id);
        deleted++;
      }
      if (budget() <= 0) return continueLater();
    }
    if (grants.length) return continueLater();

    const deliveries = await ctx.db
      .query("reminderDeliveries")
      .withIndex("by_userId_and_channel_and_occurrenceKey", (q) =>
        q.eq("userId", userId),
      )
      .take(budget());
    for (const row of deliveries) await ctx.db.delete(row._id);
    deleted += deliveries.length;
    if (budget() <= 0) return continueLater();

    const rules = await ctx.db
      .query("rules")
      .withIndex("by_userId_and_order", (q) => q.eq("userId", userId))
      .take(budget());
    for (const row of rules) await ctx.db.delete(row._id);
    deleted += rules.length;
    if (budget() <= 0) return continueLater();

    for (const table of byUserIdAndDate) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId_and_date", (q) => q.eq("userId", userId))
        .take(budget());
      for (const row of rows) await ctx.db.delete(row._id);
      deleted += rows.length;
      if (budget() <= 0) return continueLater();
    }

    for (const table of byUserId) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(budget());
      for (const row of rows) {
        await deleteStorage(ctx, row);
        await ctx.db.delete(row._id);
      }
      deleted += rows.length;
      if (budget() <= 0) return continueLater();
    }

    // Everything owned is gone. Remove the workspace profile, then the sign-in.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      if (profile.photoStorageId)
        await ctx.storage.delete(profile.photoStorageId);
      await ctx.db.delete(profile._id);
      deleted++;
    }
    const finished = await deleteAuthRecords(ctx, userId);
    if (!finished) return continueLater();
    return { done: true, deleted };
  },
});

/**
 * Deletes the @convex-dev/auth rows for a user (sessions, refresh tokens,
 * verifiers, accounts, verification codes, rate limits) and finally the user
 * itself. Returns false when a bounded page was full and another run is needed.
 */
async function deleteAuthRecords(ctx: MutationCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(20);
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(100);
    for (const token of tokens) await ctx.db.delete(token._id);
    if (tokens.length === 100) return false;
    // PKCE verifiers are only indexed by signature; the table holds in-flight
    // OAuth sign-ins, so a filtered scan stays small.
    const verifiers = await ctx.db
      .query("authVerifiers")
      .filter((q) => q.eq(q.field("sessionId"), session._id))
      .take(10);
    for (const verifier of verifiers) await ctx.db.delete(verifier._id);
    if (verifiers.length === 10) return false;
    await ctx.db.delete(session._id);
  }
  if (sessions.length === 20) return false;

  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(20);
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(50);
    for (const code of codes) await ctx.db.delete(code._id);
    // Password sign-in throttles by account id; code verification by email.
    await deleteRateLimits(ctx, account._id);
    await ctx.db.delete(account._id);
  }
  if (accounts.length === 20) return false;

  const user = await ctx.db.get(userId);
  if (user?.email) {
    const email = normalizeEmail(user.email);
    await deleteRateLimits(ctx, email);
    const reset = await ctx.db
      .query("resetEmailLimits")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (reset) await ctx.db.delete(reset._id);
  }
  if (user) await ctx.db.delete(user._id);
  return true;
}

async function deleteRateLimits(ctx: MutationCtx, identifier: string) {
  const limits = await ctx.db
    .query("authRateLimits")
    .withIndex("identifier", (q) => q.eq("identifier", identifier))
    .take(10);
  for (const limit of limits) await ctx.db.delete(limit._id);
}
