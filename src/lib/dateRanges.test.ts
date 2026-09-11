import { describe, expect, it } from "vitest";
import { transactionDatePresets } from "./dateRanges";
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
