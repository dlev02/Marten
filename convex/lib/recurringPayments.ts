import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { UserRead } from "./access";
import { recurringDates } from "./finance";
import { matchesRecurringCriteria } from "./recurring";

export type PaymentStatus = {
  recurringId: Id<"recurring">;
  date: string;
  paid: boolean;
};
const shift = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);

/** Require a one-to-one match in both directions, including across range edges. */
export function automaticRecurringPayments(
  schedules: Doc<"recurring">[],
  transactions: Doc<"transactions">[],
  from: string,
  to: string,
) {
  const byMerchant = new Map<string, Doc<"transactions">[]>();
  for (const tx of transactions) {
    if (tx.pending || tx.hidden || tx.removedFromBank) continue;
    const key = `${tx.accountId}:${tx.merchantId}`;
    const rows = byMerchant.get(key) ?? [];
    rows.push(tx);
    byMerchant.set(key, rows);
  }
  const occurrences: {
    recurringId: Id<"recurring">;
    date: string;
    candidates: Doc<"transactions">[];
  }[] = [];
  const uses = new Map<Id<"transactions">, number>();
  for (const schedule of schedules) {
    if (!schedule.active) continue;
    const candidates = (
      byMerchant.get(`${schedule.accountId}:${schedule.merchantId}`) ?? []
    ).filter((tx) => matchesRecurringCriteria(schedule, tx));
    for (const date of recurringDates(
      schedule.nextDate,
      schedule.frequency,
      shift(from, -6),
      shift(to, 6),
    )) {
      const start = shift(date, -3),
        end = shift(date, 3);
      const matching = candidates.filter(
        (tx) => tx.date >= start && tx.date <= end,
      );
      for (const tx of matching) uses.set(tx._id, (uses.get(tx._id) ?? 0) + 1);
      occurrences.push({
        recurringId: schedule._id,
        date,
        candidates: matching,
      });
    }
  }
  return occurrences
    .filter(
      (row) =>
        row.date >= from &&
        row.date <= to &&
        row.candidates.length === 1 &&
        uses.get(row.candidates[0]._id) === 1,
    )
    .map((row) => ({
      recurringId: row.recurringId,
      date: row.date,
      paid: true,
      transactionId: row.candidates[0]._id,
    }));
}

/** Live derivation also reverses a match after a bank correction, removal or user edit. */
export async function automaticPaymentsForUser(
  ctx: UserRead,
  from: string,
  to: string,
) {
  const schedules = await ctx.db
    .query("recurring")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(501);
  if (schedules.length > 500)
    throw new ConvexError("Use up to 500 recurring schedules.");
  if (!schedules.some((schedule) => schedule.active)) return [];
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_userId_and_date", (q) =>
      q
        .eq("userId", ctx.userId)
        .gte("date", shift(from, -9))
        .lte("date", shift(to, 9)),
    )
    .take(12001);
  if (transactions.length > 12000)
    throw new ConvexError(
      "Choose a shorter period to match recurring payments. This range has more than 12,000 transactions.",
    );
  return automaticRecurringPayments(schedules, transactions, from, to);
}

/** Explicit paid and unpaid choices always override inferred payment status. */
export function mergePaymentStatus<T extends PaymentStatus>(
  automatic: T[],
  manual: PaymentStatus[],
): PaymentStatus[] {
  const statuses = new Map(
    automatic.map((row) => [
      `${row.recurringId}:${row.date}`,
      row as PaymentStatus,
    ]),
  );
  for (const row of manual) statuses.set(`${row.recurringId}:${row.date}`, row);
  return [...statuses.values()];
}
