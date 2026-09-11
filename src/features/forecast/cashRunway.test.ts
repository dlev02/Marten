import { describe, expect, test } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  cashRunway,
  runwayDate,
  type RunwayAccount,
  type RunwaySchedule,
} from "./cashRunway";

const checkingId = "checking" as Id<"accounts">;
const account = (patch: Partial<RunwayAccount> = {}): RunwayAccount => ({
  _id: checkingId,
  name: "Checking",
  kind: "cash",
  closed: false,
  currency: "USD",
  balanceCents: 100_000,
  ...patch,
});
const schedule = (patch: Partial<RunwaySchedule> = {}): RunwaySchedule => ({
  _id: "schedule" as Id<"recurring">,
  merchantId: "merchant" as Id<"merchants">,
  accountId: checkingId,
  amountCents: 5_000,
  nextDate: "2026-09-12",
  frequency: "monthly",
  active: true,
  ...patch,
});
const baseline = {
  asOf: "2026-09-10",
  days: 30 as const,
  accounts: [account()],
  schedules: [] as RunwaySchedule[],
  payments: [],
};

describe("cash runway", () => {
  test("combines cash balances, signed schedules, and one daily allowance", () => {
    const result = cashRunway({
      ...baseline,
      accounts: [
        account(),
        account({ _id: "savings" as Id<"accounts">, balanceCents: 200_000 }),
      ],
      schedules: [
        schedule(),
        schedule({
          _id: "paycheck" as Id<"recurring">,
          nextDate: "2026-09-11",
          amountCents: -20_000,
        }),
      ],
      dailySpendingCents: 100,
    });
    expect(result.startingCents).toBe(300_000);
    expect(result.endingCents).toBe(312_000);
    expect(result.variableSpendingCents).toBe(3_000);
    expect(result.points[1]).toEqual({
      date: "2026-09-11",
      balanceCents: 319_900,
      scheduledCents: 20_000,
    });
    expect(result.minimum.date).toBe(baseline.asOf);
    expect(result.firstShortfall).toBeNull();
  });

  test("does not apply today's activity again and excludes only paid occurrences", () => {
    const weekly = schedule({
      frequency: "weekly",
      nextDate: baseline.asOf,
      amountCents: 1_000,
    });
    const result = cashRunway({
      ...baseline,
      schedules: [weekly],
      payments: [
        { recurringId: weekly._id, date: "2026-09-17", paid: true },
        { recurringId: weekly._id, date: "2026-09-24", paid: false },
      ],
    });
    expect(result.events.map((event) => event.date)).toEqual([
      "2026-09-24",
      "2026-10-01",
      "2026-10-08",
    ]);
    expect(result.endingCents).toBe(97_000);
  });

  test("keeps the account selection and excludes closed, noncash, missing, and other-currency schedules", () => {
    const ids = [
      "savings",
      "card",
      "closed",
      "euros",
      "missing",
    ] as Id<"accounts">[];
    const result = cashRunway({
      ...baseline,
      accountId: checkingId,
      accounts: [
        account(),
        account({ _id: ids[0], balanceCents: 200_000 }),
        account({ _id: ids[1], kind: "credit" }),
        account({ _id: ids[2], closed: true }),
        account({ _id: ids[3], currency: "EUR" }),
      ],
      schedules: [
        schedule(),
        ...ids.map((id) =>
          schedule({ _id: id as string as Id<"recurring">, accountId: id }),
        ),
      ],
    });
    expect(result.startingCents).toBe(100_000);
    expect(result.endingCents).toBe(95_000);
    expect(result.events).toHaveLength(1);
    expect(result.excludedSchedules).toHaveLength(4);
    expect(result.otherCurrencyAccounts).toHaveLength(1);
  });

  test("preserves month-end and leap-year recurrence dates", () => {
    const monthEnds = cashRunway({
      ...baseline,
      asOf: "2027-01-30",
      days: 90,
      schedules: [schedule({ nextDate: "2027-01-31" })],
    });
    expect(monthEnds.events.map((event) => event.date)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    const leap = cashRunway({
      ...baseline,
      asOf: "2027-03-01",
      days: 365,
      schedules: [schedule({ frequency: "yearly", nextDate: "2024-02-29" })],
    });
    expect(leap.to).toBe("2028-02-29");
    expect(leap.events.map((event) => event.date)).toEqual(["2028-02-29"]);
  });

  test.each([30, 90, 365] as const)(
    "applies exactly %i future calendar days across daylight-saving boundaries",
    (days) => {
      const result = cashRunway({
        ...baseline,
        asOf: "2026-10-31",
        days,
        accounts: [account({ balanceCents: 0 })],
        dailySpendingCents: 7,
      });
      expect(result.points).toHaveLength(days + 1);
      expect(result.endingCents).toBe(-7 * days);
      expect(result.firstShortfall?.date).toBe("2026-11-01");
      expect(result.minimum).toEqual(result.points.at(-1));
      expect(new Set(result.points.map((point) => point.date)).size).toBe(
        days + 1,
      );
    },
  );

  test("evaluates daily closing balances without inventing intraday payment order", () => {
    const result = cashRunway({
      ...baseline,
      accounts: [account({ balanceCents: 10_000 })],
      schedules: [
        schedule({ amountCents: 100_000 }),
        schedule({ _id: "deposit" as Id<"recurring">, amountCents: -100_000 }),
      ],
    });
    expect(result.endingCents).toBe(10_000);
    expect(result.firstShortfall).toBeNull();
    expect(result.minimum.balanceCents).toBe(10_000);
  });

  test("counts a cash-account card payment once, without also counting card purchases", () => {
    const cardId = "credit-card" as Id<"accounts">;
    const result = cashRunway({
      ...baseline,
      accounts: [
        account(),
        account({ _id: cardId, kind: "credit", balanceCents: 5_000 }),
      ],
      schedules: [
        schedule({ _id: "card-payment" as Id<"recurring"> }),
        schedule({
          _id: "card-purchase" as Id<"recurring">,
          accountId: cardId,
        }),
        schedule({ _id: "paused" as Id<"recurring">, active: false }),
      ],
    });
    expect(result.endingCents).toBe(95_000);
    expect(result.events.map((event) => event.scheduleId)).toEqual([
      "card-payment",
    ]);
  });

  test("rejects invalid dates, negative allowances, and unsafe totals", () => {
    expect(() => runwayDate("2026-02-30", 1)).toThrow("valid forecast date");
    expect(() => cashRunway({ ...baseline, dailySpendingCents: -1 })).toThrow(
      "cannot be negative",
    );
    expect(() =>
      cashRunway({
        ...baseline,
        accounts: [
          account({ balanceCents: Number.MAX_SAFE_INTEGER }),
          account({ _id: "extra" as Id<"accounts">, balanceCents: 1 }),
        ],
      }),
    ).toThrow("supported amount range");
    expect(() =>
      cashRunway({ ...baseline, dailySpendingCents: Number.MAX_SAFE_INTEGER }),
    ).toThrow("supported amount range");
  });
});
