import { describe, expect, test } from "vitest";
import {
  runForecast,
  solveRequiredSavings,
  type ForecastInputs,
} from "./lib/forecast";
const plan: ForecastInputs = {
  schemaVersion: 1,
  asOfDate: "2026-09-12",
  currentAge: 40,
  retirementAge: 41,
  endAge: 42,
  cashCents: 1_000_000,
  investmentCents: 0,
  retirementCents: 0,
  retirementAccessAge: 59.5,
  monthlyIncomeCents: 300_000,
  monthlySpendingCents: 200_000,
  retirementMonthlyIncomeCents: 100_000,
  retirementMonthlySpendingCents: 200_000,
  extraMonthlySavingsCents: 0,
  annualReturnPct: 0,
  inflationPct: 0,
  incomeGrowthPct: 0,
  legacyTargetCents: 0,
  travelPlans: [],
};
describe("independent forecast scenario checks", () => {
  test("matches a hand-calculated working year followed by a retired year", () => {
    const result = runForecast(plan);
    expect(result.retirementAssetsCents).toBe(2_200_000);
    expect(result.endAssetsCents).toBe(1_000_000);
    expect(runForecast({ ...plan, retirementAge: 40 }).endAssetsCents).toBe(0);
    expect(
      runForecast({ ...plan, retirementAge: 40 }).cumulativeShortfallCents,
    ).toBe(1_400_000);
    expect(
      runForecast({ ...plan, extraMonthlySavingsCents: 10_000 }).endAssetsCents,
    ).toBe(1_120_000);
  });
  test.each([-20, 0, 5, 12])(
    "matches closed-form end-of-month annuity at %s percent",
    (rate) => {
      const principal = 10_000_000,
        contribution = 50_000,
        count = 120;
      const result = runForecast({
        ...plan,
        endAge: 50,
        retirementAge: 50,
        cashCents: 0,
        investmentCents: principal,
        monthlyIncomeCents: contribution,
        monthlySpendingCents: 0,
        annualReturnPct: rate,
      });
      const monthly = (1 + rate / 100) ** (1 / 12) - 1;
      const expected =
        rate === 0
          ? principal + contribution * count
          : principal * (1 + monthly) ** count +
            (contribution * ((1 + monthly) ** count - 1)) / monthly;
      // The independent formula rounds only at the end; the ledger rounds each month.
      expect(
        Math.abs(result.endAssetsCents - Math.round(expected)),
      ).toBeLessThan(120);
    },
  );
  test("stress changes have the expected direction without violating monthly conservation", () => {
    const standard = {
      ...plan,
      retirementAge: 65,
      endAge: 90,
      investmentCents: 10_000_000,
      annualReturnPct: 5,
      inflationPct: 2.5,
      incomeGrowthPct: 2.5,
    };
    const baseline = runForecast(standard);
    for (const patch of [
      { annualReturnPct: 3 },
      { inflationPct: 3.5 },
      { retirementAge: 60 },
      {
        travelPlans: [
          {
            id: "travel",
            name: "Fictional annual trips",
            tripsPerYear: 2,
            costPerTripCents: 200_000,
            startAge: 40,
            endAge: 90,
            month: 7,
          },
        ],
      },
    ]) {
      const stressed = runForecast({ ...standard, ...patch });
      expect(stressed.endAssetsCents).toBeLessThanOrEqual(
        baseline.endAssetsCents,
      );
      expect(stressed.cumulativeShortfallCents).toBeGreaterThanOrEqual(
        baseline.cumulativeShortfallCents,
      );
      stressed.months.slice(1).forEach((row, index) => {
        expect(row.assetsCents - stressed.months[index].assetsCents).toBe(
          row.growthCents +
            row.incomeCents -
            row.spendingCents -
            row.travelCents +
            row.shortfallCents,
        );
      });
    }
  });
  test("travel timing can cause a shortfall even when annual income covers annual costs", () => {
    const inputs = {
      ...plan,
      asOfDate: "2026-01-31",
      retirementAge: 41,
      endAge: 41,
      cashCents: 0,
      monthlyIncomeCents: 100_000,
      monthlySpendingCents: 0,
      travelPlans: [
        {
          id: "trip",
          name: "One trip",
          tripsPerYear: 1,
          costPerTripCents: 600_000,
          startAge: 40,
          endAge: 41,
          month: 1,
        },
      ],
    };
    const result = runForecast(inputs);
    expect(result.cumulativeShortfallCents).toBe(500_000);
    expect(result.meetsTarget).toBe(false);
    expect(solveRequiredSavings(inputs).status).toBe("unreachable");
    expect(
      runForecast({
        ...inputs,
        travelPlans: [{ ...inputs.travelPlans[0], month: 12 }],
      }).meetsTarget,
    ).toBe(true);
  });
});
