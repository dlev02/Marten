import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Lets actions confirm a session row still exists before doing user work. */
export const isActive = internalQuery({
  args: { sessionId: v.id("authSessions") },
  returns: v.boolean(),
  handler: async (ctx, { sessionId }) => (await ctx.db.get(sessionId)) !== null,
});
