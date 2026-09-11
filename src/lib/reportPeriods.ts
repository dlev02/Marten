import { dateLabel, localDate, monthOffset } from "./format";

export type ReportPeriod = "monthly" | "quarterly" | "yearly";
const spans = { monthly: 1, quarterly: 3, yearly: 12 };
const counts = { monthly: 6, quarterly: 4, yearly: 3 };

export function periodDates(anchor: string, period: ReportPeriod) {
  const date = new Date(`${anchor}T12:00:00`);
  const span = spans[period];
  const month = Math.floor(date.getMonth() / span) * span;
  const from = localDate(new Date(date.getFullYear(), month, 1));
  return {
    from,
    to: localDate(new Date(date.getFullYear(), month + span, 0)),
    label:
      period === "yearly"
        ? String(date.getFullYear())
        : period === "quarterly"
          ? `Q${month / 3 + 1} ${date.getFullYear()}`
          : dateLabel(from, { month: "long", year: "numeric" }),
  };
}

export function comparisonPeriods(anchor: string, period: ReportPeriod) {
  const selected = periodDates(anchor, period);
  return Array.from({ length: counts[period] }, (_, index) => {
    const range = periodDates(
      monthOffset(selected.from, (index - counts[period] + 1) * spans[period]),
      period,
    );
    return {
      ...range,
      label:
        period === "monthly"
          ? dateLabel(range.from, { month: "short", year: "2-digit" })
          : range.label,
    };
  });
}

export function aggregatePeriods(
  months: { month: string; income: number; expense: number }[],
  periods: ReturnType<typeof comparisonPeriods>,
) {
  return periods.map((period) => {
    const values = months.filter(
      (month) =>
        month.month >= period.from.slice(0, 7) &&
        month.month <= period.to.slice(0, 7),
    );
    const income = values.reduce((sum, month) => sum + month.income, 0);
    const expense = values.reduce((sum, month) => sum + month.expense, 0);
    return { ...period, income, expense, savings: income - expense };
  });
}
