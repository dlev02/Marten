import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { detectRecurringPatterns } from "./lib/recurringDetection";

function rows(dates: string[], amounts: number[] = [1607]) {
  return dates.map((date, i) => ({
    _id: `transaction-${date}-${i}` as Id<"transactions">,
    merchantId: "merchant" as Id<"merchants">,
    accountId: "account" as Id<"accounts">,
    categoryId: "category" as Id<"categories">,
    originalName: "SAMPLE MEMBERSHIP",
    date,
    amountCents: amounts[i % amounts.length],
    hidden: false,
    pending: false,
  }));
}
describe("recurring cadence evidence", () => {
  test("alternating one-cent charges form one monthly pattern, even when exact amounts each repeat", () => {
    const result = detectRecurringPatterns(
      rows(
        [
          "2026-03-10",
          "2026-04-10",
          "2026-05-11",
          "2026-06-10",
          "2026-07-10",
          "2026-08-10",
        ],
        [1607, 1608],
      ),
      [],
      "2026-08-20",
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      frequency: "monthly",
      amountCents: 1608,
      amountToleranceCents: 1,
      occurrences: 6,
      nextDate: "2026-09-10",
      confidence: "high",
    });
  });
  test.each([
    [
      "weekly",
      ["2026-08-07", "2026-08-14", "2026-08-22", "2026-08-28"],
      "2026-09-04",
    ],
    [
      "biweekly",
      ["2026-07-03", "2026-07-17", "2026-07-31", "2026-08-14"],
      "2026-08-28",
    ],
    ["quarterly", ["2026-02-15", "2026-05-15", "2026-08-17"], "2026-11-15"],
    ["yearly", ["2025-08-10", "2026-08-10"], "2027-08-10"],
  ] as const)(
    "supports %s with posting-date shifts",
    (frequency, dates, nextDate) => {
      const result = detectRecurringPatterns(
        rows([...dates]),
        [],
        "2026-08-28",
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ frequency, nextDate });
    },
  );
  test("calendar months survive February and retain an observed month-end day", () => {
    const result = detectRecurringPatterns(
      rows(["2025-12-31", "2026-01-31", "2026-02-28"]),
      [],
      "2026-03-02",
    );
    expect(result[0]).toMatchObject({
      frequency: "monthly",
      nextDate: "2026-03-31",
      occurrences: 3,
    });
  });
  test("one missed month and an occasional unrelated order do not hide a subscription", () => {
    const result = detectRecurringPatterns(
      rows(
        [
          "2026-03-10",
          "2026-04-10",
          "2026-05-10",
          "2026-07-10",
          "2026-08-10",
          "2026-08-23",
        ],
        [1607],
      ),
      [],
      "2026-08-24",
    );
    expect(result[0]).toMatchObject({
      frequency: "monthly",
      occurrences: 5,
      nextDate: "2026-09-10",
    });
  });
  test("frequent everyday purchases, irregular dates, old subscriptions and future rows are not proposals", () => {
    expect(
      detectRecurringPatterns(
        rows(
          Array.from(
            { length: 25 },
            (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`,
          ),
        ),
        [],
        "2026-08-28",
      ),
    ).toEqual([]);
    expect(
      detectRecurringPatterns(
        rows(["2026-06-02", "2026-07-17", "2026-08-06"]),
        [],
        "2026-08-28",
      ),
    ).toEqual([]);
    expect(
      detectRecurringPatterns(
        rows(["2025-01-10", "2025-02-10", "2025-03-10"]),
        [],
        "2026-08-28",
      ),
    ).toEqual([]);
    expect(
      detectRecurringPatterns(
        rows(["2026-08-01", "2026-09-01", "2026-10-01"]),
        [],
        "2026-08-28",
      ),
    ).toEqual([]);
  });
  test("owner-selected patterns, accounts, refund direction and ineligible transactions remain isolated", () => {
    const history = rows(["2026-06-10", "2026-07-10", "2026-08-10"]);
    const schedule = { ...history[0], amountToleranceCents: 1 };
    expect(detectRecurringPatterns(history, [schedule], "2026-08-28")).toEqual(
      [],
    );
    expect(
      detectRecurringPatterns(
        history.map((row, i) => ({
          ...row,
          accountId: `account-${i}` as Id<"accounts">,
        })),
        [],
        "2026-08-28",
      ),
    ).toEqual([]);
    expect(
      detectRecurringPatterns(
        history.map((row, i) => ({
          ...row,
          amountCents: i === 1 ? -1607 : 1607,
        })),
        [],
        "2026-08-28",
      ),
    ).toEqual([]);
    for (const flag of ["hidden", "pending", "removedFromBank"] as const)
      expect(
        detectRecurringPatterns(
          history.map((row) => ({ ...row, [flag]: true })),
          [],
          "2026-08-28",
        ),
      ).toEqual([]);
  });
});
