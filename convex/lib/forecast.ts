/** Deterministic, monthly planning. Money is integer cents; rates are percent/year. */
export type TravelPlan = {
  id: string;
  name: string;
  tripsPerYear: number;
  costPerTripCents: number;
  startAge: number;
  endAge: number;
  month: number;
};

export type ForecastInputs = {
  schemaVersion: 1;
  asOfDate: string;
  currentAge: number;
  retirementAge: number;
  endAge: number;
  cashCents: number;
  investmentCents: number;
  retirementCents: number;
  retirementAccessAge: number;
  monthlyIncomeCents: number;
  monthlySpendingCents: number;
  retirementMonthlyIncomeCents: number;
  retirementMonthlySpendingCents: number;
  extraMonthlySavingsCents: number;
  annualReturnPct: number;
  inflationPct: number;
  incomeGrowthPct: number;
  legacyTargetCents: number;
  travelPlans: TravelPlan[];
};

export type ForecastMonth = {
  month: number;
  date: string;
  age: number;
  retired: boolean;
  cashCents: number;
  investmentCents: number;
  retirementCents: number;
  assetsCents: number;
  realAssetsCents: number;
  accessibleCents: number;
  incomeCents: number;
  spendingCents: number;
  travelCents: number;
  growthCents: number;
  contributionCents: number;
  withdrawalCents: number;
  shortfallCents: number;
  cumulativeShortfallCents: number;
};

export type ForecastYear = ForecastMonth & {
  realIncomeCents: number;
  realSpendingCents: number;
  realTravelCents: number;
  realGrowthCents: number;
  realContributionCents: number;
  realWithdrawalCents: number;
  realShortfallCents: number;
};

export function validateForecastInputs(input: ForecastInputs) {
  if (input.schemaVersion !== 1)
    throw new Error("Unsupported forecast version.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate) ||
    !Number.isFinite(Date.parse(input.asOfDate)) ||
    new Date(input.asOfDate).toISOString().slice(0, 10) !== input.asOfDate
  )
    throw new Error("Enter a valid forecast date.");
  for (const key of [
    "currentAge",
    "retirementAge",
    "endAge",
    "retirementAccessAge",
  ] as const)
    if (
      !Number.isFinite(input[key]) ||
      input[key] < 0 ||
      input[key] > 120 ||
      !Number.isInteger(input[key] * 12)
    )
      throw new Error("Ages must be between 0 and 120 in whole months.");
  if (
    input.currentAge < 18 ||
    input.retirementAge < input.currentAge ||
    input.endAge <= input.currentAge ||
    input.retirementAge > input.endAge
  )
    throw new Error(
      "Retirement must fall between your current age and planning age.",
    );
  for (const [key, value] of Object.entries(input))
    if (
      key.endsWith("Cents") &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 1e13)
    )
      throw new Error(
        "Money must be nonnegative whole cents within the supported range.",
      );
  if (input.extraMonthlySavingsCents > input.monthlySpendingCents)
    throw new Error(
      "Extra savings cannot exceed the living spending you can reduce.",
    );
  for (const key of [
    "annualReturnPct",
    "inflationPct",
    "incomeGrowthPct",
  ] as const)
    if (
      !Number.isFinite(input[key]) ||
      input[key] < (key === "inflationPct" ? 0 : -50) ||
      input[key] > 30
    )
      throw new Error(
        "Enter an annual rate within the supported range (-50% to 30%; inflation 0% to 30%).",
      );
  if (input.travelPlans.length > 20)
    throw new Error("Use up to 20 travel plans.");
  const ids = new Set<string>();
  for (const trip of input.travelPlans) {
    if (
      !trip.id ||
      ids.has(trip.id) ||
      trip.id.length > 100 ||
      !trip.name.trim() ||
      trip.name.length > 120
    )
      throw new Error("Each travel plan needs a unique ID and a name.");
    ids.add(trip.id);
    if (
      !Number.isInteger(trip.tripsPerYear) ||
      trip.tripsPerYear < 0 ||
      trip.tripsPerYear > 100 ||
      !Number.isSafeInteger(trip.costPerTripCents) ||
      trip.costPerTripCents < 0 ||
      trip.costPerTripCents > 1e11 ||
      !Number.isInteger(trip.month) ||
      trip.month < 1 ||
      trip.month > 12 ||
      !Number.isFinite(trip.startAge) ||
      !Number.isFinite(trip.endAge) ||
      trip.startAge < input.currentAge ||
      trip.endAge < trip.startAge ||
      trip.endAge > input.endAge
    )
      throw new Error("Review the trip count, cost, month, and age range.");
  }
}

const money = (value: number) => {
  const result = Math.round(value);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 1e15)
    throw new Error(
      "This forecast exceeds the supported amount. Reduce the horizon or growth assumptions.",
    );
  return result;
};

/** Inputs are today's dollars. Contributions are funded only by the income/spending surplus.
 * Extra savings reduce working-life spending; they are never added as free outside money.
 * Periods are full months anchored to asOfDate's day (clamped at month end).
 * Travel is charged in the period starting in the chosen month, for its full annual cost.
 * A shortfall is unmet spending, not a fictional loan or a negative investment balance.
 */
export function runForecast(input: ForecastInputs) {
  validateForecastInputs(input);
  const monthlyReturn = Math.pow(1 + input.annualReturnPct / 100, 1 / 12) - 1;
  let cash = input.cashCents,
    investments = input.investmentCents,
    retirement = input.retirementCents;
  let cumulativeShortfall = 0;
  const months: ForecastMonth[] = [];
  const start = new Date(input.asOfDate + "T12:00:00Z");
  const count = Math.round((input.endAge - input.currentAge) * 12);
  for (let month = 0; month <= count; month++) {
    const age = input.currentAge + month / 12;
    const inflation = Math.pow(1 + input.inflationPct / 100, month / 12);
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month + 1, 0),
    ).getUTCDate();
    const date = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + month,
        Math.min(start.getUTCDate(), lastDay),
      ),
    )
      .toISOString()
      .slice(0, 10);
    const retired = age >= input.retirementAge;
    let income = 0,
      spending = 0,
      travel = 0,
      growth = 0,
      contribution = 0,
      withdrawal = 0,
      shortfall = 0;
    if (month > 0) {
      // Month's cash flow uses its opening age; the row records its closing age.
      const openingAge = input.currentAge + (month - 1) / 12;
      const isRetired = openingAge >= input.retirementAge;
      const factor = Math.pow(1 + input.inflationPct / 100, (month - 1) / 12);
      const taxableGrowth = money(investments * monthlyReturn),
        retirementGrowth = money(retirement * monthlyReturn);
      investments += taxableGrowth;
      retirement += retirementGrowth;
      growth = taxableGrowth + retirementGrowth;
      income = money(
        isRetired
          ? input.retirementMonthlyIncomeCents * factor
          : input.monthlyIncomeCents *
              Math.pow(1 + input.incomeGrowthPct / 100, (month - 1) / 12),
      );
      spending = money(
        (isRetired
          ? input.retirementMonthlySpendingCents
          : input.monthlySpendingCents - input.extraMonthlySavingsCents) *
          factor,
      );
      const calendarMonth = ((start.getUTCMonth() + month - 1) % 12) + 1;
      travel = input.travelPlans.reduce(
        (sum, plan) =>
          sum +
          (openingAge >= plan.startAge &&
          openingAge < plan.endAge &&
          calendarMonth === plan.month
            ? money(plan.tripsPerYear * plan.costPerTripCents * factor)
            : 0),
        0,
      );
      const surplus = income - spending - travel;
      if (surplus >= 0) {
        contribution = surplus;
        investments += surplus;
      } else {
        let needed = -surplus;
        const fromCash = Math.min(cash, needed);
        cash -= fromCash;
        needed -= fromCash;
        const fromInvestments = Math.min(investments, needed);
        investments -= fromInvestments;
        needed -= fromInvestments;
        if (openingAge >= input.retirementAccessAge) {
          const fromRetirement = Math.min(retirement, needed);
          retirement -= fromRetirement;
          needed -= fromRetirement;
        }
        shortfall = needed;
        withdrawal = -surplus - shortfall;
        cumulativeShortfall += shortfall;
      }
    }
    const assets = money(cash + investments + retirement);
    months.push({
      month,
      date: month === 0 ? input.asOfDate : date,
      age,
      retired,
      cashCents: cash,
      investmentCents: investments,
      retirementCents: retirement,
      assetsCents: assets,
      realAssetsCents: money(assets / inflation),
      accessibleCents:
        cash +
        investments +
        (age >= input.retirementAccessAge ? retirement : 0),
      incomeCents: income,
      spendingCents: spending,
      travelCents: travel,
      growthCents: growth,
      contributionCents: contribution,
      withdrawalCents: withdrawal,
      shortfallCents: shortfall,
      cumulativeShortfallCents: cumulativeShortfall,
    });
  }
  const final = months[months.length - 1];
  const retirementRow = months.find((row) => row.age >= input.retirementAge)!;
  const firstShortfall = months.find((row) => row.shortfallCents > 0);
  const years: ForecastYear[] = [];
  for (let end = 0; end <= count; end = Math.min(count, end + 12)) {
    const row = months[end];
    const group = months.slice(
      Math.max(1, end - (end % 12 || 12) + 1),
      end + 1,
    );
    const total = (
      key:
        | "incomeCents"
        | "spendingCents"
        | "travelCents"
        | "growthCents"
        | "contributionCents"
        | "withdrawalCents"
        | "shortfallCents",
    ) => group.reduce((sum, month) => sum + month[key], 0);
    const real = (key: Parameters<typeof total>[0]) =>
      money(
        group.reduce(
          (sum, month) =>
            sum +
            month[key] /
              Math.pow(1 + input.inflationPct / 100, (month.month - 1) / 12),
          0,
        ),
      );
    years.push({
      ...row,
      incomeCents: total("incomeCents"),
      spendingCents: total("spendingCents"),
      travelCents: total("travelCents"),
      growthCents: total("growthCents"),
      contributionCents: total("contributionCents"),
      withdrawalCents: total("withdrawalCents"),
      shortfallCents: total("shortfallCents"),
      realIncomeCents: real("incomeCents"),
      realSpendingCents: real("spendingCents"),
      realTravelCents: real("travelCents"),
      realGrowthCents: real("growthCents"),
      realContributionCents: real("contributionCents"),
      realWithdrawalCents: real("withdrawalCents"),
      realShortfallCents: real("shortfallCents"),
    });
    if (end === count) break;
  }
  return {
    months,
    years,
    retirementAssetsCents: retirementRow.assetsCents,
    retirementRealAssetsCents: retirementRow.realAssetsCents,
    endAssetsCents: final.assetsCents,
    endRealAssetsCents: final.realAssetsCents,
    depletionAge: firstShortfall ? firstShortfall.age - 1 / 12 : null,
    depletionDate: firstShortfall
      ? months[firstShortfall.month - 1].date
      : null,
    cumulativeShortfallCents: cumulativeShortfall,
    totalGrowthCents: months.reduce((sum, row) => sum + row.growthCents, 0),
    totalContributionsCents: months.reduce(
      (sum, row) => sum + row.contributionCents,
      0,
    ),
    totalWithdrawalsCents: months.reduce(
      (sum, row) => sum + row.withdrawalCents,
      0,
    ),
    totalTravelCents: months.reduce((sum, row) => sum + row.travelCents, 0),
    meetsTarget:
      cumulativeShortfall === 0 &&
      final.realAssetsCents >= input.legacyTargetCents,
  };
}

export type ForecastResult = ReturnType<typeof runForecast>;
export type SavingsSolution = ReturnType<typeof solveRequiredSavings>;

/** Minimum total monthly spending reduction, to the cent, that funds every month and the legacy target. */
export function solveRequiredSavings(input: ForecastInputs) {
  validateForecastInputs(input);
  const passes = (cents: number) =>
    runForecast({ ...input, extraMonthlySavingsCents: cents }).meetsTarget;
  if (passes(0))
    return {
      status: "already-funded" as const,
      requiredMonthlySavingsCents: 0,
    };
  if (
    input.retirementAge === input.currentAge ||
    !passes(input.monthlySpendingCents)
  )
    return {
      status: "unreachable" as const,
      requiredMonthlySavingsCents: null,
    };
  let low = 0,
    high = input.monthlySpendingCents;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (passes(mid)) high = mid;
    else low = mid;
  }
  return { status: "solved" as const, requiredMonthlySavingsCents: high };
}
