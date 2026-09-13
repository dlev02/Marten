import { v } from "convex/values";
const breakdownChart = v.union(
  v.literal("bar"),
  v.literal("donut"),
  v.literal("treemap"),
);
export const chartDefaults = v.object({
  spending: breakdownChart,
  income: breakdownChart,
  cashflow: v.union(breakdownChart, v.literal("sankey")),
});
export const defaultCharts = {
  spending: "bar",
  income: "bar",
  cashflow: "sankey",
} as const;
