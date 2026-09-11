import type { Doc } from "../../../convex/_generated/dataModel";
import { recurringDates } from "../../../convex/lib/finance";

export type RunwayHorizon = 30 | 90 | 365;
export type RunwayAccount = Pick<
  Doc<"accounts">,
  "_id" | "name" | "kind" | "closed" | "currency" | "balanceCents"
>;
export type RunwaySchedule = Pick<
  Doc<"recurring">,
  | "_id"
  | "accountId"
  | "merchantId"
  | "active"
  | "amountCents"
  | "frequency"
  | "nextDate"
  | "name"
>;
export type RunwayPayment = Pick<
  Doc<"recurringPayments">,
  "recurringId" | "date" | "paid"
>;

/** Calendar-day arithmetic stays stable through daylight-saving changes. */
export function runwayDate(date: string, offset: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    !Number.isInteger(offset)
  ) {
    throw new Error("Choose a valid forecast date.");
  }
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function exactCents(value: number) {
  if (!Number.isSafeInteger(value))
    throw new Error("The cash forecast is outside the supported amount range.");
  return value;
}

export function cashRunway({
  asOf,
  days,
  accounts,
  schedules,
  payments,
  accountId,
  dailySpendingCents = 0,
  currency = "USD",
}: {
  asOf: string;
  days: RunwayHorizon;
  accounts: RunwayAccount[];
  schedules: RunwaySchedule[];
  payments: RunwayPayment[];
  accountId?: string;
  dailySpendingCents?: number;
  currency?: string;
}) {
  if (![30, 90, 365].includes(days))
    throw new Error("Choose a 30, 90, or 365 day forecast.");
  exactCents(dailySpendingCents);
  if (dailySpendingCents < 0)
    throw new Error("Daily spending cannot be negative.");
  const from = runwayDate(asOf, 1);
  const to = runwayDate(asOf, days);
  const cashAccounts = accounts.filter(
    (account) =>
      account.kind === "cash" &&
      !account.closed &&
      account.currency === currency,
  );
  const includedAccounts = cashAccounts.filter(
    (account) => !accountId || account._id === accountId,
  );
  const includedIds = new Set(includedAccounts.map((account) => account._id));
  const eligibleIds = new Set(cashAccounts.map((account) => account._id));
  const startingCents = includedAccounts.reduce(
    (total, account) => exactCents(total + exactCents(account.balanceCents)),
    0,
  );
  const paid = new Set(
    payments
      .filter((payment) => payment.paid)
      .map((payment) => `${payment.recurringId}:${payment.date}`),
  );
  const excludedSchedules = schedules.filter(
    (schedule) => schedule.active && !eligibleIds.has(schedule.accountId),
  );
  const events = schedules
    .filter(
      (schedule) => schedule.active && includedIds.has(schedule.accountId),
    )
    .flatMap((schedule) => {
      exactCents(schedule.amountCents);
      return recurringDates(schedule.nextDate, schedule.frequency, from, to)
        .filter((date) => !paid.has(`${schedule._id}:${date}`))
        .map((date) => ({
          id: `${schedule._id}:${date}`,
          date,
          scheduleId: schedule._id,
          merchantId: schedule.merchantId,
          accountId: schedule.accountId,
          amountCents: schedule.amountCents,
          name: schedule.name,
        }));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const byDate = new Map<string, number>();
  for (const event of events)
    byDate.set(
      event.date,
      exactCents((byDate.get(event.date) ?? 0) - event.amountCents),
    );

  const points = [
    { date: asOf, balanceCents: startingCents, scheduledCents: 0 },
  ];
  let balanceCents = startingCents;
  for (let day = 1; day <= days; day++) {
    const date = runwayDate(asOf, day);
    const scheduledCents = byDate.get(date) ?? 0;
    balanceCents = exactCents(
      exactCents(balanceCents + scheduledCents) - dailySpendingCents,
    );
    points.push({ date, balanceCents, scheduledCents });
  }
  // These are closing balances; no intraday payment order is implied.
  const minimum = points.reduce((lowest, point) =>
    point.balanceCents < lowest.balanceCents ? point : lowest,
  );
  const firstShortfall = points.find((point) => point.balanceCents < 0) ?? null;
  return {
    from,
    to,
    startingCents,
    endingCents: balanceCents,
    minimum,
    firstShortfall,
    points,
    events,
    includedAccounts,
    excludedSchedules,
    otherCurrencyAccounts: accounts.filter(
      (account) =>
        account.kind === "cash" &&
        !account.closed &&
        account.currency !== currency,
    ),
    variableSpendingCents: exactCents(dailySpendingCents * days),
  };
}
