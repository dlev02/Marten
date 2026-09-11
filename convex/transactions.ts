import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { api, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import schema from "./schema";
import {
  userQuery,
  userMutation,
  userAction,
  owned,
  text,
  date,
} from "./lib/access";
import { transactionFields } from "./validators";
import {
  changeMerchantCount,
  insertTransaction,
  loadRuleContext,
  refreshSearch,
  validateTransaction,
  type UserWrite,
  type TransactionFields,
} from "./lib/transactions";
import type { Id } from "./_generated/dataModel";
import { normalize } from "./lib/finance";

const patchValidator = v.object(transactionFields).partial();
const listArgs = {
  paginationOpts: paginationOptsValidator,
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  search: v.optional(v.string()),
  accountId: v.optional(v.id("accounts")),
  merchantId: v.optional(v.id("merchants")),
};
export const list = userQuery({
  args: listArgs,
  returns: paginationResultValidator(schema.doc("transactions")),
  handler: async (ctx, args) => {
    if (args.paginationOpts.numItems > 200)
      throw new ConvexError("Load at most 200 transactions at a time.");
    if (args.from) date(args.from);
    if (args.to) date(args.to);
    if (args.accountId) await owned(ctx, args.accountId);
    if (args.merchantId) await owned(ctx, args.merchantId);
    const result = args.search?.trim()
      ? await ctx.db
          .query("transactions")
          .withSearchIndex("search_text", (q) =>
            q
              .search("searchText", args.search!.trim())
              .eq("userId", ctx.userId),
          )
          .paginate(args.paginationOpts)
      : args.accountId
        ? await ctx.db
            .query("transactions")
            .withIndex("by_userId_and_accountId_and_date", (q) =>
              q
                .eq("userId", ctx.userId)
                .eq("accountId", args.accountId!)
                .gte("date", args.from ?? "0000")
                .lte("date", args.to ?? "9999"),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : args.merchantId
          ? await ctx.db
              .query("transactions")
              .withIndex("by_userId_and_merchantId_and_date", (q) =>
                q
                  .eq("userId", ctx.userId)
                  .eq("merchantId", args.merchantId!)
                  .gte("date", args.from ?? "0000")
                  .lte("date", args.to ?? "9999"),
              )
              .order("desc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("transactions")
              .withIndex("by_userId_and_date", (q) =>
                q
                  .eq("userId", ctx.userId)
                  .gte("date", args.from ?? "0000")
                  .lte("date", args.to ?? "9999"),
              )
              .order("desc")
              .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.filter(
        (tx) =>
          !("removedFromBank" in tx && tx.removedFromBank) &&
          (!args.accountId || tx.accountId === args.accountId) &&
          (!args.merchantId || tx.merchantId === args.merchantId) &&
          (!args.from || tx.date >= args.from) &&
          (!args.to || tx.date <= args.to),
      ),
    };
  },
});
export const detail = userQuery({
  args: { id: v.id("transactions") },
  returns: v.object({
    transaction: schema.doc("transactions"),
    attachments: v.array(
      schema.doc("attachments").extend({ url: v.union(v.string(), v.null()) }),
    ),
    activity: v.array(schema.doc("activity")),
  }),
  handler: async (ctx, { id }) => {
    const transaction = await owned(ctx, id);
    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", id))
      .take(21);
    const activity = await ctx.db
      .query("activity")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", id))
      .order("desc")
      .take(50);
    return {
      transaction,
      attachments: await Promise.all(
        attachments.map(async (item) => ({
          ...item,
          url: await ctx.storage.getUrl(item.storageId),
        })),
      ),
      activity,
    };
  },
});
async function updateOne(
  ctx: UserWrite,
  id: Id<"transactions">,
  patch: Partial<TransactionFields>,
) {
  const tx = await owned(ctx, id);
  if (
    tx.source === "plaid" &&
    (patch.accountId !== undefined ||
      patch.amountCents !== undefined ||
      patch.date !== undefined ||
      patch.pending !== undefined ||
      patch.originalName !== undefined)
  )
    throw new ConvexError(
      "Bank amounts, dates, and accounts are managed by your connection.",
    );
  const next = { ...tx, ...patch };
  await validateTransaction(ctx, next);
  await ctx.db.patch(id, {
    ...patch,
    ...(patch.splits !== undefined ? { splitDraft: undefined } : {}),
    editedFields: [...new Set([...tx.editedFields, ...Object.keys(patch)])],
    searchText: await refreshSearch(ctx, next),
    updatedAt: Date.now(),
  });
  if (!tx.removedFromBank)
    await changeMerchantCount(ctx, tx.merchantId, next.merchantId);
  if (Object.keys(patch).length)
    await ctx.db.insert("activity", {
      userId: ctx.userId,
      transactionId: id,
      message: `Updated ${Object.keys(patch).join(", ")}`,
    });
}
export const update = userMutation({
  args: { id: v.id("transactions"), patch: patchValidator },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    await updateOne(ctx, id, patch);
    return null;
  },
});
export const create = userMutation({
  args: transactionFields,
  returns: v.id("transactions"),
  handler: (ctx, fields) => insertTransaction(ctx, fields, "manual"),
});
export const bulkUpdate = userMutation({
  args: { ids: v.array(v.id("transactions")), patch: patchValidator },
  returns: v.number(),
  handler: async (ctx, { ids, patch }) => {
    if (ids.length > 100)
      throw new ConvexError("Select at most 100 transactions.");
    for (const id of new Set(ids)) await updateOne(ctx, id, patch);
    return new Set(ids).size;
  },
});
export const remove = userMutation({
  args: { id: v.id("transactions") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const tx = await owned(ctx, id);
    if (tx.source === "plaid")
      throw new ConvexError(
        "Hide a bank transaction to exclude it from reports.",
      );
    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", id))
      .take(21);
    for (const a of attachments) {
      await ctx.storage.delete(a.storageId);
      await ctx.db.delete(a._id);
    }
    await changeMerchantCount(ctx, tx.merchantId, null);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.transactions.clearActivity, {
      transactionId: id,
    });
    return null;
  },
});
export const clearActivity = internalMutation({
  args: { transactionId: v.id("transactions") },
  returns: v.null(),
  handler: async (ctx, { transactionId }) => {
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_transactionId", (q) =>
        q.eq("transactionId", transactionId),
      )
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.transactions.clearActivity, {
        transactionId,
      });
    return null;
  },
});
export const importCsv = userMutation({
  args: {
    batchId: v.string(),
    rows: v.array(v.object({ key: v.string(), ...transactionFields })),
  },
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx, { batchId, rows }) => {
    text(batchId, 200);
    if (rows.length > 100)
      throw new ConvexError("Import at most 100 rows per batch.");
    let inserted = 0,
      skipped = 0;
    const ruleContext = await loadRuleContext(ctx);
    for (const { key, ...fields } of rows) {
      text(key, 200);
      const importKey = `${batchId}:${key}`;
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_userId_and_importKey", (q) =>
          q.eq("userId", ctx.userId).eq("importKey", importKey),
        )
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await insertTransaction(ctx, fields, "csv", importKey, ruleContext);
      inserted++;
    }
    return { inserted, skipped };
  },
});
export const importMapped = userMutation({
  args: {
    rows: v.array(
      v.object({
        key: v.string(),
        accountId: v.id("accounts"),
        categoryId: v.id("categories"),
        merchantName: v.string(),
        date: v.string(),
        amountCents: v.number(),
        originalName: v.string(),
        notes: v.string(),
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx, { rows }) => {
    if (rows.length > 100)
      throw new ConvexError("Import at most 100 rows per batch.");
    const ruleContext = await loadRuleContext(ctx);
    let inserted = 0,
      skipped = 0;
    for (const { key, merchantName, ...fields } of rows) {
      if (!/^[a-f0-9]{64}$/.test(key))
        throw new ConvexError("Invalid import row key.");
      const importKey = `mapped-v1:${key}`;
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_userId_and_importKey", (q) =>
          q.eq("userId", ctx.userId).eq("importKey", importKey),
        )
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      // Merchant creation and transaction insertion share the same atomic batch.
      // A validation failure cannot leave behind partial rows or empty merchants.
      const name = text(merchantName);
      const normalizedName = normalize(name);
      const merchant = await ctx.db
        .query("merchants")
        .withIndex("by_userId_and_normalizedName", (q) =>
          q.eq("userId", ctx.userId).eq("normalizedName", normalizedName),
        )
        .unique();
      const merchantId =
        merchant?._id ??
        (await ctx.db.insert("merchants", {
          userId: ctx.userId,
          name,
          normalizedName,
          color: "#648981",
          transactionCount: 0,
        }));
      await insertTransaction(
        ctx,
        {
          ...fields,
          merchantId,
          tagIds: [],
          reviewed: false,
          hidden: false,
          pending: false,
          splits: [],
        },
        "csv",
        importKey,
        ruleContext,
      );
      inserted++;
    }
    return { inserted, skipped };
  },
});
export const attachStored = internalMutation({
  args: {
    userId: v.id("users"),
    transactionId: v.id("transactions"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id("attachments"),
  handler: async (ctx, args) => {
    const transaction = await owned(
      { ...ctx, userId: args.userId },
      args.transactionId,
    );
    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_transactionId", (q) =>
        q.eq("transactionId", args.transactionId),
      )
      .take(20);
    if (existing.length >= 20)
      throw new ConvexError("A transaction can have up to 20 receipts.");
    await ctx.db.patch(transaction._id, {
      attachmentCount: existing.length + 1,
    });
    return await ctx.db.insert("attachments", args);
  },
});

function matchesReceiptType(bytes: ArrayBuffer, contentType: string) {
  const header = new Uint8Array(bytes);
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, index) => header[offset + index] === byte);
  switch (contentType) {
    case "image/jpeg":
      return matches([0xff, 0xd8, 0xff]);
    case "image/png":
      return matches([137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/webp":
      return matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8);
    case "application/pdf":
      return matches([37, 80, 68, 70, 45]);
    default:
      return false;
  }
}

export const uploadAttachment = userAction({
  args: {
    transactionId: v.id("transactions"),
    name: v.string(),
    contentType: v.string(),
    bytes: v.bytes(),
  },
  returns: v.id("attachments"),
  handler: async (ctx, args): Promise<Id<"attachments">> => {
    await ctx.runQuery(api.transactions.detail, { id: args.transactionId });
    text(args.name, 240);
    if (
      !matchesReceiptType(args.bytes, args.contentType) ||
      args.bytes.byteLength > 5 * 1024 * 1024 ||
      !args.bytes.byteLength
    )
      throw new ConvexError(
        "Choose a JPEG, PNG, WebP, or PDF receipt up to 5 MB.",
      );
    // Header checks reject mislabeled files; they are not a full file sanitizer.
    const storageId = await ctx.storage.store(
      new Blob([args.bytes], { type: args.contentType }),
    );
    try {
      return await ctx.runMutation(internal.transactions.attachStored, {
        userId: ctx.userId,
        transactionId: args.transactionId,
        storageId,
        name: args.name,
        contentType: args.contentType,
        size: args.bytes.byteLength,
      });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  },
});
export const deleteAttachment = userMutation({
  args: { id: v.id("attachments") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await owned(ctx, id);
    const transaction = await owned(ctx, row.transactionId);
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    await ctx.db.patch(transaction._id, {
      attachmentCount: Math.max(0, (transaction.attachmentCount ?? 1) - 1),
    });
    return null;
  },
});
