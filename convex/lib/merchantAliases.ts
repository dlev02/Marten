import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** One merchant rarely has more old names than this; the bound keeps merges in one transaction. */
const ALIASES_PER_MERCHANT = 200;

/**
 * Finds the merchant an incoming statement name belongs to: the merchant that
 * currently has that normalized name, otherwise the merchant it was renamed or
 * merged into. Every ingest path (bank syncs and spreadsheet imports) resolves
 * through here before creating a merchant, so a rename survives the next sync.
 */
export async function findMerchantByName(
  ctx: QueryCtx,
  userId: Id<"users">,
  normalizedName: string,
): Promise<Doc<"merchants"> | null> {
  const current = await ctx.db
    .query("merchants")
    .withIndex("by_userId_and_normalizedName", (q) =>
      q.eq("userId", userId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (current) return current;
  const alias = await ctx.db
    .query("merchantAliases")
    .withIndex("by_userId_and_normalizedName", (q) =>
      q.eq("userId", userId).eq("normalizedName", normalizedName),
    )
    .first();
  if (!alias) return null;
  const merchant = await ctx.db.get(alias.merchantId);
  // A deleted or foreign target is ignored; the caller creates a merchant.
  return merchant && merchant.userId === userId ? merchant : null;
}

/** Points an old normalized name at a merchant, replacing any earlier alias for it. */
export async function recordMerchantAlias(
  ctx: MutationCtx,
  userId: Id<"users">,
  normalizedName: string,
  merchantId: Id<"merchants">,
) {
  const existing = await ctx.db
    .query("merchantAliases")
    .withIndex("by_userId_and_normalizedName", (q) =>
      q.eq("userId", userId).eq("normalizedName", normalizedName),
    )
    .take(10);
  for (const row of existing) await ctx.db.delete(row._id);
  await ctx.db.insert("merchantAliases", {
    userId,
    normalizedName,
    merchantId,
  });
}

/** A merchant that now owns a name reclaims it from any alias. */
export async function releaseMerchantAlias(
  ctx: MutationCtx,
  userId: Id<"users">,
  normalizedName: string,
) {
  const rows = await ctx.db
    .query("merchantAliases")
    .withIndex("by_userId_and_normalizedName", (q) =>
      q.eq("userId", userId).eq("normalizedName", normalizedName),
    )
    .take(10);
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Moves a merged merchant's old names to the merchant that absorbed it. */
export async function moveMerchantAliases(
  ctx: MutationCtx,
  fromId: Id<"merchants">,
  toId: Id<"merchants">,
) {
  const rows = await ctx.db
    .query("merchantAliases")
    .withIndex("by_merchantId", (q) => q.eq("merchantId", fromId))
    .take(ALIASES_PER_MERCHANT);
  for (const row of rows) await ctx.db.patch(row._id, { merchantId: toId });
}

/** Drops the old names of a merchant that no longer exists. */
export async function deleteMerchantAliases(
  ctx: MutationCtx,
  merchantId: Id<"merchants">,
) {
  const rows = await ctx.db
    .query("merchantAliases")
    .withIndex("by_merchantId", (q) => q.eq("merchantId", merchantId))
    .take(ALIASES_PER_MERCHANT);
  for (const row of rows) await ctx.db.delete(row._id);
}
