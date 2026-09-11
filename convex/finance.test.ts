import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  advanceDate,
  entries,
  matchesRule,
  recurringDates,
  validateSplits,
} from "./lib/finance";

const accountId = "test-account" as Id<"accounts">;
const categoryId = "test-category" as Id<"categories">;
const merchantId = "test-merchant" as Id<"merchants">;
const transferCategoryId = "test-transfer" as Id<"categories">;

describe("transaction splits", () => {
  test.each([
    [1001, [500, 501]],
    [-1001, [-500, -501]],
    [1000, [1200, -200]],
    [0, [100, -100]],
  ])("preserves exact cents for %i", (total, amounts) => {
    expect(() =>
      validateSplits(
        total,
        amounts.map((amountCents) => ({ amountCents })),
      ),
    ).not.toThrow();
  });

  test.each([
    [1001, [500, 500]],
    [-1001, [-500, -500]],
    [1000, [1000]],
    [1000, [500.5, 499.5]],
    [1000, [Number.NaN, 1000]],
    [1000, [Number.POSITIVE_INFINITY, -Number.POSITIVE_INFINITY]],
    [51, Array.from({ length: 51 }, () => 1)],
  ])("rejects invalid allocation of %i", (total, amounts) => {
    expect(() =>
      validateSplits(
        total,
        amounts.map((amountCents) => ({ amountCents })),
      ),
    ).toThrow();
  });

  test("allows removing splits and exactly fifty allocations", () => {
    expect(() => validateSplits(-999, [])).not.toThrow();
    expect(() =>
      validateSplits(
        50,
        Array.from({ length: 50 }, () => ({ amountCents: 1 })),
      ),
    ).not.toThrow();
  });
});

describe("recurrence calendar", () => {
  test("restores the January 31 anchor after a short month", () => {
    expect(
      recurringDates("2025-01-31", "monthly", "2025-01-01", "2025-05-31"),
    ).toEqual([
      "2025-01-31",
      "2025-02-28",
      "2025-03-31",
      "2025-04-30",
      "2025-05-31",
    ]);
  });

  test("handles leap February and preserves annual leap-day anchors", () => {
    expect(advanceDate("2024-01-31", "monthly")).toBe("2024-02-29");
    expect(
      recurringDates("2024-02-29", "yearly", "2024-01-01", "2028-12-31"),
    ).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  test("keeps quarterly anchors across year boundaries", () => {
    expect(
      recurringDates("2025-08-31", "quarterly", "2025-08-31", "2026-08-31"),
    ).toEqual([
      "2025-08-31",
      "2025-11-30",
      "2026-02-28",
      "2026-05-31",
      "2026-08-31",
    ]);
  });

  test("uses inclusive range boundaries and whole calendar weeks", () => {
    expect(
      recurringDates("2026-03-01", "weekly", "2026-03-08", "2026-03-22"),
    ).toEqual(["2026-03-08", "2026-03-15", "2026-03-22"]);
    expect(advanceDate("2025-12-25", "biweekly")).toBe("2026-01-08");
    expect(
      recurringDates("2026-09-10", "monthly", "2026-01-01", "2026-09-09"),
    ).toEqual([]);
  });
});

describe("financial entries", () => {
  const transaction = {
    hidden: false,
    pending: false,
    splits: [],
    amountCents: -12500,
    categoryId,
    date: "2026-09-10",
    merchantId,
    accountId,
  };

  test("excludes pending and hidden transactions", () => {
    expect(entries({ ...transaction, pending: true })).toEqual([]);
    expect(entries({ ...transaction, hidden: true })).toEqual([]);
  });

  test("replaces a split parent with its children without losing transfer categories", () => {
    const result = entries({
      ...transaction,
      splits: [
        { categoryId, amountCents: -10000 },
        { categoryId: transferCategoryId, amountCents: -2500 },
      ],
    });
    expect(result).toEqual([
      {
        amountCents: -10000,
        categoryId,
        date: transaction.date,
        merchantId,
        accountId,
      },
      {
        amountCents: -2500,
        categoryId: transferCategoryId,
        date: transaction.date,
        merchantId,
        accountId,
      },
    ]);
    expect(result.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(
      -12500,
    );
  });
});

describe("rule predicates", () => {
  const transaction = {
    originalName: "CORNER  GROCERY #101",
    amountCents: -4250,
    accountId,
    categoryId,
  };
  const rule = (
    conditions: Doc<"rules">["conditions"],
    match: "all" | "any" = "all",
  ) => ({ enabled: true, match, conditions });

  test("normalizes text case and whitespace while retaining all/any semantics", () => {
    const conditions: Doc<"rules">["conditions"] = [
      { field: "merchant", operator: "equals", value: "  corner   grocery " },
      { field: "statement", operator: "contains", value: "#999" },
    ];
    expect(matchesRule(rule(conditions), transaction, "Corner Grocery")).toBe(
      false,
    );
    expect(
      matchesRule(rule(conditions, "any"), transaction, "Corner Grocery"),
    ).toBe(true);
    expect(
      matchesRule(
        rule([
          { field: "statement", operator: "contains", value: "corner grocery" },
        ]),
        transaction,
        "",
      ),
    ).toBe(true);
  });

  test("compares dollar amounts against stored signed cents", () => {
    expect(
      matchesRule(
        rule([{ field: "amount", operator: "equals", value: "-42.50" }]),
        transaction,
        "",
      ),
    ).toBe(true);
    expect(
      matchesRule(
        rule([{ field: "amount", operator: "less", value: "-40" }]),
        transaction,
        "",
      ),
    ).toBe(true);
    expect(
      matchesRule(
        rule([{ field: "amount", operator: "greater", value: "-40" }]),
        transaction,
        "",
      ),
    ).toBe(false);
    expect(
      matchesRule(
        rule([{ field: "amount", operator: "equals", value: "invalid" }]),
        transaction,
        "",
      ),
    ).toBe(false);
  });

  test("matches account and category IDs and ignores disabled or empty rules", () => {
    const conditions: Doc<"rules">["conditions"] = [
      { field: "account", operator: "equals", value: accountId },
      { field: "category", operator: "equals", value: categoryId },
    ];
    expect(matchesRule(rule(conditions), transaction, "")).toBe(true);
    expect(
      matchesRule({ ...rule(conditions), enabled: false }, transaction, ""),
    ).toBe(false);
    expect(matchesRule(rule([]), transaction, "")).toBe(false);
  });
});
