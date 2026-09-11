import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
export const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");
export function validateSplits(
  amount: number,
  splits: { amountCents: number }[],
) {
  if (splits.length === 0) return;
  if (
    splits.length < 2 ||
    splits.length > 50 ||
    splits.some((s) => !Number.isSafeInteger(s.amountCents)) ||
    splits.reduce((sum, s) => sum + s.amountCents, 0) !== amount
  )
    throw new ConvexError(
      "Split amounts must add up exactly to the transaction total.",
    );
}
export function matchesRule(
  rule: Pick<Doc<"rules">, "conditions" | "match" | "enabled">,
  tx: Pick<
    Doc<"transactions">,
    "originalName" | "amountCents" | "accountId" | "categoryId"
  >,
  merchant: string,
) {
  if (!rule.enabled || !rule.conditions.length) return false;
  const values = {
    statement: normalize(tx.originalName),
    merchant: normalize(merchant),
    amount: tx.amountCents / 100,
    account: tx.accountId,
    category: tx.categoryId,
  };
  const results = rule.conditions.map((c) => {
    const actual = values[c.field];
    if (c.field === "amount") {
      const n = Number(c.value);
      if (!Number.isFinite(n)) return false;
      return c.operator === "greater"
        ? Number(actual) > n
        : c.operator === "less"
          ? Number(actual) < n
          : Number(actual) === n;
    }
    return c.operator === "contains"
      ? normalize(String(actual)).includes(normalize(c.value))
      : normalize(String(actual)) === normalize(c.value);
  });
  return rule.match === "all" ? results.every(Boolean) : results.some(Boolean);
}
export function advanceDate(
  value: string,
  frequency: Doc<"recurring">["frequency"],
  anchorDay?: number,
): string {
  const d = new Date(value + "T12:00:00Z");
  if (frequency === "weekly" || frequency === "biweekly")
    d.setUTCDate(d.getUTCDate() + (frequency === "weekly" ? 7 : 14));
  else {
    const day = anchorDay ?? d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(
      d.getUTCMonth() + { monthly: 1, quarterly: 3, yearly: 12 }[frequency],
    );
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}
export function recurringDates(
  start: string,
  frequency: Doc<"recurring">["frequency"],
  from: string,
  to: string,
) {
  const result: string[] = [];
  let current = start;
  const anchor = Number(start.slice(8));
  for (let i = 0; i < 10000 && current <= to; i++) {
    if (current >= from) result.push(current);
    current = advanceDate(current, frequency, anchor);
  }
  return result;
}
export type Entry = {
  amountCents: number;
  categoryId: Id<"categories">;
  date: string;
  merchantId: Id<"merchants">;
  accountId: Id<"accounts">;
};
export function entries(
  tx: Pick<
    Doc<"transactions">,
    | "hidden"
    | "pending"
    | "splits"
    | "amountCents"
    | "categoryId"
    | "date"
    | "merchantId"
    | "accountId"
  >,
): Entry[] {
  if (tx.hidden || tx.pending) return [];
  return (tx.splits.length ? tx.splits : [tx]).map((s) => ({
    amountCents: s.amountCents,
    categoryId: s.categoryId,
    date: tx.date,
    merchantId: tx.merchantId,
    accountId: tx.accountId,
  }));
}
