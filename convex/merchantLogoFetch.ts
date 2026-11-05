"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchWebsiteLogo } from "./lib/merchantImageFetch";

export const store = internalAction({
  args: { hostname: v.string() },
  returns: v.id("_storage"),
  handler: async (ctx, { hostname }) => {
    const image = await fetchWebsiteLogo(hostname);
    return await ctx.storage.store(
      new Blob([image.bytes], { type: image.type }),
    );
  },
});

export const find = internalAction({
  args: { userId: v.id("users"), hostname: v.string() },
  returns: v.object({ storageId: v.id("_storage"), url: v.string() }),
  handler: async (ctx, { userId, hostname }) => {
    const image = await fetchWebsiteLogo(hostname);
    const storageId = await ctx.storage.store(
      new Blob([image.bytes], { type: image.type }),
    );
    try {
      const url = await ctx.storage.getUrl(storageId);
      if (!url) throw new Error("Preview unavailable");
      await ctx.runMutation(internal.merchantLogos.registerPreview, {
        userId,
        storageId,
      });
      return { storageId, url };
    } catch {
      await ctx.storage.delete(storageId);
      throw new ConvexError("The logo couldn’t be saved. Please try again.");
    }
  },
});
