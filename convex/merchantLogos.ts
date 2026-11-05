import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { owned, userAction, userMutation } from "./lib/access";
import { searchBrandLogos } from "../src/lib/brandLogos";

export { validateHostname, sniffImage } from "./lib/merchantImageValidation";

export const registerPreview = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("uploads", { ...args, purpose: "merchant" });
    await ctx.scheduler.runAfter(
      60 * 60 * 1000,
      internal.merchantLogos.expirePreview,
      { storageId: args.storageId },
    );
    return null;
  },
});
export const expirePreview = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const upload = await ctx.db
      .query("uploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .unique();
    if (upload?.purpose === "merchant") {
      await ctx.storage.delete(storageId);
      await ctx.db.delete(upload._id);
    }
    return null;
  },
});

/** Network access runs in Node so DNS answers can be checked and pinned. */
export const findWebsiteLogo = userAction({
  args: { hostname: v.string() },
  returns: v.object({ storageId: v.id("_storage"), url: v.string() }),
  handler: async (
    ctx,
    { hostname },
  ): Promise<{ storageId: Id<"_storage">; url: string }> =>
    ctx.runAction(internal.merchantLogoFetch.find, {
      userId: ctx.userId,
      hostname,
    }),
});

/** Association happens only when the user saves the merchant after reviewing its preview. */
export const selectLogo = userMutation({
  args: {
    merchantId: v.id("merchants"),
    storageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { merchantId, storageId, logoUrl }) => {
    const merchant = await owned(ctx, merchantId);
    if (!!storageId === !!logoUrl)
      throw new ConvexError("Choose one logo before saving.");
    if (storageId) {
      const upload = await ctx.db
        .query("uploads")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .unique();
      if (
        !upload ||
        upload.userId !== ctx.userId ||
        upload.purpose !== "merchant"
      )
        throw new ConvexError(
          "This logo preview has expired. Find the logo again.",
        );
      await ctx.db.delete(upload._id);
    } else if (!searchBrandLogos("").some((logo) => logo.url === logoUrl)) {
      throw new ConvexError("Choose a logo from the local catalog.");
    }
    if (merchant.logoStorageId && merchant.logoStorageId !== storageId)
      await ctx.storage.delete(merchant.logoStorageId);
    await ctx.db.patch(merchantId, { logoStorageId: storageId, logoUrl });
    return null;
  },
});
