import { v, ConvexError, type Infer } from "convex/values";
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
  type UserWrite,
} from "./lib/transactions";
import type { Id } from "./_generated/dataModel";
import { RULE_LIMITS } from "./lib/limits";
import {
  moveMerchantAliases,
  recordMerchantAlias,
  releaseMerchantAlias,
} from "./lib/merchantAliases";

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
export async function saveCategoryForUser(
  ctx: UserWrite,
  {
    id,
    ...fields
  }: {
    id?: Id<"categories">;
    groupId: Id<"groups">;
    name: string;
    emoji: string;
    order: number;
    enabled: boolean;
  },
) {
  await owned(ctx, fields.groupId);
  fields.name = text(fields.name);
  text(fields.emoji, 30);
  if (id) {
    await owned(ctx, id);
    await ctx.db.patch(id, fields);
    return id;
  }
  return await ctx.db.insert("categories", { userId: ctx.userId, ...fields });
}
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
  handler: saveCategoryForUser,
});
export async function saveMerchantForUser(
  ctx: UserWrite,
  { id, name, color }: { id?: Id<"merchants">; name: string; color: string },
) {
  {
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
    // This merchant now owns the name, so an old alias for it no longer applies.
    await releaseMerchantAlias(ctx, ctx.userId, normalizedName);
    if (id) {
      const before = await owned(ctx, id);
      await ctx.db.patch(id, { name, color, normalizedName });
      // Banks keep sending the old statement name; remember it so the next
      // sync lands on this merchant instead of recreating the old one.
      if (before.normalizedName !== normalizedName)
        await recordMerchantAlias(ctx, ctx.userId, before.normalizedName, id);
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
  }
}
export const saveMerchant = userMutation({
  args: {
    id: v.optional(v.id("merchants")),
    name: v.string(),
    color: v.string(),
  },
  returns: v.id("merchants"),
  handler: saveMerchantForUser,
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
/** Merchants absorbed per call; every row is rewritten, so pages stay small. */
const MERCHANT_MERGE_PAGE = 200;
/**
 * Folds one merchant into another, in pages the caller repeats until `done`:
 * transactions move first, then recurring schedules, rule actions and saved
 * reports. The source's statement names become aliases of the target so bank
 * syncs keep landing on it, and the source is deleted only once no
 * transaction still points at it.
 */
export async function mergeMerchantsForUser(
  ctx: UserWrite,
  {
    sourceId,
    targetId,
    cursor,
    pageSize = MERCHANT_MERGE_PAGE,
  }: {
    sourceId: Id<"merchants">;
    targetId: Id<"merchants">;
    cursor?: string | null;
    pageSize?: number;
  },
) {
  if (sourceId === targetId)
    throw new ConvexError("Choose two different merchants.");
  const source = await owned(ctx, sourceId);
  const target = await owned(ctx, targetId);
  const rows = await ctx.db
    .query("transactions")
    .withIndex("by_userId_and_merchantId_and_date", (q) =>
      q.eq("userId", ctx.userId).eq("merchantId", sourceId),
    )
    // An empty cursor restarts the scan (see the straggler check below).
    .paginate({ numItems: pageSize, cursor: cursor || null });
  let moved = 0;
  for (const tx of rows.page) {
    await ctx.db.patch(tx._id, {
      merchantId: targetId,
      editedFields: [...new Set([...tx.editedFields, "merchantId"])],
      searchText: await refreshSearch(ctx, { ...tx, merchantId: targetId }),
      updatedAt: Date.now(),
    });
    if (!tx.removedFromBank) moved++;
  }
  // One count update per page instead of two document writes per row.
  if (moved) {
    await ctx.db.patch(sourceId, {
      transactionCount: Math.max(0, source.transactionCount - moved),
    });
    await ctx.db.patch(targetId, {
      transactionCount: target.transactionCount + moved,
    });
  }
  if (!rows.isDone)
    return {
      done: false,
      cursor: rows.continueCursor,
      updated: rows.page.length,
    };
  // A sync during a long merge can add rows behind the cursor; start over
  // rather than delete a merchant that transactions still reference.
  const straggler = await ctx.db
    .query("transactions")
    .withIndex("by_userId_and_merchantId_and_date", (q) =>
      q.eq("userId", ctx.userId).eq("merchantId", sourceId),
    )
    .first();
  if (straggler) return { done: false, cursor: "", updated: rows.page.length };
  await moveMerchantReferences(ctx, sourceId, targetId);
  await moveMerchantAliases(ctx, sourceId, targetId);
  await recordMerchantAlias(ctx, ctx.userId, source.normalizedName, targetId);
  if (source.logoStorageId && source.logoStorageId !== target.logoStorageId)
    await ctx.storage.delete(source.logoStorageId);
  await ctx.db.delete(sourceId);
  return { done: true, cursor: rows.continueCursor, updated: rows.page.length };
}
/** Recurring schedules, rule actions and saved reports follow a merged merchant. */
async function moveMerchantReferences(
  ctx: UserWrite,
  sourceId: Id<"merchants">,
  targetId: Id<"merchants">,
) {
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
}
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
  handler: (ctx, args) => mergeMerchantsForUser(ctx, args),
});
/**
 * Folds one category into another of the same kind, in pages the caller
 * repeats until `done`: transactions and split lines move first, then rules,
 * recurring schedules and saved reports, and finally the source is removed.
 * Used to clean up duplicates after an import.
 */
export async function mergeCategoriesForUser(
  ctx: UserWrite,
  {
    sourceId,
    targetId,
    cursor,
    pageSize = 200,
  }: {
    sourceId: Id<"categories">;
    targetId: Id<"categories">;
    cursor?: string | null;
    /** Transactions scanned per call; Convex allows one paginated read per call. */
    pageSize?: number;
  },
) {
  if (sourceId === targetId)
    throw new ConvexError("Choose two different categories.");
  const source = await owned(ctx, sourceId);
  const target = await owned(ctx, targetId);
  const [sourceGroup, targetGroup] = await Promise.all([
    owned(ctx, source.groupId),
    owned(ctx, target.groupId),
  ]);
  if (sourceGroup.kind !== targetGroup.kind)
    throw new ConvexError(
      "Merge into a category of the same type (income, expense or transfer).",
    );
  // Transactions have no category index; one bounded pass over the account
  // history keeps split lines consistent as well as the main category.
  const rows = await ctx.db
    .query("transactions")
    .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
    // Rows vary in size (search text), so bound bytes as well as rows.
    .paginate({
      numItems: pageSize,
      cursor: cursor ?? null,
      maximumBytesRead: 8_000_000,
    });
  const retarget = <T extends { categoryId: Id<"categories"> }>(lines: T[]) =>
    lines.map((line) =>
      line.categoryId === sourceId ? { ...line, categoryId: targetId } : line,
    );
  let updated = 0;
  for (const tx of rows.page) {
    const mainMatches = tx.categoryId === sourceId;
    const splitMatches = tx.splits.some((s) => s.categoryId === sourceId);
    // An unsaved split draft must not resurrect the deleted category.
    const draftMatches =
      tx.splitDraft?.some((s) => s.categoryId === sourceId) ?? false;
    if (!mainMatches && !splitMatches && !draftMatches) continue;
    await ctx.db.patch(tx._id, {
      ...(mainMatches ? { categoryId: targetId } : {}),
      ...(splitMatches ? { splits: retarget(tx.splits) } : {}),
      ...(draftMatches && tx.splitDraft
        ? { splitDraft: retarget(tx.splitDraft) }
        : {}),
      updatedAt: Date.now(),
    });
    updated++;
  }
  if (rows.isDone) {
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
      .take(201);
    for (const rule of rules) {
      const actions = { ...rule.actions };
      let changed = false;
      if (actions.categoryId === sourceId) {
        actions.categoryId = targetId;
        changed = true;
      }
      if (actions.splits?.some((s) => s.categoryId === sourceId)) {
        actions.splits = actions.splits.map((s) =>
          s.categoryId === sourceId ? { ...s, categoryId: targetId } : s,
        );
        changed = true;
      }
      const conditions = rule.conditions.map((c) =>
        c.field === "category" && c.value === sourceId
          ? { ...c, value: targetId }
          : c,
      );
      if (conditions.some((c, index) => c !== rule.conditions[index]))
        changed = true;
      if (changed) await ctx.db.patch(rule._id, { actions, conditions });
    }
    const recurring = await ctx.db
      .query("recurring")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(501);
    if (recurring.length > 500)
      throw new ConvexError("Too many recurring items to merge at once.");
    for (const r of recurring)
      if (r.categoryId === sourceId)
        await ctx.db.patch(r._id, { categoryId: targetId });
    const reports = await ctx.db
      .query("savedReports")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(101);
    if (reports.length > 100)
      throw new ConvexError("Too many saved reports to merge at once.");
    for (const report of reports)
      if (report.categoryId === sourceId)
        await ctx.db.patch(report._id, { categoryId: targetId });
    await ctx.db.delete(sourceId);
  }
  return { done: rows.isDone, cursor: rows.continueCursor, updated };
}
export const mergeCategories = userMutation({
  args: {
    sourceId: v.id("categories"),
    targetId: v.id("categories"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    done: v.boolean(),
    cursor: v.string(),
    updated: v.number(),
  }),
  handler: mergeCategoriesForUser,
});
export async function saveTagForUser(
  ctx: UserWrite,
  {
    id,
    ...fields
  }: { id?: Id<"tags">; name: string; color: string; order: number },
) {
  fields.name = text(fields.name);
  fields.color = text(fields.color, 40);
  if (id) {
    await owned(ctx, id);
    await ctx.db.patch(id, fields);
    return id;
  }
  return await ctx.db.insert("tags", { userId: ctx.userId, ...fields });
}
export const saveTag = userMutation({
  args: {
    id: v.optional(v.id("tags")),
    name: v.string(),
    color: v.string(),
    order: v.number(),
  },
  returns: v.id("tags"),
  handler: saveTagForUser,
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
  if (
    !fields.conditions.length ||
    fields.conditions.length > RULE_LIMITS.conditions
  )
    throw new ConvexError(
      `Add between 1 and ${RULE_LIMITS.conditions} rule conditions.`,
    );
  for (const c of fields.conditions) {
    text(c.value, RULE_LIMITS.conditionText);
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
  if ((fields.actions.tagIds?.length ?? 0) > RULE_LIMITS.tags)
    throw new ConvexError(`A rule can add at most ${RULE_LIMITS.tags} tags.`);
  if ((fields.actions.splits?.length ?? 0) > RULE_LIMITS.splitLines)
    throw new ConvexError(
      `A split rule can have at most ${RULE_LIMITS.splitLines} lines.`,
    );
  if (fields.actions.splits?.length === 1)
    throw new ConvexError("A split rule needs at least two allocations.");
}
export type RuleInput = Infer<typeof ruleValidator>;
const ruleValidator = v.object(ruleFields);
export async function saveRuleForUser(
  ctx: UserWrite,
  { id, ...fields }: RuleInput & { id?: Id<"rules"> },
) {
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
}
export const saveRule = userMutation({
  args: { id: v.optional(v.id("rules")), ...ruleFields },
  returns: v.id("rules"),
  handler: saveRuleForUser,
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
export async function applyRuleForUser(
  ctx: UserWrite,
  args: {
    id: Id<"rules">;
    paginationOpts: { cursor: string | null; numItems: number };
  },
) {
  {
    if (args.paginationOpts.numItems > 100)
      throw new ConvexError("Apply to at most 100 transactions at a time.");
    const rule = await owned(ctx, args.id);
    // Newest first: recent imports are what a rule is usually meant to fix,
    // and a caller that stops early has still covered them.
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
      .order("desc")
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
      await ctx.db.insert("activity", {
        userId: ctx.userId,
        transactionId: tx._id,
        message: `Applied rule “${rule.name}”`,
        ...(ctx.agent
          ? {
              actor: ctx.agent.name,
              ...(ctx.agent.grantId ? { grantId: ctx.agent.grantId } : {}),
            }
          : {}),
      });
      updated++;
    }
    return {
      updated,
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    };
  }
}
export const applyRule = userMutation({
  args: { id: v.id("rules"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: applyRuleForUser,
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
/**
 * Sets the run order of every rule. The list must name each of the user's
 * rules exactly once so no two rules share a position.
 */
export async function reorderRulesForUser(ctx: UserWrite, ids: Id<"rules">[]) {
  const rules = await ctx.db
    .query("rules")
    .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
    .take(201);
  const known = new Set(rules.map((rule) => rule._id));
  if (
    ids.length !== rules.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !known.has(id))
  )
    throw new ConvexError(
      `List each of your ${rules.length} rules exactly once, in the order they should run.`,
    );
  for (const [order, id] of ids.entries())
    if (rules.find((rule) => rule._id === id)?.order !== order)
      await ctx.db.patch(id, { order });
}
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
