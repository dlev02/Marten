import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import type { Metadata } from "../src/lib/types";
import { summarize } from "../src/lib/reporting";
const owner = { userId: "sample-user" as Id<"users">, _creationTime: 0 };
const incomeGroup = "income-group" as Id<"groups">,
  expenseGroup = "expense-group" as Id<"groups">,
  transferGroup = "transfer-group" as Id<"groups">;
const incomeCategory = "income-category" as Id<"categories">,
  expenseCategory = "expense-category" as Id<"categories">,
  transferCategory = "transfer-category" as Id<"categories">;
const merchantId = "sample-merchant" as Id<"merchants">;
const data: Metadata = {
  profile: null,
  accounts: [],
  groups: [
    { ...owner, _id: incomeGroup, name: "Income", kind: "income", order: 0 },
    {
      ...owner,
      _id: expenseGroup,
      name: "Expenses",
      kind: "expense",
      order: 1,
    },
    {
      ...owner,
      _id: transferGroup,
      name: "Transfers",
      kind: "transfer",
      order: 2,
    },
  ],
  categories: [
    {
      ...owner,
      _id: incomeCategory,
      groupId: incomeGroup,
      name: "Paycheck",
      emoji: "$",
      order: 0,
      enabled: true,
    },
    {
      ...owner,
      _id: expenseCategory,
      groupId: expenseGroup,
      name: "Groceries",
      emoji: "G",
      order: 0,
      enabled: true,
    },
    {
      ...owner,
      _id: transferCategory,
      groupId: transferGroup,
      name: "Transfer",
      emoji: "T",
      order: 0,
      enabled: true,
    },
  ],
  merchants: [
    {
      ...owner,
      _id: merchantId,
      name: "Sample merchant",
      normalizedName: "sample merchant",
      color: "#123456",
      transactionCount: 0,
      resolvedLogoUrl: null,
    },
  ],
  tags: [],
  rules: [],
  recurring: [],
  savedReports: [],
  institutions: [],
};
const tx = (patch: Partial<Doc<"transactions">> = {}): Doc<"transactions"> => ({
  ...owner,
  _id: "sample-transaction" as Id<"transactions">,
  accountId: "sample-account" as Id<"accounts">,
  merchantId,
  categoryId: expenseCategory,
  date: "2026-09-10",
  amountCents: 1000,
  originalName: "SAMPLE TRANSACTION",
  notes: "",
  tagIds: [],
  hidden: false,
  pending: false,
  reviewed: false,
  splits: [],
  source: "sample",
  searchText: "sample",
  updatedAt: 0,
  editedFields: [],
  ...patch,
});

describe("report reconciliation", () => {
  test("a category filter counts only matching split allocations and refunds in every grouping", () => {
    const selectedCategory = "selected-expense" as Id<"categories">;
    const filteredData: Metadata = {
      ...data,
      categories: [
        ...data.categories,
        { ...data.categories[1], _id: selectedCategory, name: "Travel" },
      ],
    };
    const transactions = [
      tx({
        amountCents: 10000,
        splits: [
          { categoryId: selectedCategory, amountCents: 3000 },
          { categoryId: expenseCategory, amountCents: 6000 },
          { categoryId: transferCategory, amountCents: 1000 },
        ],
      }),
      tx({
        amountCents: -2000,
        splits: [
          { categoryId: selectedCategory, amountCents: -500 },
          { categoryId: expenseCategory, amountCents: -1500 },
        ],
      }),
      tx({ amountCents: 1000 }),
    ];
    for (const grouping of ["category", "merchant", "group"]) {
      const result = summarize(
        transactions,
        filteredData,
        grouping,
        selectedCategory,
      );
      expect(result).toMatchObject({
        income: 0,
        expense: 2500,
        savings: -2500,
      });
      expect(result.spending).toHaveLength(1);
      expect(result.spending[0]).toMatchObject({ value: 2500, count: 2 });
      expect(result.months).toHaveLength(1);
      expect(result.months[0]).toMatchObject({
        month: "2026-09",
        expense: 2500,
        income: 0,
      });
      expect(result.earnings).toHaveLength(0);
    }
  });
  test("counts income, refunds and mixed-category splits exactly once while excluding transfers", () => {
    const result = summarize(
      [
        tx({ categoryId: incomeCategory, amountCents: -100000 }),
        tx({ amountCents: 20000 }),
        tx({ amountCents: -5000 }),
        tx({ categoryId: transferCategory, amountCents: 30000 }),
        tx({
          amountCents: 10000,
          splits: [
            { categoryId: expenseCategory, amountCents: 7500 },
            { categoryId: transferCategory, amountCents: 2500 },
          ],
        }),
      ],
      data,
    );
    expect(result).toMatchObject({
      income: 100000,
      expense: 22500,
      savings: 77500,
      rate: 77.5,
    });
    expect(result.spending).toHaveLength(1);
    expect(result.spending[0]).toMatchObject({
      name: "Groceries",
      value: 22500,
      count: 3,
    });
    expect(result.earnings[0]).toMatchObject({ value: 100000, count: 1 });
  });
  test("excludes pending, hidden and provider-removed transactions from every breakdown", () => {
    const result = summarize(
      [
        tx({ pending: true }),
        tx({ hidden: true }),
        tx({ removedFromBank: true }),
        tx(),
      ],
      data,
    );
    expect(result.expense).toBe(1000);
    expect(result.spending[0].count).toBe(1);
    expect(result.months).toHaveLength(1);
    expect(result.months[0].expense).toBe(1000);
  });
  test("retains year-month identity and changes grouping without changing totals", () => {
    const transactions = [
      tx({ date: "2025-01-01", amountCents: 1000 }),
      tx({ date: "2026-01-01", amountCents: 2000 }),
      tx({
        date: "2026-02-01",
        categoryId: incomeCategory,
        amountCents: -5000,
      }),
    ];
    const byCategory = summarize(transactions, data),
      byGroup = summarize(transactions, data, "group"),
      byMerchant = summarize(transactions, data, "merchant");
    expect(byCategory.months.map((month) => month.month)).toEqual([
      "2025-01",
      "2026-01",
      "2026-02",
    ]);
    for (const result of [byCategory, byGroup, byMerchant])
      expect(result).toMatchObject({
        income: 5000,
        expense: 3000,
        savings: 2000,
        rate: 40,
      });
    expect(byGroup.spending[0].name).toBe("Expenses");
    expect(byMerchant.spending[0].name).toBe("Sample merchant");
  });
  test("uses the posted parent amount when old allocations await reconciliation", () => {
    const result = summarize(
      [
        tx({
          amountCents: 1200,
          splitDraft: [
            { categoryId: expenseCategory, amountCents: 500 },
            { categoryId: expenseCategory, amountCents: 500 },
          ],
        }),
      ],
      data,
    );
    expect(result.expense).toBe(1200);
  });
});
