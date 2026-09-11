import type { Doc } from "../_generated/dataModel";
import { recurringDates } from "./finance";

export const defaultReminderPreferences = {
  daysBefore: 3,
  timeMinutes: 9 * 60,
  timeZone: "America/Chicago",
};
export type ReminderTiming = typeof defaultReminderPreferences;
export type DueReminder = { occurrenceKey: string; dueDate: string };

export function validReminderTiming(value: ReminderTiming) {
  if (
    ![0, 1, 3, 7].includes(value.daysBefore) ||
    !Number.isInteger(value.timeMinutes) ||
    value.timeMinutes < 0 ||
    value.timeMinutes >= 1440
  )
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone }).format(0);
    return value.timeZone.length <= 100;
  } catch {
    return false;
  }
}

export function localReminderTime(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}
export function addCalendarDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** A missed lead-day check may catch up through the due date, never after it. */
export function dueReminders({
  schedules,
  accounts,
  paid,
  timing,
  now,
}: {
  schedules: Doc<"recurring">[];
  accounts: Doc<"accounts">[];
  paid: Set<string>;
  timing: ReminderTiming;
  now: number;
}): DueReminder[] {
  const local = localReminderTime(now, timing.timeZone);
  if (local.minutes < timing.timeMinutes) return [];
  const through = addCalendarDays(local.date, timing.daysBefore);
  const openAccounts = new Map(
    accounts
      .filter((account) => !account.closed)
      .map((account) => [account._id, account]),
  );
  const result: DueReminder[] = [];
  for (const schedule of schedules) {
    if (
      !schedule.active ||
      schedule.amountCents <= 0 ||
      !openAccounts.has(schedule.accountId)
    )
      continue;
    for (const date of recurringDates(
      schedule.nextDate,
      schedule.frequency,
      local.date,
      through,
    )) {
      if (paid.has(`${schedule._id}:${date}`)) continue;
      result.push({
        occurrenceKey: `recurring:${schedule._id}:${date}`,
        dueDate: date,
      });
    }
  }
  for (const account of openAccounts.values()) {
    if (account.kind !== "credit" && account.kind !== "loan") continue;
    const statement = account.statementReminder ?? account;
    const date = statement.dueDate;
    if (
      !date ||
      date < local.date ||
      date > through ||
      account.statementPaidDate === date ||
      (statement.statementCents !== undefined && statement.statementCents <= 0)
    )
      continue;
    result.push({
      occurrenceKey: `statement:${account._id}:${date}`,
      dueDate: date,
    });
  }
  return result.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.occurrenceKey.localeCompare(b.occurrenceKey),
  );
}
