import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";

/** Runs in Auth's token-creation transaction, before the previous code is replaced. */
export async function reserveResetEmail(
  ctx: Pick<MutationCtx, "db">,
  address: string,
) {
  const email = address.trim().toLowerCase();
  const now = Date.now();
  const existing = await ctx.db
    .query("resetEmailLimits")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  const withinHour =
    existing && now - existing.windowStartedAt < 60 * 60 * 1000;
  if (existing && now - existing.lastSentAt < 60 * 1000)
    throw new ConvexError(
      "Please wait a minute before requesting another code.",
    );
  if (withinHour && existing.requests >= 5)
    throw new ConvexError(
      "Too many reset requests. Please try again in an hour.",
    );
  const next = {
    email,
    lastSentAt: now,
    windowStartedAt: withinHour ? existing.windowStartedAt : now,
    requests: withinHour ? existing.requests + 1 : 1,
  };
  if (existing) await ctx.db.patch(existing._id, next);
  else await ctx.db.insert("resetEmailLimits", next);
}
