import { dateLabel, localDate, monthEnd, monthStart } from "./format";

export function transactionDatePresets(now = new Date()) {
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

export function transactionRangeLabel(from: string, to: string) {
  if (!from && !to) return "Date";
  const preset = transactionDatePresets().find(
    (item) => item.from === from && item.to === to,
  );
  if (preset) return preset.label;
  const label = (date: string) =>
    dateLabel(date, { month: "short", day: "numeric", year: "numeric" });
  return from && to
    ? `${label(from)} – ${label(to)}`
    : from
      ? `Since ${label(from)}`
      : `Through ${label(to)}`;
}
