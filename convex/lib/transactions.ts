import { ConvexError, type Infer } from "convex/values";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { transactionFields } from "../validators";
import { owned, cents, date, text } from "./access";
import { matchesRule, normalize, validateSplits } from "./finance";

export type TransactionFields = Infer<ReturnType<typeof transactionValidator>>;
function transactionValidator() {
  return v.object(transactionFields);
}
export type UserRead = QueryCtx & { userId: Id<"users"> };
export type UserWrite = MutationCtx & { userId: Id<"users"> };
export type RuleContext = {
  rules: Doc<"rules">[];
  merchantNames: Map<Id<"merchants">, string>;
};
export async function loadRuleContext(ctx: UserRead): Promise<RuleContext> {
  const rules = await ctx.db
    .query("rules")
    .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
    .take(201);
  if (rules.length > 200)
    throw new ConvexError("This workspace has too many rules.");
  return { rules, merchantNames: new Map() };
}
export function ruleSplitsFit(
  amountCents: number,
  splits?: { amountCents: number }[],
) {
  return (
    !splits?.length ||
    splits.reduce((total, split) => total + split.amountCents, 0) ===
      amountCents
  );
}
export async function validateTransaction(
  ctx: UserRead,
  fields: TransactionFields,
) {
  cents(fields.amountCents);
  date(fields.date);
  text(fields.originalName, 500);
  if (fields.notes.length > 10000 || fields.tagIds.length > 30)
    throw new ConvexError("Notes or tags exceed the allowed size.");
  validateSplits(fields.amountCents, fields.splits);
  await Promise.all([
    owned(ctx, fields.accountId),
    owned(ctx, fields.merchantId),
    owned(ctx, fields.categoryId),
    ...fields.tagIds.map((id) => owned(ctx, id)),
    ...fields.splits.map((s) => owned(ctx, s.categoryId)),
  ]);
}
export async function refreshSearch(ctx: UserRead, tx: TransactionFields) {
  const merchant = await owned(ctx, tx.merchantId);
  return normalize(`${merchant.name} ${tx.originalName} ${tx.notes}`).slice(
    0,
    12000,
  );
}
export async function changeMerchantCount(
  ctx: MutationCtx,
  oldId: Id<"merchants"> | null,
  newId: Id<"merchants"> | null,
) {
  if (oldId === newId) return;
  for (const [id, delta] of [
    [oldId, -1],
    [newId, 1],
  ] as const) {
    if (!id) continue;
    const merchant = await ctx.db.get(id);
    if (merchant)
      await ctx.db.patch(id, {
        transactionCount: Math.max(0, merchant.transactionCount + delta),
      });
  }
}
export async function applyRules(
  ctx: UserRead,
  fields: TransactionFields,
  editedFields: string[] = [],
  ruleContext?: RuleContext,
): Promise<TransactionFields> {
  const context = ruleContext ?? (await loadRuleContext(ctx));
  let result = { ...fields };
  for (const rule of context.rules) {
    if (!rule.enabled) continue;
    let merchantName = context.merchantNames.get(result.merchantId);
    if (merchantName === undefined) {
      merchantName = (await owned(ctx, result.merchantId)).name;
      context.merchantNames.set(result.merchantId, merchantName);
    }
    if (
      !matchesRule(rule, result, merchantName) ||
      !ruleSplitsFit(result.amountCents, rule.actions.splits)
    )
      continue;
    const allowed = Object.fromEntries(
      Object.entries(rule.actions).filter(
        ([key]) => !editedFields.includes(key),
      ),
    );
    result = { ...result, ...allowed };
    // A fixed split rule only applies to transactions with the same total.
    if (
      result.splits.length &&
      result.splits.reduce((n, s) => n + s.amountCents, 0) !==
        result.amountCents
    )
      result.splits = fields.splits;
  }
  await validateTransaction(ctx, result);
  return result;
}
export async function insertTransaction(
  ctx: UserWrite,
  fields: TransactionFields,
  source: "manual" | "csv" | "sample",
  importKey?: string,
  ruleContext?: RuleContext,
) {
  await validateTransaction(ctx, fields);
  const applied = await applyRules(ctx, fields, [], ruleContext);
  const id = await ctx.db.insert("transactions", {
    ...applied,
    userId: ctx.userId,
    source,
    updatedAt: Date.now(),
    editedFields: [],
    searchText: await refreshSearch(ctx, applied),
    ...(importKey ? { importKey } : {}),
  });
  await changeMerchantCount(ctx, null, applied.merchantId);
  return id;
}
