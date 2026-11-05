import { ConvexError, v } from "convex/values";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isSealed, sealCredential } from "./lib/credentialCrypto";

/** Idempotent, bounded migration; outputs counts/cursors, never credential values. */
export const sealStoredCredentials = internalMutation({
  args: {
    table: v.union(v.literal("plaidItems"), v.literal("simplefinConnections")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { table, cursor }) => {
    let changed = 0;
    if (table === "plaidItems") {
      const page = await ctx.db.query(table).paginate({ cursor, numItems: 25 });
      for (const row of page.page) {
        if (row.accessToken && !isSealed(row.accessToken)) {
          await ctx.db.patch(row._id, {
            accessToken: await sealCredential(
              row.accessToken,
              env.CREDENTIALS_KEY,
            ),
          });
          changed++;
        }
      }
      return { changed, done: page.isDone, cursor: page.continueCursor };
    }
    const page = await ctx.db.query(table).paginate({ cursor, numItems: 25 });
    for (const row of page.page) {
      if (row.accessUrl && !isSealed(row.accessUrl)) {
        await ctx.db.patch(row._id, {
          accessUrl: await sealCredential(row.accessUrl, env.CREDENTIALS_KEY),
        });
        changed++;
      }
    }
    return { changed, done: page.isDone, cursor: page.continueCursor };
  },
});

export const receiptPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) =>
    ctx.db.query("attachments").paginate({ cursor, numItems: 25 }),
});
export const replaceReceipt = internalMutation({
  args: {
    id: v.id("attachments"),
    previous: v.id("_storage"),
    replacement: v.id("_storage"),
  },
  handler: async (ctx, { id, previous, replacement }) => {
    const row = await ctx.db.get(id);
    if (!row || row.storageId !== previous || row.privateDownload) {
      await ctx.storage.delete(replacement);
      return false;
    }
    if (!(await ctx.db.system.get(replacement)))
      throw new ConvexError("Replacement receipt unavailable.");
    await ctx.db.patch(id, { storageId: replacement, privateDownload: true });
    await ctx.storage.delete(previous);
    return true;
  },
});
/** Copy first, atomically swap, then revoke the old permanent download URL. */
export const rotateReceiptUrls = internalAction({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    { cursor },
  ): Promise<{ changed: number; done: boolean; cursor: string }> => {
    const page: {
      page: Doc<"attachments">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.securityMaintenance.receiptPage, {
      cursor,
    });
    let changed = 0;
    for (const row of page.page) {
      if (row.privateDownload) continue;
      const blob = await ctx.storage.get(row.storageId);
      if (!blob) continue;
      const replacement = await ctx.storage.store(blob);
      try {
        if (
          await ctx.runMutation(internal.securityMaintenance.replaceReceipt, {
            id: row._id,
            previous: row.storageId,
            replacement,
          })
        )
          changed++;
      } catch (error) {
        await ctx.storage.delete(replacement);
        throw error;
      }
    }
    return { changed, done: page.isDone, cursor: page.continueCursor };
  },
});
