import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  investmentLimits,
  normalizedInvestmentEvent,
  normalizedPosition,
  normalizedSecurity,
} from "./lib/investmentData";
import { date } from "./lib/access";

const leaseArgs = { itemId: v.id("plaidItems"), version: v.number() };
async function liveLease(
  ctx: MutationCtx,
  args: { itemId: Id<"plaidItems">; version: number },
) {
  const item = await ctx.db.get(args.itemId);
  if (
    !item ||
    item.status === "disconnected" ||
    item.syncVersion !== args.version ||
    (item.syncLease ?? 0) < Date.now()
  )
    throw new ConvexError("This investment sync was superseded.");
  const user = await ctx.db.get(item.userId);
  if (!user || user.isAnonymous)
    throw new ConvexError("The public demo cannot access real bank data.");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", item.userId))
    .unique();
  if (!profile || profile.demo)
    throw new ConvexError("Live investments require a personal workspace.");
  return item;
}

export const commit = internalMutation({
  args: {
    ...leaseArgs,
    securities: v.array(normalizedSecurity),
    holdings: v.array(normalizedPosition),
    events: v.array(normalizedInvestmentEvent),
    from: v.string(),
    to: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await liveLease(ctx, args);
    date(args.from);
    date(args.to);
    if (args.from > args.to)
      throw new ConvexError("The investment history range is invalid.");
    if (
      args.holdings.length > investmentLimits.holdings ||
      args.securities.length > investmentLimits.securities ||
      args.events.length > investmentLimits.events
    )
      throw new ConvexError(
        "This investment snapshot exceeds Marten's sync limit. Previous data has been kept.",
      );
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .take(101);
    if (accounts.length > 100)
      throw new ConvexError("This connection has too many accounts.");
    const accountMap = new Map(
      accounts
        .filter(
          (row) => row.userId === item.userId && row.kind === "investment",
        )
        .map((row) => [row.plaidAccountId, row._id]),
    );
    const accountFor = (providerId: string) => {
      const id = accountMap.get(providerId);
      if (!id)
        throw new ConvexError(
          "An investment account could not be verified. Previous data has been kept.",
        );
      return id;
    };
    const existingSecurities = await ctx.db
      .query("investmentSecurities")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .take(investmentLimits.securities + 1);
    const previousHoldings = await ctx.db
      .query("investmentHoldings")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .take(investmentLimits.holdings + 1);
    const previousEvents = await ctx.db
      .query("investmentTransactions")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .take(investmentLimits.events + 1);
    if (
      existingSecurities.length > investmentLimits.securities ||
      previousHoldings.length > investmentLimits.holdings ||
      previousEvents.length > investmentLimits.events
    )
      throw new ConvexError(
        "Investment history has reached Marten's storage limit. Previous data has been kept.",
      );
    for (const row of [
      ...existingSecurities,
      ...previousHoldings,
      ...previousEvents,
    ])
      if (row.userId !== item.userId)
        throw new ConvexError("Investment ownership could not be verified.");

    const securities = new Map(
      existingSecurities.map((row) => [row.providerSecurityId, row._id]),
    );
    const distinctSecurities = new Map(
      args.securities.map((row) => [row.providerSecurityId, row]),
    );
    const mergedSecurityCount = new Set([
      ...securities.keys(),
      ...distinctSecurities.keys(),
    ]).size;
    if (mergedSecurityCount > investmentLimits.securities)
      throw new ConvexError(
        "Investment securities have reached Marten's storage limit. Previous data has been kept.",
      );
    for (const row of distinctSecurities.values()) {
      const existing = securities.get(row.providerSecurityId);
      if (existing) await ctx.db.patch(existing, row);
      else
        securities.set(
          row.providerSecurityId,
          await ctx.db.insert("investmentSecurities", {
            ...row,
            userId: item.userId,
            itemId: item._id,
          }),
        );
    }
    const securityFor = (providerId: string) => {
      const id = securities.get(providerId);
      if (!id)
        throw new ConvexError(
          "A holding's security details are incomplete. Previous data has been kept.",
        );
      return id;
    };
    const holdingKey = (
      accountId: Id<"accounts">,
      securityId: Id<"investmentSecurities">,
    ) => JSON.stringify([accountId, securityId]);
    const oldHoldings = new Map(
      previousHoldings.map((row) => [
        holdingKey(row.accountId, row.securityId),
        row,
      ]),
    );
    const retained = new Set<string>();
    const now = Date.now();
    for (const {
      providerAccountId,
      providerSecurityId,
      ...position
    } of args.holdings) {
      const accountId = accountFor(providerAccountId),
        securityId = securityFor(providerSecurityId);
      const key = holdingKey(accountId, securityId);
      if (retained.has(key))
        throw new ConvexError(
          "The bank returned duplicate investment positions. Previous data has been kept.",
        );
      retained.add(key);
      const row = {
        ...position,
        userId: item.userId,
        itemId: item._id,
        accountId,
        securityId,
        syncedAt: now,
      };
      const previous = oldHoldings.get(key);
      if (previous) await ctx.db.replace(previous._id, row);
      else await ctx.db.insert("investmentHoldings", row);
    }
    for (const [key, row] of oldHoldings)
      if (!retained.has(key)) await ctx.db.delete(row._id);

    const incoming = new Map(
      args.events.map((row) => [row.providerTransactionId, row]),
    );
    const oldEvents = new Map(
      previousEvents.map((row) => [row.providerTransactionId, row]),
    );
    if (
      new Set([...oldEvents.keys(), ...incoming.keys()]).size >
      investmentLimits.events
    )
      throw new ConvexError(
        "Investment activity has reached Marten's 5,000-event storage limit. Previous data has been kept.",
      );
    // Cancellation references can cross a page or extend outside this fetched window.
    const canceled = new Set<string>();
    for (const row of [
      ...previousEvents.filter(
        (row) => row.date < args.from || row.date > args.to,
      ),
      ...incoming.values(),
    ])
      if (row.cancelTransactionId) canceled.add(row.cancelTransactionId);
    for (const {
      providerAccountId,
      providerSecurityId,
      ...event
    } of incoming.values()) {
      if (event.date < args.from || event.date > args.to)
        throw new ConvexError(
          "The bank returned activity outside the requested range.",
        );
      const row = {
        ...event,
        userId: item.userId,
        itemId: item._id,
        accountId: accountFor(providerAccountId),
        securityId:
          providerSecurityId === null ? null : securityFor(providerSecurityId),
        canceled: canceled.has(event.providerTransactionId),
        removed: false,
      };
      const previous = oldEvents.get(event.providerTransactionId);
      if (previous) await ctx.db.replace(previous._id, row);
      else await ctx.db.insert("investmentTransactions", row);
    }
    for (const row of previousEvents) {
      if (incoming.has(row.providerTransactionId)) continue;
      await ctx.db.patch(row._id, {
        canceled: canceled.has(row.providerTransactionId),
        removed: row.removed || (row.date >= args.from && row.date <= args.to),
      });
    }
    const state = await ctx.db
      .query("investmentSyncStates")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .unique();
    const stateFields = {
      userId: item.userId,
      itemId: item._id,
      syncedAt: now,
      historyFrom:
        state?.historyFrom && state.historyFrom < args.from
          ? state.historyFrom
          : args.from,
      historyTo: args.to,
      error: null,
    };
    if (state) await ctx.db.replace(state._id, stateFields);
    else await ctx.db.insert("investmentSyncStates", stateFields);
    return null;
  },
});

export const fail = internalMutation({
  args: { ...leaseArgs, error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.status === "disconnected" ||
      item.syncVersion !== args.version
    )
      return null;
    const state = await ctx.db
      .query("investmentSyncStates")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .unique();
    if (state) await ctx.db.patch(state._id, { error: args.error });
    else
      await ctx.db.insert("investmentSyncStates", {
        userId: item.userId,
        itemId: item._id,
        syncedAt: null,
        historyFrom: null,
        historyTo: null,
        error: args.error,
      });
    return null;
  },
});
