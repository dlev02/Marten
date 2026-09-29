import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/**
 * Transactions-page filters that the list index cannot express. The page and
 * the server summary share this predicate so the filtered total always
 * describes exactly the rows on screen.
 */
export const transactionFilterFields = {
  receipts: v.optional(v.boolean()),
  categoryId: v.optional(v.id("categories")),
  tagId: v.optional(v.id("tags")),
  review: v.optional(v.union(v.literal("reviewed"), v.literal("unreviewed"))),
  visibility: v.optional(v.union(v.literal("hidden"), v.literal("visible"))),
  source: v.optional(v.string()),
  minCents: v.optional(v.number()),
  maxCents: v.optional(v.number()),
};
const transactionFilters = v.object(transactionFilterFields);
export type TransactionFilters = Infer<typeof transactionFilters>;

export function matchesTransactionFilters(
  tx: Doc<"transactions">,
  filters: TransactionFilters,
) {
  return (
    (!filters.receipts || (tx.attachmentCount ?? 0) > 0) &&
    (!filters.categoryId ||
      tx.categoryId === filters.categoryId ||
      tx.splits.some((split) => split.categoryId === filters.categoryId)) &&
    (!filters.tagId || tx.tagIds.includes(filters.tagId)) &&
    (!filters.review ||
      (filters.review === "reviewed" ? tx.reviewed : !tx.reviewed)) &&
    (!filters.visibility ||
      (filters.visibility === "hidden" ? tx.hidden : !tx.hidden)) &&
    (!filters.source || tx.source === filters.source) &&
    (filters.minCents === undefined || tx.amountCents >= filters.minCents) &&
    (filters.maxCents === undefined || tx.amountCents <= filters.maxCents)
  );
}
