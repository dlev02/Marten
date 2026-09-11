import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { owned, text, userAction, userMutation, userQuery } from "./lib/access";
import { kind, ruleFields } from "./validators";
import { normalize, matchesRule } from "./lib/finance";
import {
  changeMerchantCount,
  refreshSearch,
  ruleSplitsFit,
  validateTransaction,
  type UserRead,
} from "./lib/transactions";
import type { Id } from "./_generated/dataModel";

export const saveGroup = userMutation({
  args: {
    id: v.optional(v.id("groups")),
    name: v.string(),
    kind,
    order: v.number(),
  },
  returns: v.id("groups"),
  handler: async (ctx, { id, ...fields }) => {
    fields.name = text(fields.name);
    if (!Number.isFinite(fields.order)) throw new ConvexError("Invalid order.");
    if (id) {
      await owned(ctx, id);
      await ctx.db.patch(id, fields);
      return id;
    }
    return await ctx.db.insert("groups", { userId: ctx.userId, ...fields });
  },
});
export const saveCategory = userMutation({
  args: {
    id: v.optional(v.id("categories")),
    groupId: v.id("groups"),
    name: v.string(),
    emoji: v.string(),
    order: v.number(),
    enabled: v.boolean(),
  },
  returns: v.id("categories"),
  handler: async (ctx, { id, ...fields }) => {
    await owned(ctx, fields.groupId);
    fields.name = text(fields.name);
    text(fields.emoji, 30);
    if (id) {
      await owned(ctx, id);
      await ctx.db.patch(id, fields);
      return id;
    }
    return await ctx.db.insert("categories", { userId: ctx.userId, ...fields });
  },
});
export const saveMerchant = userMutation({
  args: {
    id: v.optional(v.id("merchants")),
    name: v.string(),
    color: v.string(),
  },
  returns: v.id("merchants"),
  handler: async (ctx, { id, name, color }) => {
    name = text(name);
    const normalizedName = normalize(name);
    color = text(color, 40);
    const existing = await ctx.db
      .query("merchants")
      .withIndex("by_userId_and_normalizedName", (q) =>
        q.eq("userId", ctx.userId).eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && existing._id !== id)
      throw new ConvexError(
        "That merchant already exists. Merge the merchants instead.",
      );
    if (id) {
      await owned(ctx, id);
      await ctx.db.patch(id, { name, color, normalizedName });
      await ctx.scheduler.runAfter(0, internal.settings.reindexMerchant, {
        userId: ctx.userId,
        merchantId: id,
        cursor: null,
      });
      return id;
    }
    return await ctx.db.insert("merchants", {
      userId: ctx.userId,
      name,
      normalizedName,
      color,
      transactionCount: 0,
    });
  },
});
export const reindexMerchant = internalMutation({
  args: {
    userId: v.id("users"),
    merchantId: v.id("merchants"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userCtx = { ...ctx, userId: args.userId };
    await owned(userCtx, args.merchantId);
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_merchantId_and_date", (q) =>
        q.eq("userId", args.userId).eq("merchantId", args.merchantId),
      )
      .paginate({ cursor: args.cursor, numItems: 100 });
    for (const tx of rows.page)
      await ctx.db.patch(tx._id, {
        searchText: await refreshSearch(userCtx, tx),
      });
    if (!rows.isDone)
      await ctx.scheduler.runAfter(0, internal.settings.reindexMerchant, {
        ...args,
        cursor: rows.continueCursor,
      });
    return null;
  },
});
export const mergeMerchants = userMutation({
  args: {
    sourceId: v.id("merchants"),
    targetId: v.id("merchants"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    done: v.boolean(),
    cursor: v.string(),
    updated: v.number(),
  }),
  handler: async (ctx, { sourceId, targetId, cursor }) => {
    if (sourceId === targetId)
      throw new ConvexError("Choose two different merchants.");
    const source = await owned(ctx, sourceId);
    const target = await owned(ctx, targetId);
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_merchantId_and_date", (q) =>
        q.eq("userId", ctx.userId).eq("merchantId", sourceId),
      )
      .paginate({ numItems: 100, cursor: cursor ?? null });
    for (const tx of rows.page) {
      await ctx.db.patch(tx._id, {
        merchantId: targetId,
        editedFields: [...new Set([...tx.editedFields, "merchantId"])],
        searchText: await refreshSearch(ctx, { ...tx, merchantId: targetId }),
        updatedAt: Date.now(),
      });
      if (!tx.removedFromBank)
        await changeMerchantCount(ctx, sourceId, targetId);
    }
    if (rows.isDone) {
      const recurring = await ctx.db
        .query("recurring")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(501);
      if (recurring.length > 500)
        throw new ConvexError("Too many recurring items to merge at once.");
      for (const r of recurring)
        if (r.merchantId === sourceId)
          await ctx.db.patch(r._id, { merchantId: targetId });
      const rules = await ctx.db
        .query("rules")
        .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
        .take(201);
      for (const r of rules)
        if (r.actions.merchantId === sourceId)
          await ctx.db.patch(r._id, {
            actions: { ...r.actions, merchantId: targetId },
          });
      const reports = await ctx.db
        .query("savedReports")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(101);
      if (reports.length > 100)
        throw new ConvexError("Too many saved reports to merge at once.");
      for (const report of reports)
        if (report.merchantId === sourceId)
          await ctx.db.patch(report._id, { merchantId: targetId });
      if (source.logoStorageId && source.logoStorageId !== target.logoStorageId)
        await ctx.storage.delete(source.logoStorageId);
      await ctx.db.delete(sourceId);
    }
    return {
      done: rows.isDone,
      cursor: rows.continueCursor,
      updated: rows.page.length,
    };
  },
});
export const saveTag = userMutation({
  args: {
    id: v.optional(v.id("tags")),
    name: v.string(),
    color: v.string(),
    order: v.number(),
  },
  returns: v.id("tags"),
  handler: async (ctx, { id, ...fields }) => {
    fields.name = text(fields.name);
    fields.color = text(fields.color, 40);
    if (id) {
      await owned(ctx, id);
      await ctx.db.patch(id, fields);
      return id;
    }
    return await ctx.db.insert("tags", { userId: ctx.userId, ...fields });
  },
});
export const deleteTag = userMutation({
  args: { id: v.id("tags"), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ done: v.boolean(), cursor: v.string() }),
  handler: async (ctx, { id, cursor }) => {
    await owned(ctx, id);
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
      .paginate({ cursor: cursor ?? null, numItems: 100 });
    for (const tx of rows.page)
      if (tx.tagIds.includes(id))
        await ctx.db.patch(tx._id, {
          tagIds: tx.tagIds.filter((tag) => tag !== id),
        });
    if (rows.isDone) {
      const rules = await ctx.db
        .query("rules")
        .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
        .take(201);
      for (const rule of rules)
        if (rule.actions.tagIds?.includes(id))
          await ctx.db.patch(rule._id, {
            actions: {
              ...rule.actions,
              tagIds: rule.actions.tagIds.filter((tag) => tag !== id),
            },
          });
      await ctx.db.delete(id);
    }
    return { done: rows.isDone, cursor: rows.continueCursor };
  },
});
async function validateRule(
  ctx: UserRead,
  fields: typeof ruleFields extends never
    ? never
    : {
        conditions: { field: string; operator: string; value: string }[];
        actions: {
          merchantId?: Id<"merchants">;
          categoryId?: Id<"categories">;
          tagIds?: Id<"tags">[];
          splits?: { categoryId: Id<"categories">; amountCents: number }[];
        };
      },
) {
  if (!fields.conditions.length || fields.conditions.length > 20)
    throw new ConvexError("Add between 1 and 20 rule conditions.");
  for (const c of fields.conditions) {
    text(c.value, 500);
    if (c.field === "amount" && !Number.isFinite(Number(c.value)))
      throw new ConvexError("Enter a valid rule amount.");
    if (c.field !== "amount" && ["greater", "less"].includes(c.operator))
      throw new ConvexError("This comparison is only supported for amounts.");
    if (c.field === "account" || c.field === "category") {
      const table = c.field === "account" ? "accounts" : "categories";
      const id = ctx.db.normalizeId(table, c.value);
      if (!id) throw new ConvexError("Choose a valid rule item.");
      await owned(ctx, id);
    }
  }
  if (fields.actions.merchantId) await owned(ctx, fields.actions.merchantId);
  if (fields.actions.categoryId) await owned(ctx, fields.actions.categoryId);
  for (const id of fields.actions.tagIds ?? []) await owned(ctx, id);
  for (const s of fields.actions.splits ?? []) {
    await owned(ctx, s.categoryId);
    if (!Number.isSafeInteger(s.amountCents))
      throw new ConvexError("Enter valid split amounts.");
  }
  if (
    (fields.actions.tagIds?.length ?? 0) > 30 ||
    (fields.actions.splits?.length ?? 0) > 50
  )
    throw new ConvexError("Too many rule actions.");
  if (fields.actions.splits?.length === 1)
    throw new ConvexError("A split rule needs at least two allocations.");
}
export const saveRule = userMutation({
  args: { id: v.optional(v.id("rules")), ...ruleFields },
  returns: v.id("rules"),
  handler: async (ctx, { id, ...fields }) => {
    fields.name = text(fields.name);
    await validateRule(ctx, fields);
    if (id) {
      await owned(ctx, id);
      await ctx.db.patch(id, fields);
      return id;
    }
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
      .take(200);
    if (rules.length >= 200)
      throw new ConvexError("A workspace can have up to 200 rules.");
    return await ctx.db.insert("rules", { userId: ctx.userId, ...fields });
  },
});
export const deleteRule = userMutation({
  args: { id: v.id("rules") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.delete(id);
    return null;
  },
});
export const previewRule = userQuery({
  args: { ...ruleFields, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("transactions")),
  handler: async (ctx, args) => {
    await validateRule(ctx, args);
    if (args.paginationOpts.numItems > 100)
      throw new ConvexError("Preview at most 100 transactions at a time.");
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(args.paginationOpts);
    const matching = [];
    for (const tx of rows.page)
      if (
        !tx.removedFromBank &&
        ruleSplitsFit(tx.amountCents, args.actions.splits) &&
        matchesRule(
          { ...args, enabled: true },
          tx,
          (await owned(ctx, tx.merchantId)).name,
        )
      )
        matching.push(tx);
    return { ...rows, page: matching };
  },
});
export const applyRule = userMutation({
  args: { id: v.id("rules"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    if (args.paginationOpts.numItems > 100)
      throw new ConvexError("Apply to at most 100 transactions at a time.");
    const rule = await owned(ctx, args.id);
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
      .paginate(args.paginationOpts);
    let updated = 0;
    for (const tx of rows.page) {
      if (
        tx.removedFromBank ||
        !ruleSplitsFit(tx.amountCents, rule.actions.splits) ||
        !matchesRule(rule, tx, (await owned(ctx, tx.merchantId)).name)
      )
        continue;
      const next = { ...tx, ...rule.actions };
      await validateTransaction(ctx, next);
      await ctx.db.patch(tx._id, {
        ...rule.actions,
        ...(rule.actions.splits !== undefined ? { splitDraft: undefined } : {}),
        searchText: await refreshSearch(ctx, next),
        updatedAt: Date.now(),
        editedFields: [
          ...new Set([...tx.editedFields, ...Object.keys(rule.actions)]),
        ],
      });
      await changeMerchantCount(ctx, tx.merchantId, next.merchantId);
      updated++;
    }
    return {
      updated,
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    };
  },
});
export const reorder = userMutation({
  args: {
    ids: v.array(
      v.union(v.id("groups"), v.id("categories"), v.id("tags"), v.id("rules")),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    if (ids.length > 200 || new Set(ids).size !== ids.length)
      throw new ConvexError("Invalid item order.");
    for (const [order, id] of ids.entries()) {
      await owned(ctx, id);
      await ctx.db.patch(id, { order });
    }
    return null;
  },
});
export const merchantForUpload = userQuery({
  args: { id: v.id("merchants") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    return null;
  },
});
export const storeMerchantLogo = internalMutation({
  args: {
    userId: v.id("users"),
    merchantId: v.id("merchants"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const merchant = await owned(
      { ...ctx, userId: args.userId },
      args.merchantId,
    );
    if (merchant.logoStorageId)
      await ctx.storage.delete(merchant.logoStorageId);
    await ctx.db.patch(args.merchantId, { logoStorageId: args.storageId });
    return null;
  },
});
export const uploadMerchantLogo = userAction({
  args: {
    merchantId: v.id("merchants"),
    contentType: v.string(),
    bytes: v.bytes(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(api.settings.merchantForUpload, { id: args.merchantId });
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(args.contentType) ||
      args.bytes.byteLength > 2 * 1024 * 1024 ||
      !args.bytes.byteLength
    )
      throw new ConvexError("Choose a JPEG, PNG, or WebP image up to 2 MB.");
    const storageId = await ctx.storage.store(
      new Blob([args.bytes], { type: args.contentType }),
    );
    try {
      await ctx.runMutation(internal.settings.storeMerchantLogo, {
        userId: ctx.userId,
        merchantId: args.merchantId,
        storageId,
      });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
    return null;
  },
});
