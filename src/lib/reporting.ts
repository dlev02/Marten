import type { Doc } from "../../convex/_generated/dataModel";
import type { Metadata } from "./types";
import { entries } from "../../convex/lib/finance";
import { chartColors } from "./constants";
export function summarize(
  transactions: Doc<"transactions">[],
  data: Metadata,
  groupBy: string = "category",
  categoryId?: string,
) {
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      emoji: string;
      value: number;
      count: number;
      color: string;
    }
  >();
  let income = 0,
    expense = 0;
  const months = new Map<
    string,
    {
      month: string;
      label: string;
      income: number;
      expense: number;
      savings: number;
    }
  >();
  for (const tx of transactions) {
    if (tx.removedFromBank) continue;
    for (const entry of entries(tx)) {
      if (categoryId && entry.categoryId !== categoryId) continue;
      const category = data.categories.find((c) => c._id === entry.categoryId),
        categoryGroup = data.groups.find((g) => g._id === category?.groupId);
      if (!categoryGroup || categoryGroup.kind === "transfer") continue;
      const month = entry.date.slice(0, 7),
        monthData = months.get(month) ?? {
          month,
          label: new Date(month + "-01T12:00:00").toLocaleDateString("en-US", {
            month: "short",
          }),
          income: 0,
          expense: 0,
          savings: 0,
        };
      if (categoryGroup.kind === "income") {
        income -= entry.amountCents;
        monthData.income -= entry.amountCents;
      } else {
        expense += entry.amountCents;
        monthData.expense += entry.amountCents;
      }
      monthData.savings = monthData.income - monthData.expense;
      months.set(month, monthData);
      const merchant = data.merchants.find((m) => m._id === entry.merchantId);
      const id =
        groupBy === "merchant"
          ? entry.merchantId
          : groupBy === "group"
            ? categoryGroup._id
            : entry.categoryId;
      const name =
        groupBy === "merchant"
          ? (merchant?.name ?? "Unknown merchant")
          : groupBy === "group"
            ? categoryGroup.name
            : (category?.name ?? "Uncategorized");
      const key = `${categoryGroup.kind}:${id}`,
        previous = groups.get(key);
      groups.set(key, {
        id: key,
        name,
        emoji: groupBy === "merchant" ? "" : (category?.emoji ?? ""),
        value:
          (previous?.value ?? 0) +
          (categoryGroup.kind === "income"
            ? -entry.amountCents
            : entry.amountCents),
        count: (previous?.count ?? 0) + 1,
        color:
          previous?.color ??
          `var(--report-chart-${(groups.size % chartColors.length) + 1}, ${chartColors[groups.size % chartColors.length]})`,
      });
    }
  }
  return {
    income,
    expense,
    savings: income - expense,
    rate: income > 0 ? ((income - expense) / income) * 100 : 0,
    spending: [...groups.values()]
      .filter((g) => g.id.startsWith("expense:"))
      .sort((a, b) => b.value - a.value),
    earnings: [...groups.values()]
      .filter((g) => g.id.startsWith("income:"))
      .sort((a, b) => b.value - a.value),
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v),
  };
}

export type ReportKind = "cashflow" | "spending" | "income";
export type ReportChart = "bar" | "donut" | "treemap" | "sankey";
/** Chart types offered per report, in the order the in-panel switcher shows them. */
export const reportCharts: Record<ReportKind, ReportChart[]> = {
  cashflow: ["bar", "donut", "treemap", "sankey"],
  spending: ["bar", "donut", "treemap"],
  income: ["bar", "donut", "treemap"],
};
/**
 * Saved reports persist the chart as free text. Older reports stored "pie";
 * anything unsupported for the report (unknown values, a sankey on a spending
 * report) falls back to trend bars so a saved link always opens.
 */
export function normalizeReportChart(
  value: string | undefined,
  report: ReportKind,
): ReportChart {
  const chart = value === "pie" ? "donut" : value;
  return reportCharts[report].includes(chart as ReportChart)
    ? (chart as ReportChart)
    : "bar";
}
