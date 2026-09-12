import { describe, expect, test } from "vitest";
import { planImport, newImportId, suggestImportCategory } from "./importPlan";
import { suggestMapping, type ImportOptions } from "./transactionImport";
const headers = [
  "Date",
  "Merchant",
  "Category",
  "Account",
  "Original Statement",
  "Notes",
  "Amount",
  "Tags",
  "Owner",
  "Reviewed",
  "Id",
];
const options: ImportOptions = {
  headerRow: 1,
  mapping: suggestMapping(headers),
  amountMode: "signed",
  negativeExpenses: true,
  dateOrder: "mdy",
  accountId: "",
  categoryId: "other",
  keepDuplicates: false,
  accountMap: {},
  categoryMap: {},
};
const categories = [{ _id: "other", name: "Uncategorized" }];
const choices = { accounts: {}, categories: {} };
const row = (account: string, category: string, id = account) => [
  "2026-09-01",
  "Cafe",
  category,
  account,
  "CAFE ORIGINAL",
  "My note",
  "-12.50",
  "Travel",
  "",
  "yes",
  id,
];
describe("import destination planning", () => {
  test("missing historical accounts and named categories are ready without fallback reassignment", () => {
    const result = planImport(
      {
        rows: [
          headers,
          row("USAA (closed)", "Convenience stores"),
          row("Apple Card", "Video games"),
        ],
        date1904: false,
      },
      options,
      [],
      categories,
      choices,
    );
    expect(result.preview?.rejected).toEqual([]);
    expect(result.preview?.valid).toHaveLength(2);
    expect(result.newAccounts).toContainEqual({
      name: "USAA (closed)",
      kind: "cash",
      closed: true,
    });
    expect(result.newAccounts).toContainEqual({
      name: "Apple Card",
      kind: "credit",
      closed: false,
    });
    expect(result.newCategories).toContainEqual({
      name: "Video games",
      kind: "expense",
      emoji: "🎮",
    });
    expect(result.preview?.valid[0]).toMatchObject({
      categoryMatched: true,
      merchantName: "Cafe",
      originalName: "CAFE ORIGINAL",
      amountCents: 1250,
      notes: "My note",
      tags: ["Travel"],
      reviewed: true,
    });
  });
  test("existing accounts, archived aliases and exact categories are reused", () => {
    const result = planImport(
      { rows: [headers, row("Old card (...1234)", "Hotels")], date1904: false },
      options,
      [{ _id: "card", name: "Renamed", importName: "old card (...1234)" }],
      [...categories, { _id: "hotels", name: "Hotels" }],
      choices,
    );
    expect(result.newAccounts).toEqual([]);
    expect(result.newCategories).toEqual([]);
    expect(result.preview?.valid[0]).toMatchObject({
      accountId: "card",
      categoryId: "hotels",
    });
  });
  test("explicit destinations win and category type/icon choices are retained", () => {
    const sheet = {
      rows: [headers, row("Apple Card", "Custom")],
      date1904: false,
    };
    const result = planImport(
      sheet,
      { ...options, accountMap: { "Apple Card": "owned" } },
      [{ _id: "owned", name: "Different card" }],
      categories,
      {
        accounts: {},
        categories: { Custom: { emoji: "↔️", kind: "transfer" } },
      },
    );
    expect(result.newAccounts).toEqual([]);
    expect(result.newCategories).toEqual([
      { name: "Custom", emoji: "↔️", kind: "transfer" },
    ]);
  });
  test("normalized repeated labels share one destination without rejecting valid rows", () => {
    const result = planImport(
      {
        rows: [
          headers,
          row("Apple Card", "Hotels", "1"),
          row("apple card", "hotels", "2"),
        ],
        date1904: false,
      },
      options,
      [],
      categories,
      choices,
    );
    expect(result.preview?.valid).toHaveLength(2);
    expect(new Set(result.preview?.valid.map((r) => r.accountId)).size).toBe(1);
  });
  test("invalid data remains rejected and creates no empty destinations", () => {
    const bad = row("Apple Card", "Hotels");
    bad[0] = "2026-02-30";
    const result = planImport(
      { rows: [headers, bad], date1904: false },
      options,
      [],
      categories,
      choices,
    );
    expect(result.preview?.rejected).toHaveLength(1);
    expect(result.newAccounts).toEqual([]);
    expect(result.newCategories).toEqual([]);
  });
  test("new credit account balance imports invert debts and honor closed status", () => {
    const result = planImport(
      {
        rows: [
          ["Date", "Balance", "Account"],
          ["2026-09-01", "-100", "Apple Card"],
        ],
        date1904: false,
      },
      options,
      [],
      categories,
      {
        accounts: { "Apple Card": { kind: "credit", closed: true } },
        categories: {},
      },
    );
    expect(result.balancePreview?.valid[0]).toMatchObject({
      accountId: newImportId("Apple Card"),
      balanceCents: 10000,
    });
    expect(result.newAccounts[0].closed).toBe(true);
  });
  test("income and transfers use category meaning, with editable safe fallback", () => {
    expect(suggestImportCategory("Credit Card Payment").kind).toBe("transfer");
    expect(suggestImportCategory("Salary").kind).toBe("income");
    expect(suggestImportCategory("Unknown custom name")).toMatchObject({
      kind: "expense",
      emoji: "📁",
    });
    expect(suggestImportCategory("Hotels").emoji).toBe("🏨");
  });
});
test("50,000 rows keep destination planning bounded by distinct names", () => {
  const sheet = {
    date1904: false,
    rows: [
      headers,
      ...Array.from({ length: 50_000 }, (_, i) =>
        row("Old Visa (...1234)", "Hotels", String(i)),
      ),
    ],
  };
  const result = planImport(sheet, options, [], categories, choices);
  expect(result.preview?.valid).toHaveLength(50_000);
  expect(result.newAccounts).toHaveLength(1);
  expect(result.newCategories).toHaveLength(1);
});
test("excessive distinct names fail before rendering thousands of pickers", () => {
  const result = planImport(
    {
      date1904: false,
      rows: [
        headers,
        ...Array.from({ length: 201 }, (_, i) => row(`Account ${i}`, "Hotels")),
      ],
    },
    options,
    [],
    categories,
    choices,
  );
  expect(result.preview?.error).toContain("200 account names");
  expect(result.newAccounts).toEqual([]);
});
test("a Monarch manual entry without original statement retains the merchant as description", () => {
  const manual = row("Apple Cash", "Hotels");
  manual[4] = "";
  const result = planImport(
    { date1904: false, rows: [headers, manual] },
    options,
    [],
    categories,
    choices,
  );
  expect(result.preview?.valid[0]).toMatchObject({
    originalName: "Cafe",
    merchantName: "Cafe",
  });
});
