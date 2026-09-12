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
  editedFields: string[] = [],
) {
  await validateTransaction(ctx, fields);
  const applied = await applyRules(ctx, fields, editedFields, ruleContext);
  const id = await ctx.db.insert("transactions", {
    ...applied,
    userId: ctx.userId,
    source,
    updatedAt: Date.now(),
    editedFields,
    searchText: await refreshSearch(ctx, applied),
    ...(importKey ? { importKey } : {}),
  });
  await changeMerchantCount(ctx, null, applied.merchantId);
  return id;
}
/** How far apart a bank's posted date and a spreadsheet's date may be for the same purchase. */
export const MATCH_WINDOW_DAYS = 3;
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
/**
 * Finds the transaction on one account that most plausibly is the same
 * purchase as an incoming row: identical amount, dated within the match
 * window, nearest date first, then a matching statement description. The
 * caller's `accept` filter keeps provider rows and spreadsheet rows from
 * pairing with their own kind, so a bank sync can adopt a spreadsheet row and
 * a spreadsheet import can enrich a synced row without creating a duplicate.
 */
export async function findMatchingTransaction(
  ctx: UserRead,
  target: {
    accountId: Id<"accounts">;
    date: string;
    amountCents: number;
    originalName?: string;
  },
  accept: (transaction: Doc<"transactions">) => boolean,
) {
  const from = shiftDate(target.date, -MATCH_WINDOW_DAYS),
    to = shiftDate(target.date, MATCH_WINDOW_DAYS);
  const nearby = await ctx.db
    .query("transactions")
    .withIndex("by_userId_and_accountId_and_date", (q) =>
      q
        .eq("userId", ctx.userId)
        .eq("accountId", target.accountId)
        .gte("date", from)
        .lte("date", to),
    )
    .take(500);
  const wanted = normalize(target.originalName ?? "");
  let best: { row: Doc<"transactions">; score: number } | null = null;
  for (const row of nearby) {
    if (row.amountCents !== target.amountCents || !accept(row)) continue;
    const distance = Math.abs(
      (Date.parse(row.date) - Date.parse(target.date)) / 86400000,
    );
    const score =
      distance * 2 + (wanted && normalize(row.originalName) === wanted ? 0 : 1);
    if (!best || score < best.score) best = { row, score };
  }
  return best?.row ?? null;
}
/** Adds new tag ids to a transaction's list without repeating any. */
export function unionTags(current: Id<"tags">[], added: Id<"tags">[]) {
  return [...current, ...added.filter((id) => !current.includes(id))];
}
