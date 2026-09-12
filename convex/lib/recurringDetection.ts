import type { Doc } from "../_generated/dataModel";
import { matchesRecurringCriteria } from "./recurring";

type Transaction = Pick<
  Doc<"transactions">,
  | "_id"
  | "merchantId"
  | "accountId"
  | "categoryId"
  | "amountCents"
  | "date"
  | "originalName"
  | "hidden"
  | "pending"
  | "removedFromBank"
>;
type Schedule = Pick<
  Doc<"recurring">,
  | "merchantId"
  | "accountId"
  | "amountCents"
  | "amountToleranceCents"
  | "statementContains"
>;
type Frequency = Doc<"recurring">["frequency"];
export const RECURRING_PROPOSAL_LIMIT = 100;
export type RecurringProposal = Omit<
  Doc<"recurring">,
  "_id" | "_creationTime" | "userId"
> & {
  confidence: "high" | "medium";
  occurrences: number;
  firstDate: string;
  lastDate: string;
};
const cadences: { frequency: Frequency; tolerance: number; minimum: number }[] =
  [
    { frequency: "weekly", tolerance: 2, minimum: 3 },
    { frequency: "biweekly", tolerance: 3, minimum: 3 },
    { frequency: "monthly", tolerance: 4, minimum: 3 },
    { frequency: "quarterly", tolerance: 7, minimum: 3 },
    { frequency: "yearly", tolerance: 14, minimum: 2 },
  ];
const daysBetween = (a: string, b: string) =>
  (Date.parse(a) - Date.parse(b)) / 86400000;

/** Always step from the original anchor: month ends and leap years do not drift. */
function shiftPeriod(
  anchor: string,
  frequency: Frequency,
  periods: number,
  anchorDay?: number,
) {
  const date = new Date(`${anchor}T12:00:00Z`);
  if (frequency === "weekly" || frequency === "biweekly") {
    date.setUTCDate(
      date.getUTCDate() + periods * (frequency === "weekly" ? 7 : 14),
    );
  } else {
    const day = anchorDay ?? date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(
      date.getUTCMonth() +
        periods * { monthly: 1, quarterly: 3, yearly: 12 }[frequency],
    );
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date.toISOString().slice(0, 10);
}

function pattern(rows: Transaction[], today: string) {
  if (rows.length < 2) return null;
  let best: {
    rows: Transaction[];
    frequency: Frequency;
    nextDate: string;
    coverage: number;
  } | null = null;
  const stamps = rows.map((row) => Date.parse(row.date) / 86400000);
  // Recent anchors let a regular subscription coexist with occasional purchases
  // from the same merchant, without an unbounded pairwise search.
  for (const [anchorIndex, anchor] of rows.slice(0, 12).entries()) {
    for (const cadence of cadences) {
      if (shiftPeriod(anchor.date, cadence.frequency, 2) < today) continue;
      const matches = [anchor];
      let previousDate = anchor.date;
      let cursor = anchorIndex + 1;
      let missing = 0;
      let slots = 1;
      for (let period = -1; period >= -120; period--) {
        const expected = shiftPeriod(anchor.date, cadence.frequency, period);
        if (
          expected < rows[rows.length - 1].date &&
          daysBetween(rows[rows.length - 1].date, expected) > cadence.tolerance
        )
          break;
        const expectedDay = Date.parse(expected) / 86400000;
        while (
          cursor < rows.length &&
          (rows[cursor].date >= previousDate ||
            stamps[cursor] > expectedDay + cadence.tolerance)
        )
          cursor++;
        let closest = -1;
        for (
          let i = cursor;
          i < rows.length && stamps[i] >= expectedDay - cadence.tolerance;
          i++
        ) {
          if (
            closest < 0 ||
            Math.abs(stamps[i] - expectedDay) <
              Math.abs(stamps[closest] - expectedDay)
          )
            closest = i;
        }
        const candidate = closest >= 0 ? rows[closest] : undefined;
        slots++;
        if (!candidate) {
          if (++missing > 1) break;
          continue;
        }
        matches.push(candidate);
        previousDate = candidate.date;
        cursor = closest + 1;
      }
      // A trailing failed slot is not a missing payment within the observed span.
      const coverage = matches.length / Math.max(matches.length, slots - 1);
      if (matches.length < cadence.minimum || coverage < 0.7) continue;
      const withinSpan = rows.filter(
        (row) =>
          row.date >= matches[matches.length - 1].date &&
          row.date <= anchor.date,
      );
      if (matches.length / withinSpan.length < 0.7) continue;
      const days = matches
        .map((row) => Number(row.date.slice(8)))
        .sort((a, b) => a - b);
      const anchorDay = days[Math.floor(days.length / 2)];
      let nextDate = shiftPeriod(anchor.date, cadence.frequency, 1, anchorDay);
      for (let i = 2; nextDate < today && i <= 3; i++)
        nextDate = shiftPeriod(anchor.date, cadence.frequency, i, anchorDay);
      if (
        !best ||
        matches.length > best.rows.length ||
        (matches.length === best.rows.length && coverage > best.coverage)
      )
        best = {
          rows: matches,
          frequency: cadence.frequency,
          nextDate,
          coverage,
        };
    }
  }
  return best;
}

/** Deterministic evidence, not an automatic subscription or payment decision. */
export function detectRecurringPatterns(
  transactions: Transaction[],
  current: Schedule[],
  today: string,
) {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (
      tx.hidden ||
      tx.pending ||
      tx.removedFromBank ||
      tx.amountCents === 0 ||
      tx.date > today
    )
      continue;
    if (current.some((schedule) => matchesRecurringCriteria(schedule, tx)))
      continue;
    const key = `${tx.merchantId}:${tx.accountId}:${Math.sign(tx.amountCents)}`;
    const rows = groups.get(key) ?? [];
    rows.push(tx);
    groups.set(key, rows);
  }
  const proposals: RecurringProposal[] = [];
  for (const group of groups.values()) {
    const rows = [...group].sort((a, b) => b.date.localeCompare(a.date));
    const amountCounts = new Map<number, number>();
    for (const row of rows)
      amountCounts.set(
        row.amountCents,
        (amountCounts.get(row.amountCents) ?? 0) + 1,
      );
    const seeds = [...amountCounts.keys()].sort(
      (a, b) => amountCounts.get(b)! - amountCounts.get(a)!,
    );
    const examinedAmounts = new Set<number>();
    for (const amount of seeds) {
      if (examinedAmounts.has(amount)) continue;
      const similar = rows.filter(
        (row) =>
          Math.abs(row.amountCents - amount) <=
            Math.max(100, Math.abs(amount) * 0.08) &&
          !proposals.some((proposal) =>
            matchesRecurringCriteria(proposal, row),
          ),
      );
      if (similar.length < 2) continue;
      // A small variation can be one subscription, but two simultaneous $5/$6
      // subscriptions must not crowd each other out of the cadence test.
      const found =
        pattern(similar, today) ??
        pattern(
          similar.filter((row) => row.amountCents === amount),
          today,
        );
      if (!found) {
        examinedAmounts.add(amount);
        continue;
      }
      for (const row of found.rows) examinedAmounts.add(row.amountCents);
      const latest = found.rows[0];
      proposals.push({
        merchantId: latest.merchantId,
        accountId: latest.accountId,
        categoryId: latest.categoryId,
        amountCents: latest.amountCents,
        amountToleranceCents: Math.max(
          ...found.rows.map((row) =>
            Math.abs(row.amountCents - latest.amountCents),
          ),
        ),
        frequency: found.frequency,
        nextDate: found.nextDate,
        active: true,
        source: "detected",
        note: "Suggested from transaction history. Confirm the amount and schedule.",
        confidence:
          (found.rows.length >= 5 ||
            (found.frequency === "yearly" && found.rows.length >= 3)) &&
          found.coverage >= 0.85
            ? "high"
            : "medium",
        occurrences: found.rows.length,
        firstDate: found.rows[found.rows.length - 1].date,
        lastDate: latest.date,
      });
      if (proposals.length >= RECURRING_PROPOSAL_LIMIT) return proposals;
    }
  }
  return proposals;
}
