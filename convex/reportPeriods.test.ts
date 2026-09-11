import { describe, expect, test } from "vitest";
import {
  aggregatePeriods,
  comparisonPeriods,
  periodDates,
} from "../src/lib/reportPeriods";

describe("cash flow comparison periods", () => {
  test("includes six distinct months across a year boundary and zero-fills gaps", () => {
    const periods = comparisonPeriods("2026-02-10", "monthly");
    expect(periods.map((period) => period.from)).toEqual([
      "2025-09-01",
      "2025-10-01",
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
    const result = aggregatePeriods(
      [{ month: "2026-01", income: 10000, expense: -1500 }],
      periods,
    );
    expect(result[0]).toMatchObject({ income: 0, expense: 0, savings: 0 });
    expect(result[4]).toMatchObject({
      income: 10000,
      expense: -1500,
      savings: 11500,
    });
    expect(result[5].to).toBe("2026-02-28");
  });

  test("combines signed income reversals and refunds into calendar quarters", () => {
    const periods = comparisonPeriods("2026-05-15", "quarterly");
    expect(periods.map((period) => period.label)).toEqual([
      "Q3 2025",
      "Q4 2025",
      "Q1 2026",
      "Q2 2026",
    ]);
    const result = aggregatePeriods(
      [
        { month: "2026-01", income: 100000, expense: 10000 },
        { month: "2026-02", income: -5000, expense: -1000 },
        { month: "2026-03", income: 0, expense: 20000 },
        { month: "2026-04", income: 50000, expense: 25000 },
        { month: "2026-07", income: 900000, expense: 900000 },
      ],
      periods,
    );
    expect(result[2]).toMatchObject({
      from: "2026-01-01",
      to: "2026-03-31",
      income: 95000,
      expense: 29000,
      savings: 66000,
    });
    expect(result[3]).toMatchObject({
      income: 50000,
      expense: 25000,
      savings: 25000,
    });
  });

  test("keeps three calendar years separate and includes leap-day boundaries", () => {
    const periods = comparisonPeriods("2026-09-10", "yearly");
    const result = aggregatePeriods(
      [
        { month: "2023-12", income: 999, expense: 999 },
        { month: "2024-02", income: 5000, expense: 1000 },
        { month: "2024-12", income: -1000, expense: -250 },
        { month: "2026-01", income: 10000, expense: 15000 },
      ],
      periods,
    );
    expect(
      result.map(({ label, income, expense, savings }) => ({
        label,
        income,
        expense,
        savings,
      })),
    ).toEqual([
      { label: "2024", income: 4000, expense: 750, savings: 3250 },
      { label: "2025", income: 0, expense: 0, savings: 0 },
      { label: "2026", income: 10000, expense: 15000, savings: -5000 },
    ]);
    expect(periodDates("2024-02-15", "monthly").to).toBe("2024-02-29");
  });
});
