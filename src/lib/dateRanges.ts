import {
  dateLabel,
  localDate,
  monthEnd,
  monthOffset,
  monthStart,
} from "./format";

export type DatePreset = { label: string; from: string; to: string };

export function transactionDatePresets(now = new Date()): DatePreset[] {
  const today = localDate(now);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  return [
    { label: "All time", from: "", to: "" },
    { label: "This month", from: monthStart(now), to: today },
    {
      label: "Last month",
      from: monthStart(previousMonth),
      to: monthEnd(previousMonth),
    },
    {
      label: "Last 30 days",
      from: localDate(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 12),
      ),
      to: today,
    },
    { label: "This year", from: `${now.getFullYear()}-01-01`, to: today },
  ];
}

/** Reports need a closed range, so every preset ends on a month boundary. */
export function reportDatePresets(now = new Date()): DatePreset[] {
  const start = monthStart(now),
    end = monthEnd(now);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  return [
    { label: "This month", from: start, to: end },
    { label: "Last month", from: monthStart(previous), to: monthEnd(previous) },
    { label: "Last 3 months", from: monthOffset(start, -2), to: end },
    { label: "Last 6 months", from: monthOffset(start, -5), to: end },
    { label: "Year to date", from: `${now.getFullYear()}-01-01`, to: end },
    { label: "Last 12 months", from: monthOffset(start, -11), to: end },
  ];
}

export function dateRangeLabel(
  from: string,
  to: string,
  presets: DatePreset[],
  emptyLabel = "Date",
) {
  if (!from && !to) return emptyLabel;
  const preset = presets.find((item) => item.from === from && item.to === to);
  if (preset) return preset.label;
  const label = (date: string) =>
    dateLabel(date, { month: "short", day: "numeric", year: "numeric" });
  return from && to
    ? `${label(from)} – ${label(to)}`
    : from
      ? `Since ${label(from)}`
      : `Through ${label(to)}`;
}

export function transactionRangeLabel(from: string, to: string) {
  return dateRangeLabel(from, to, transactionDatePresets());
}
