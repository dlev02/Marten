/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  runForecast,
  solveRequiredSavings,
  type ForecastInputs,
} from "./lib/forecast";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");

const base: ForecastInputs = {
  schemaVersion: 1,
  asOfDate: "2026-09-11",
  currentAge: 60,
  retirementAge: 65,
  endAge: 70,
  cashCents: 100000,
  investmentCents: 1000000,
  retirementCents: 2000000,
  retirementAccessAge: 59.5,
  monthlyIncomeCents: 300000,
  monthlySpendingCents: 200000,
  retirementMonthlyIncomeCents: 100000,
  retirementMonthlySpendingCents: 200000,
  extraMonthlySavingsCents: 0,
  annualReturnPct: 0,
  inflationPct: 0,
  incomeGrowthPct: 0,
  legacyTargetCents: 0,
  travelPlans: [],
};

describe("monthly forecast accounting", () => {
  test("conserves money, funds contributions from actual surplus, and aggregates annual rows", () => {
    const result = runForecast(base);
    expect(result.endAssetsCents).toBe(3100000);
    expect(result.totalContributionsCents).toBe(6000000);
    expect(result.totalWithdrawalsCents).toBe(6000000);
    expect(result.retirementAssetsCents).toBe(9100000);
    expect(result.months[1].date).toBe("2026-10-11");
    expect(result.years[1]).toMatchObject({
      incomeCents: 3600000,
      spendingCents: 2400000,
      contributionCents: 1200000,
    });
    for (let n = 1; n < result.months.length; n++) {
      const before = result.months[n - 1],
        after = result.months[n];
      expect(after.assetsCents - before.assetsCents).toBe(
        after.growthCents +
          after.incomeCents -
          after.spendingCents -
          after.travelCents +
          after.shortfallCents,
      );
      expect(after.assetsCents).toBe(
        after.cashCents + after.investmentCents + after.retirementCents,
      );
    }
    expect(
      runForecast({ ...base, extraMonthlySavingsCents: 10000 }).endAssetsCents -
        result.endAssetsCents,
    ).toBe(600000);
  });
  test("compounds monthly, deflates balances once, and regains the date anchor", () => {
    const result = runForecast({
      ...base,
      asOfDate: "2027-01-31",
      retirementAge: 61,
      endAge: 61,
      cashCents: 0,
      retirementCents: 0,
      investmentCents: 100000000,
      monthlyIncomeCents: 0,
      monthlySpendingCents: 0,
      annualReturnPct: 12,
      inflationPct: 3,
    });
    expect(result.months[1].date).toBe("2027-02-28");
    expect(result.months[2].date).toBe("2027-03-31");
    expect(Math.abs(result.endAssetsCents - 112000000)).toBeLessThan(10);
    expect(result.endRealAssetsCents).toBe(
      Math.round(result.endAssetsCents / 1.03),
    );
  });
  test("travel charges annual cost once in the selected period and respects age bounds", () => {
    const result = runForecast({
      ...base,
      travelPlans: [
        {
          id: "trip",
          name: "Sample travel",
          tripsPerYear: 3,
          costPerTripCents: 10000,
          startAge: 60,
          endAge: 62,
          month: 9,
        },
      ],
    });
    expect(
      result.months
        .filter((m) => m.travelCents)
        .map((m) => [m.date, m.travelCents]),
    ).toEqual([
      ["2026-10-11", 30000],
      ["2027-10-11", 30000],
    ]);
    expect(result.totalTravelCents).toBe(60000);
  });
  test("restricted retirement money does not conceal a liquidity failure or create negative balances", () => {
    const result = runForecast({
      ...base,
      currentAge: 58,
      retirementAge: 58,
      endAge: 60,
      retirementAccessAge: 59.5,
      cashCents: 0,
      investmentCents: 0,
      retirementCents: 10000000,
    });
    expect(result.depletionAge).toBe(58);
    expect(result.depletionDate).toBe(base.asOfDate);
    expect(result.cumulativeShortfallCents).toBe(1800000);
    expect(result.months[19].shortfallCents).toBe(0);
    expect(result.endAssetsCents).toBe(9400000);
    expect(result.meetsTarget).toBe(false);
  });
  test("solver finds the minimum actual spending reduction and cannot create impossible savings", () => {
    const inputs = {
      ...base,
      cashCents: 0,
      investmentCents: 0,
      retirementCents: 0,
      retirementAge: 61,
      endAge: 62,
      monthlyIncomeCents: 100000,
      monthlySpendingCents: 100000,
      retirementMonthlyIncomeCents: 0,
      retirementMonthlySpendingCents: 50000,
    };
    expect(solveRequiredSavings(inputs)).toEqual({
      status: "solved",
      requiredMonthlySavingsCents: 50000,
    });
    expect(
      runForecast({ ...inputs, extraMonthlySavingsCents: 49999 }).meetsTarget,
    ).toBe(false);
    expect(
      solveRequiredSavings({
        ...inputs,
        retirementMonthlySpendingCents: 200000,
      }).status,
    ).toBe("unreachable");
    expect(solveRequiredSavings(base).status).toBe("already-funded");
  });
  test("rejects malformed dates, unsafe amounts, NaN rates and inconsistent ages", () => {
    for (const patch of [
      { asOfDate: "2026-02-30" },
      { cashCents: 1.1 },
      { annualReturnPct: NaN },
      { retirementAge: 59 },
      { extraMonthlySavingsCents: 999999 },
      { inflationPct: -1 },
    ])
      expect(() => runForecast({ ...base, ...patch })).toThrow();
  });
  test("partial planning years aggregate only their months and a legacy target uses today's dollars", () => {
    const result = runForecast({
      ...base,
      retirementAge: 61,
      endAge: 61.5,
      inflationPct: 10,
    });
    expect(result.years.map((row) => row.month)).toEqual([0, 12, 18]);
    expect(result.years[2].incomeCents).toBe(
      result.months.slice(13).reduce((sum, row) => sum + row.incomeCents, 0),
    );
    expect(
      Math.abs(
        result.years[1].realSpendingCents - base.monthlySpendingCents * 12,
      ),
    ).toBeLessThanOrEqual(3);
    const legacy = {
      ...base,
      retirementAge: 60,
      endAge: 62,
      cashCents: 1210000,
      investmentCents: 0,
      retirementCents: 0,
      retirementMonthlyIncomeCents: 0,
      retirementMonthlySpendingCents: 0,
      inflationPct: 10,
      legacyTargetCents: 1000000,
    };
    expect(runForecast(legacy).meetsTarget).toBe(true);
    expect(
      runForecast({ ...legacy, legacyTargetCents: 1000001 }).meetsTarget,
    ).toBe(false);
  });
});

async function fixture() {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => ({
    alice: await ctx.db.insert("users", {
      email: "forecast-alice@example.test",
    }),
    bob: await ctx.db.insert("users", { email: "forecast-bob@example.test" }),
  }));
  return {
    t,
    users,
    alice: t.withIdentity({ subject: users.alice }),
    bob: t.withIdentity({ subject: users.bob }),
  };
}

describe("forecast persistence and observed baseline", () => {
  test("sample reset removes its frozen financial scenarios and preserves another owner's plans", async () => {
    const { alice, bob } = await fixture();
    await alice.mutation(api.workspace.initialize, { sample: true });
    await alice.mutation(api.forecasting.save, {
      name: "Sample plan",
      inputs: base,
    });
    await bob.mutation(api.forecasting.save, {
      name: "Other plan",
      inputs: base,
    });
    for (let step = 0; step < 50; step++) {
      const result = await alice.mutation(api.workspace.clearSample, {});
      if (result.done) break;
    }
    expect(await alice.query(api.forecasting.list, {})).toEqual([]);
    expect(await bob.query(api.forecasting.list, {})).toHaveLength(1);
  });
  test("isolates owners, detects stale saves/deletes, and freezes snapshots", async () => {
    const { t, alice, bob } = await fixture();
    await expect(t.query(api.forecasting.list, {})).rejects.toThrow("sign in");
    const saved = await alice.mutation(api.forecasting.save, {
      name: "Retire at 65",
      inputs: base,
    });
    expect(saved.revision).toBe(1);
    expect(await bob.query(api.forecasting.list, {})).toEqual([]);
    await expect(
      bob.mutation(api.forecasting.save, {
        id: saved._id,
        expectedRevision: 1,
        name: "Foreign",
        inputs: base,
      }),
    ).rejects.toThrow("unavailable");
    await alice.mutation(api.forecasting.save, {
      id: saved._id,
      expectedRevision: 1,
      name: "Retire at 66",
      inputs: { ...base, retirementAge: 66 },
    });
    await expect(
      alice.mutation(api.forecasting.save, {
        id: saved._id,
        expectedRevision: 1,
        name: "Stale",
        inputs: base,
      }),
    ).rejects.toThrow("changed elsewhere");
    await expect(
      alice.mutation(api.forecasting.remove, {
        id: saved._id,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("changed elsewhere");
    expect((await alice.query(api.forecasting.list, {}))[0].inputs).toEqual({
      ...base,
      retirementAge: 66,
    });
    await alice.mutation(api.forecasting.remove, {
      id: saved._id,
      expectedRevision: 2,
    });
    expect(await alice.query(api.forecasting.list, {})).toEqual([]);
  });
  test("baseline uses split-aware signed totals, excludes transfers and incomplete months, flags debt and sparse data", async () => {
    const { t, users, alice, bob } = await fixture();
    await t.run(async (ctx) => {
      const fields = {
        userId: users.alice,
        institution: "Sample",
        mask: "0000",
        subtype: "checking",
        currency: "USD",
        hidden: false,
        excludeNetWorth: false,
        closed: false,
        manual: true,
        updatedAt: 1,
      };
      const accountId = await ctx.db.insert("accounts", {
        ...fields,
        name: "Sample cash",
        kind: "cash",
        balanceCents: 500000,
      });
      await ctx.db.insert("accounts", {
        ...fields,
        name: "Sample loan",
        kind: "loan",
        balanceCents: 300000,
      });
      await ctx.db.insert("accounts", {
        ...fields,
        name: "Foreign currency loan",
        currency: "EUR",
        kind: "loan",
        balanceCents: 999999,
      });
      await ctx.db.insert("accounts", {
        ...fields,
        name: "Sample IRA",
        kind: "investment",
        subtype: "roth ira",
        balanceCents: 700000,
      });
      const categories = [];
      for (const kind of ["income", "expense", "transfer"] as const) {
        const groupId = await ctx.db.insert("groups", {
          userId: users.alice,
          name: kind,
          kind,
          order: 0,
        });
        categories.push(
          await ctx.db.insert("categories", {
            userId: users.alice,
            groupId,
            name: kind,
            emoji: "",
            order: 0,
            enabled: true,
          }),
        );
      }
      const merchantId = await ctx.db.insert("merchants", {
        userId: users.alice,
        name: "Sample",
        normalizedName: "sample",
        color: "#000000",
        transactionCount: 0,
      });
      const tx = {
        userId: users.alice,
        accountId,
        merchantId,
        categoryId: categories[1],
        date: "2026-08-20",
        amountCents: 100000,
        originalName: "Sample",
        notes: "",
        tagIds: [],
        reviewed: true,
        hidden: false,
        pending: false,
        splits: [],
        source: "sample" as const,
        searchText: "sample",
        updatedAt: 1,
        editedFields: [],
      };
      await ctx.db.insert("transactions", {
        ...tx,
        amountCents: -2400000,
        categoryId: categories[0],
      });
      await ctx.db.insert("transactions", {
        ...tx,
        amountCents: 1200000,
        splits: [
          { categoryId: categories[1], amountCents: 1000000 },
          { categoryId: categories[2], amountCents: 200000 },
        ],
      });
      await ctx.db.insert("transactions", { ...tx, amountCents: -40000 });
      for (const patch of [
        { pending: true },
        { hidden: true },
        { removedFromBank: true },
        { date: "2026-09-01" },
        { categoryId: categories[2] },
      ])
        await ctx.db.insert("transactions", { ...tx, ...patch });
    });
    const result = await alice.query(api.forecasting.baseline, {
      asOfDate: "2026-09-11",
    });
    expect(result.inputs).toMatchObject({
      cashCents: 500000,
      retirementCents: 700000,
      investmentCents: 0,
      monthlyIncomeCents: 2400000,
      monthlySpendingCents: 960000,
    });
    expect(result.history).toMatchObject({
      from: "2025-09-01",
      to: "2026-08-31",
      observedMonths: 1,
      complete: true,
    });
    expect(result.excludedDebtCents).toBe(300000);
    expect(
      (await bob.query(api.forecasting.baseline, { asOfDate: "2026-09-11" }))
        .inputs.cashCents,
    ).toBe(0);
  });
});
