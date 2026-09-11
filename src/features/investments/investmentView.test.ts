import { describe, expect, test } from "vitest";
import {
  investmentMetrics,
  investmentRange,
  unitPrice,
  units,
} from "./investmentView";

describe("investment presentation math", () => {
  test("unknown basis and foreign currencies do not become zero-cost gains", () => {
    expect(
      investmentMetrics([
        { valueCents: 12000, basisCents: 10000, currency: "USD" },
        { valueCents: 8000, basisCents: null, currency: "USD" },
        { valueCents: 99000, basisCents: 1, currency: "EUR" },
      ]),
    ).toMatchObject({
      value: 20000,
      basis: 10000,
      gain: 2000,
      gainPercent: 20,
      coverage: 60,
      unsupportedCount: 1,
    });
    expect(
      investmentMetrics([
        { valueCents: 8000, basisCents: null, currency: "USD" },
      ]),
    ).toMatchObject({ gain: null, gainPercent: null, coverage: 0 });
  });

  test("zero basis is known; short or zero-cost positions suppress a misleading gain percentage", () => {
    expect(
      investmentMetrics([{ valueCents: 5000, basisCents: 0, currency: "USD" }]),
    ).toMatchObject({ gain: 5000, gainPercent: null, coverage: 100 });
    expect(
      investmentMetrics([
        { valueCents: -3000, basisCents: -4000, currency: "USD" },
        { valueCents: 10000, basisCents: null, currency: "USD" },
      ]),
    ).toMatchObject({ value: 7000, gain: 1000, gainPercent: null });
  });

  test("calendar ranges clamp month ends and preserve leap years", () => {
    expect(investmentRange("1M", "2026-03-31")).toBe("2026-02-28");
    expect(investmentRange("1M", "2024-03-31")).toBe("2024-02-29");
    expect(investmentRange("1Y", "2024-02-29")).toBe("2023-02-28");
    expect(investmentRange("YTD", "2026-09-10")).toBe("2026-01-01");
  });

  test("fractional units and unit prices retain useful precision", () => {
    expect(units(0.00001234)).toBe("0.00001234");
    expect(unitPrice(10.025, "USD")).toBe("$10.025");
  });
});
