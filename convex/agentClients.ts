import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { agentRateLimiter } from "./lib/agentLimits";
import type { AgentClient } from "./lib/agentAuth";

/**
 * Dynamic Client Registration (RFC 7591) lets assistants without a predefined
 * Marten client ID, such as Grok, connect. Registration is anonymous by
 * design, so it is bounded three ways: a per-address rate limit, a daily cap
 * on new registrations, and a sweep that removes registrations with no live
 * connection after a day. Registered clients are always shown to the user as
 * unverified on the consent screen.
 */
const UNUSED_REGISTRATION_MS = 24 * 60 * 60_000;
export const DAILY_REGISTRATION_CAP = 500;

export const register = internalMutation({
  args: {
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    addressKey: v.string(),
  },
  handler: async (ctx, args) => {
    const perAddress = await agentRateLimiter.limit(ctx, "agentRegister", {
      key: args.addressKey,
    });
    if (!perAddress.ok) return { error: "rate_limited" as const };
    const now = Date.now();
    const recent = await ctx.db
      .query("agentClients")
      .withIndex("by_createdAt", (q) =>
        q.gt("createdAt", now - UNUSED_REGISTRATION_MS),
      )
      .take(DAILY_REGISTRATION_CAP);
    if (recent.length >= DAILY_REGISTRATION_CAP)
      return { error: "capacity" as const };
    await ctx.db.insert("agentClients", {
      clientId: args.clientId,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      createdAt: now,
    });
    return { createdAt: now };
  },
});

export const get = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }): Promise<AgentClient | null> => {
    const row = await ctx.db
      .query("agentClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .unique();
    return row
      ? {
          clientId: row.clientId,
          clientName: row.clientName,
          redirectUris: row.redirectUris,
        }
      : null;
  },
});

/** Removes registrations older than a day that no live connection uses. */
export const sweep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db
      .query("agentClients")
      .withIndex("by_createdAt", (q) =>
        q.lt("createdAt", now - UNUSED_REGISTRATION_MS),
      )
      .paginate({ cursor, numItems: 100 });
    for (const client of page.page) {
      const grants = await ctx.db
        .query("agentGrants")
        .withIndex("by_clientId", (q) => q.eq("clientId", client.clientId))
        .take(50);
      const live = grants.some(
        (grant) => grant.revokedAt === undefined && grant.expiresAt > now,
      );
      if (!live && grants.length < 50) await ctx.db.delete(client._id);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.agentClients.sweep, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
