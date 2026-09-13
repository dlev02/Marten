import type { UserRead } from "./lib/access";
import type { Infer } from "convex/values";
import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type FilterBuilder,
} from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
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
  findMatchingTransaction,
  insertTransaction,
  loadRuleContext,
  refreshSearch,
  unionTags,
  validateTransaction,
  type UserWrite,
  type TransactionFields,
} from "./lib/transactions";
import type { Id } from "./_generated/dataModel";
import { normalize } from "./lib/finance";
import { saveRecurringForUser } from "./recurring";
import { matchesRecurringCriteria } from "./lib/recurring";
import { recurringFields } from "./validators";

const patchValidator = v.object(transactionFields).partial();
const listArgs = {
  paginationOpts: paginationOptsValidator,
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  search: v.optional(v.string()),
  accountId: v.optional(v.id("accounts")),
  merchantId: v.optional(v.id("merchants")),
};
const transactionListInput = v.object(listArgs);
export async function listTransactionsForUser(
  ctx: UserRead,
  args: Infer<typeof transactionListInput>,
) {
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
          q.search("searchText", args.search!.trim()).eq("userId", ctx.userId),
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
}
export const list = userQuery({
  args: listArgs,
  returns: paginationResultValidator(schema.doc("transactions")),
  handler: listTransactionsForUser,
});
/** Explicit history boundaries per account; never infer coverage across accounts. */
export const importedHistory = userQuery({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id("accounts"),
      accountName: v.string(),
      lastDate: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(201);
    if (accounts.length > 200)
      throw new ConvexError(
        "Review your imported history dates before connecting a bank.",
      );
    const histories = await Promise.all(
      accounts.map(async (account) => {
        const last = await ctx.db
          .query("transactions")
          .withIndex("by_userId_and_source_and_accountId_and_date", (q) =>
            q
              .eq("userId", ctx.userId)
              .eq("source", "csv")
              .eq("accountId", account._id),
          )
          .order("desc")
          .first();
        return last
          ? {
              accountId: account._id,
              accountName: account.name,
              lastDate: last.date,
            }
          : null;
      }),
    );
    return histories.filter(
      (row): row is NonNullable<typeof row> => row !== null,
    );
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
export async function updateOne(
  ctx: UserWrite,
  id: Id<"transactions">,
  patch: Partial<TransactionFields>,
) {
  const tx = await owned(ctx, id);
  if (
    (tx.source === "plaid" ||
      tx.source === "simplefin" ||
      tx.source === "lunchflow") &&
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
  args: {
    ids: v.array(v.id("transactions")),
    patch: patchValidator,
    tagChange: v.optional(
      v.object({
        mode: v.union(
          v.literal("add"),
          v.literal("remove"),
          v.literal("replace"),
        ),
        ids: v.array(v.id("tags")),
      }),
    ),
    recurringFrequency: v.optional(recurringFields.frequency),
  },
  returns: v.number(),
  handler: async (ctx, { ids, patch, tagChange, recurringFrequency }) => {
    if (ids.length > 100)
      throw new ConvexError("Select at most 100 transactions.");
    if (tagChange) {
      if (tagChange.ids.length > 100)
        throw new ConvexError("Choose up to 100 tags.");
      for (const id of tagChange.ids) await owned(ctx, id);
    }
    for (const id of new Set(ids)) {
      const tx = await owned(ctx, id);
      const changes = { ...patch };
      if (tagChange)
        changes.tagIds =
          tagChange.mode === "add"
            ? [...new Set([...tx.tagIds, ...tagChange.ids])]
            : tagChange.mode === "remove"
              ? tx.tagIds.filter((id) => !tagChange.ids.includes(id))
              : [...new Set(tagChange.ids)];
      await updateOne(ctx, id, changes);
      if (recurringFrequency) {
        const next = { ...tx, ...changes };
        if (next.pending || next.hidden || next.removedFromBank)
          throw new ConvexError(
            "Choose visible, posted transactions to create recurring schedules.",
          );
        const schedules = await ctx.db
          .query("recurring")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(500);
        if (
          !schedules.some(
            (schedule) =>
              schedule.active &&
              schedule.frequency === recurringFrequency &&
              matchesRecurringCriteria(schedule, next),
          )
        )
          await saveRecurringForUser(ctx, {
            merchantId: next.merchantId,
            accountId: next.accountId,
            categoryId: next.categoryId,
            amountCents: next.amountCents,
            amountToleranceCents: 0,
            frequency: recurringFrequency,
            nextDate: next.date,
            active: true,
            source: "manual",
            note: "",
          });
      }
    }
    return new Set(ids).size;
  },
});
/** Deletes one row with its receipts and activity; merchant counts stay accurate. */
async function deleteTransactionRow(ctx: MutationCtx, tx: Doc<"transactions">) {
  const attachments = await ctx.db
    .query("attachments")
    .withIndex("by_transactionId", (q) => q.eq("transactionId", tx._id))
    .take(21);
  for (const a of attachments) {
    await ctx.storage.delete(a.storageId);
    await ctx.db.delete(a._id);
  }
  // Rows the bank withdrew were already taken out of the merchant's count.
  if (!tx.removedFromBank) await changeMerchantCount(ctx, tx.merchantId, null);
  await ctx.db.delete(tx._id);
  await ctx.scheduler.runAfter(0, internal.transactions.clearActivity, {
    transactionId: tx._id,
  });
}
async function removeOne(ctx: UserWrite, id: Id<"transactions">) {
  const tx = await owned(ctx, id);
  if (
    tx.source === "plaid" ||
    tx.source === "simplefin" ||
    tx.source === "lunchflow"
  )
    throw new ConvexError(
      "Hide a bank transaction to exclude it from reports.",
    );
  await deleteTransactionRow(ctx, tx);
}
async function investmentAccounts(ctx: UserRead) {
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(201);
  return accounts.filter((account) => account.kind === "investment");
}
const providerRows = (q: FilterBuilder<DataModel["transactions"]>) =>
  q.or(
    q.eq(q.field("source"), "plaid"),
    q.eq(q.field("source"), "simplefin"),
    q.eq(q.field("source"), "lunchflow"),
  );
/**
 * Bank-imported rows sitting in investment accounts: trades, dividends, sweeps.
 * Shown beside the investment activity preference so turning it off can offer
 * to remove what an earlier import already brought in.
 */
export const investmentActivity = userQuery({
  args: {},
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    let count = 0,
      capped = false;
    for (const account of await investmentAccounts(ctx)) {
      const rows = await ctx.db
        .query("transactions")
        .withIndex("by_userId_and_accountId_and_date", (q) =>
          q.eq("userId", ctx.userId).eq("accountId", account._id),
        )
        .filter(providerRows)
        .take(501);
      count += Math.min(rows.length, 500);
      if (rows.length > 500) capped = true;
    }
    return { count, capped };
  },
});
/**
 * Deletes a merchant that this removal emptied, unless a rule, recurring item
 * or saved report still points at it. Manually created merchants keep their
 * count and are never touched here.
 */
async function pruneEmptiedMerchants(
  ctx: UserWrite,
  merchantIds: Set<Id<"merchants">>,
) {
  let referenced: Set<Id<"merchants">> | null = null;
  for (const merchantId of merchantIds) {
    const merchant = await ctx.db.get(merchantId);
    if (!merchant || merchant.transactionCount > 0) continue;
    if (!referenced) {
      referenced = new Set();
      const [rules, recurring, reports] = await Promise.all([
        ctx.db
          .query("rules")
          .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
          .take(201),
        ctx.db
          .query("recurring")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(501),
        ctx.db
          .query("savedReports")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(101),
      ]);
      for (const rule of rules)
        if (rule.actions.merchantId) referenced.add(rule.actions.merchantId);
      for (const row of recurring) referenced.add(row.merchantId);
      for (const report of reports)
        if (report.merchantId) referenced.add(report.merchantId);
    }
    if (referenced.has(merchantId)) continue;
    if (merchant.logoStorageId)
      await ctx.storage.delete(merchant.logoStorageId);
    await ctx.db.delete(merchantId);
  }
}
/**
 * Removes bank-imported investment activity in batches of 100 rows. Manual and
 * spreadsheet rows in the same accounts stay; merchants that only existed for
 * the removed trades go with them so the Merchants list is not cluttered.
 * The rows return through a later import once the preference is on again.
 */
export const removeInvestmentActivity = userMutation({
  args: {},
  returns: v.object({ done: v.boolean(), removed: v.number() }),
  handler: async (ctx) => {
    for (const account of await investmentAccounts(ctx)) {
      const rows = await ctx.db
        .query("transactions")
        .withIndex("by_userId_and_accountId_and_date", (q) =>
          q.eq("userId", ctx.userId).eq("accountId", account._id),
        )
        .filter(providerRows)
        .take(100);
      if (!rows.length) continue;
      const touched = new Set<Id<"merchants">>();
      for (const tx of rows) {
        await deleteTransactionRow(ctx, tx);
        touched.add(tx.merchantId);
      }
      await pruneEmptiedMerchants(ctx, touched);
      return { done: false, removed: rows.length };
    }
    return { done: true, removed: 0 };
  },
});
export const bulkRemove = userMutation({
  args: { ids: v.array(v.id("transactions")) },
  returns: v.number(),
  handler: async (ctx, { ids }) => {
    if (!ids.length || ids.length > 100)
      throw new ConvexError("Select 1 to 100 transactions.");
    for (const id of new Set(ids)) await removeOne(ctx, id);
    return new Set(ids).size;
  },
});
export const remove = userMutation({
  args: { id: v.id("transactions") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await removeOne(ctx, id);
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
const TAG_COLORS = [
  "#648981",
  "#7b9cbd",
  "#be9b80",
  "#e89d7c",
  "#7ba792",
  "#9a86b8",
  "#c98f9d",
  "#8fa3c9",
];
/** Finds or creates each named tag once per import batch. */
async function ensureTags(ctx: UserWrite, names: string[]) {
  const existing = await ctx.db
    .query("tags")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(201);
  if (existing.length > 200)
    throw new ConvexError("This workspace has too many tags.");
  const byName = new Map(
    existing.map((tag) => [tag.name.trim().toLowerCase(), tag._id]),
  );
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (byName.has(key)) continue;
    if (byName.size >= 200)
      throw new ConvexError(
        "Importing these tags would exceed 200 tags. Remove unused tags first.",
      );
    const id = await ctx.db.insert("tags", {
      userId: ctx.userId,
      name: text(name, 60),
      color: TAG_COLORS[byName.size % TAG_COLORS.length],
      order: byName.size,
    });
    byName.set(key, id);
  }
  return (rowNames: string[]) =>
    rowNames.map((name) => byName.get(name.trim().toLowerCase())!);
}
export const importMapped = userMutation({
  args: {
    rows: v.array(
      v.object({
        key: v.string(),
        accountId: v.id("accounts"),
        categoryId: v.id("categories"),
        categoryMatched: v.optional(v.boolean()),
        descriptionInferred: v.optional(v.boolean()),
        merchantName: v.string(),
        date: v.string(),
        amountCents: v.number(),
        originalName: v.string(),
        notes: v.string(),
        tags: v.optional(v.array(v.string())),
        reviewed: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
    matched: v.number(),
  }),
  handler: async (ctx, { rows }) => {
    if (rows.length > 100)
      throw new ConvexError("Import at most 100 rows per batch.");
    const ruleContext = await loadRuleContext(ctx);
    const tagIdsFor = await ensureTags(
      ctx,
      rows.flatMap((row) => row.tags ?? []),
    );
    let inserted = 0,
      skipped = 0,
      matched = 0;
    for (const {
      key,
      merchantName,
      tags = [],
      reviewed = false,
      categoryMatched = false,
      descriptionInferred = false,
      ...fields
    } of rows) {
      if (!/^[a-f0-9]{64}$/.test(key))
        throw new ConvexError("Invalid import row key.");
      if (tags.length > 30)
        throw new ConvexError("Use at most 30 tags per row.");
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
      await owned(ctx, fields.accountId);
      const tagIds = tagIdsFor(tags);
      // A bank sync or manual entry that already holds this purchase gains the
      // spreadsheet's notes, tags, category, and review state instead of a twin.
      const synced = descriptionInferred
        ? null
        : await findMatchingTransaction(
            ctx,
            {
              accountId: fields.accountId,
              date: fields.date,
              amountCents: fields.amountCents,
              originalName: fields.originalName,
            },
            (row) =>
              row.source !== "csv" && !row.importKey && !row.removedFromBank,
          );
      if (synced) {
        const editedFields = [...synced.editedFields];
        const patch: Partial<TransactionFields> = {
          tagIds: unionTags(synced.tagIds, tagIds),
          reviewed: synced.reviewed || reviewed,
        };
        if (!synced.notes && fields.notes) {
          patch.notes = fields.notes;
          if (!editedFields.includes("notes")) editedFields.push("notes");
        }
        if (categoryMatched && !editedFields.includes("categoryId")) {
          await owned(ctx, fields.categoryId);
          patch.categoryId = fields.categoryId;
          editedFields.push("categoryId");
        }
        const merged = { ...synced, ...patch };
        await ctx.db.patch(synced._id, {
          ...patch,
          editedFields,
          importKey,
          updatedAt: Date.now(),
          searchText: await refreshSearch(ctx, merged),
        });
        await ctx.db.insert("activity", {
          userId: ctx.userId,
          transactionId: synced._id,
          message: `Matched a spreadsheet row dated ${fields.date} and added its details instead of importing a duplicate.`,
        });
        matched++;
        continue;
      }
      // Merchant creation and transaction insertion share the same atomic batch.
      // A validation failure cannot leave behind partial rows or empty merchants.
      const name = descriptionInferred
        ? "No merchant supplied"
        : text(merchantName);
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
      const importedId = await insertTransaction(
        ctx,
        {
          ...fields,
          merchantId,
          tagIds,
          reviewed,
          hidden: false,
          pending: false,
          splits: [],
        },
        "csv",
        importKey,
        ruleContext,
        // A category the file named is the person's choice; rules keep it.
        categoryMatched ? ["categoryId"] : [],
      );
      if (descriptionInferred)
        await ctx.db.patch(importedId, { importMatchDisabled: true });
      inserted++;
    }
    return { inserted, skipped, matched };
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
