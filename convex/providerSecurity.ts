import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { providerRateLimiter } from "./lib/providerLimits";
import { requirePersonalWorkspace } from "./simplefinInternal";

export const reserve = internalMutation({
  args: {
    userId: v.id("users"),
    operation: v.union(
      v.literal("plaidLink"),
      v.literal("plaidExchange"),
      v.literal("bankSync"),
      v.literal("bankPreview"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { userId, operation }) => {
    await requirePersonalWorkspace(ctx, userId);
    const result = await providerRateLimiter.limit(ctx, operation, {
      key: userId,
    });
    if (!result.ok)
      throw new ConvexError(
        "Too many bank requests. Wait a few minutes and try again.",
      );
    return null;
  },
});
export const webhookBudget = internalMutation({
  args: { address: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { address }) => {
    if (
      !(
        await providerRateLimiter.limit(ctx, "webhookAddress", { key: address })
      ).ok
    )
      return false;
    return (await providerRateLimiter.limit(ctx, "webhookGlobal")).ok;
  },
});
