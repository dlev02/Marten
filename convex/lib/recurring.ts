import type { Doc } from "../_generated/dataModel";
import { normalize, recurringDates } from "./finance";

type Criteria = Pick<
  Doc<"recurring">,
  | "merchantId"
  | "accountId"
  | "amountCents"
  | "amountToleranceCents"
  | "statementContains"
>;
type Transaction = Pick<
  Doc<"transactions">,
  "merchantId" | "accountId" | "amountCents" | "originalName"
>;

/** A merchant may contain unrelated purchases and several different subscriptions. */
export function matchesRecurringCriteria(schedule: Criteria, tx: Transaction) {
  return (
    schedule.merchantId === tx.merchantId &&
    schedule.accountId === tx.accountId &&
    Math.sign(schedule.amountCents) === Math.sign(tx.amountCents) &&
    Math.abs(schedule.amountCents - tx.amountCents) <=
      (schedule.amountToleranceCents ?? 0) &&
    (!schedule.statementContains ||
      normalize(tx.originalName).includes(
        normalize(schedule.statementContains),
      ))
  );
}

/** A match is a candidate association, not evidence that an occurrence was paid.
 * A small posting window accommodates weekends; identical charges inside that
 * window need a distinctive statement filter or explicit human review.
 */
export function matchesRecurringSchedule(
  schedule: Criteria &
    Pick<Doc<"recurring">, "active" | "frequency" | "nextDate">,
  tx: Transaction &
    Pick<
      Doc<"transactions">,
      "date" | "hidden" | "pending" | "removedFromBank"
    >,
) {
  if (
    !schedule.active ||
    tx.hidden ||
    tx.pending ||
    tx.removedFromBank ||
    !matchesRecurringCriteria(schedule, tx)
  )
    return false;
  const date = new Date(tx.date + "T12:00:00Z");
  const from = new Date(date);
  from.setUTCDate(from.getUTCDate() - 3);
  const to = new Date(date);
  to.setUTCDate(to.getUTCDate() + 3);
  return (
    recurringDates(
      schedule.nextDate,
      schedule.frequency,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
    ).length > 0
  );
}

export const recurringName = (
  schedule: { name?: string },
  merchantName?: string,
) => schedule.name?.trim() || merchantName || "Recurring";
