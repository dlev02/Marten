import { describe, expect, it } from "vitest";
import {
  dateRangeLabel,
  reportDatePresets,
  transactionDatePresets,
} from "./dateRanges";
describe("transaction date presets", () => {
  it("retains leap days and uses 30 inclusive local calendar days", () => {
    const ranges = transactionDatePresets(new Date(2024, 2, 1, 12));
    expect(ranges.find((range) => range.label === "Last month")).toEqual({
      label: "Last month",
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(ranges.find((range) => range.label === "Last 30 days")).toEqual({
      label: "Last 30 days",
      from: "2024-02-01",
      to: "2024-03-01",
    });
  });
  it("crosses the year boundary without inventing a future end date", () => {
    const ranges = transactionDatePresets(new Date(2026, 0, 5, 12));
    expect(ranges.find((range) => range.label === "Last month")).toEqual({
      label: "Last month",
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(ranges.find((range) => range.label === "This month")?.to).toBe(
      "2026-01-05",
    );
    expect(ranges.find((range) => range.label === "This year")?.to).toBe(
      "2026-01-05",
    );
  });
});

describe("report date presets", () => {
  it("closes every range on a month boundary", () => {
    const ranges = reportDatePresets(new Date(2026, 8, 13, 12));
    expect(ranges.find((range) => range.label === "Last 6 months")).toEqual({
      label: "Last 6 months",
      from: "2026-04-01",
      to: "2026-09-30",
    });
    expect(ranges.find((range) => range.label === "Year to date")).toEqual({
      label: "Year to date",
      from: "2026-01-01",
      to: "2026-09-30",
    });
    expect(dateRangeLabel("2026-04-01", "2026-09-30", ranges)).toBe(
      "Last 6 months",
    );
    expect(dateRangeLabel("2026-04-03", "2026-09-30", ranges)).toBe(
      "Apr 3, 2026 – Sep 30, 2026",
    );
  });
});
