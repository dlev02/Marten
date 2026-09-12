import { describe, expect, test } from "vitest";
import { utils, write } from "xlsx";
import {
  detectExportFormat,
  importRowKey,
  importTemplateCsv,
  loadImportSheet,
  loadImportSource,
  matchAccount,
  parseImportDate,
  parseImportMoney,
  parseImportReviewed,
  parseImportTags,
  previewBalanceImport,
  previewImport,
  readCsv,
  suggestMapping,
  type ImportOptions,
} from "./transactionImport";

const accounts = [{ _id: "checking", name: "Everyday Checking" }];
const categories = [
  { _id: "other", name: "Uncategorized" },
  { _id: "food", name: "Food" },
];
function options(headers: (string | number | null)[]): ImportOptions {
  return {
    headerRow: 1,
    mapping: suggestMapping(headers),
    amountMode: "signed",
    negativeExpenses: false,
    dateOrder: "mdy",
    accountId: "checking",
    categoryId: "other",
    keepDuplicates: false,
    accountMap: {},
    categoryMap: {},
  };
}
describe("spreadsheet transaction imports", () => {
  test("recognizes a Monarch Money export and maps its columns", async () => {
    const { detectExportFormat, suggestMapping } = await import(
      "./transactionImport"
    );
    const headers = [
      "Date",
      "Merchant",
      "Category",
      "Account",
      "Original Statement",
      "Notes",
      "Amount",
      "Tags",
    ];
    expect(detectExportFormat(headers)).toBe("monarch");
    expect(detectExportFormat(["Date", "Description", "Amount"])).toBeNull();
    expect(suggestMapping(headers)).toMatchObject({
      date: 0,
      merchant: 1,
      category: 2,
      account: 3,
      description: 4,
      notes: 5,
      amount: 6,
    });
  });
  test("CSV reads BOM, quoted commas, escaped quotes, multiline notes, tabs and semicolons", () => {
    expect(
      readCsv(
        '\uFEFFDate,Description,Amount,Notes\r\n2026-09-10,"Cafe, Inc.",12.50,"A ""quoted"" note\nSecond line"\r\n',
      ),
    ).toEqual([
      ["Date", "Description", "Amount", "Notes"],
      ["2026-09-10", "Cafe, Inc.", "12.50", 'A "quoted" note\nSecond line'],
    ]);
    expect(
      readCsv("Date;Description;Amount\n2026-09-10;Cafe;12.50")[1],
    ).toHaveLength(3);
    expect(
      readCsv("Date\tDescription\tAmount\n2026-09-10\tCafe\t12.50")[1],
    ).toHaveLength(3);
    expect(() => readCsv('Date,Description\n2026-09-10,"broken')).toThrow(
      "unclosed",
    );
    expect(() => readCsv('Date,Description\n2026-09-10,"Cafe"extra')).toThrow(
      "closing quote",
    );
  });
  test("currency parsing preserves refunds and rejects ambiguous precision or locale", () => {
    expect(parseImportMoney("$1,234.56")).toBe(123456);
    expect(parseImportMoney("($42.50)")).toBe(-4250);
    expect(parseImportMoney("−42.50")).toBe(-4250);
    expect(parseImportMoney(0.1 + 0.2)).toBe(30);
    for (const invalid of [
      "",
      "1,23",
      "1.234",
      "(-12)",
      "42 USD",
      Infinity,
      1.005,
    ])
      expect(() => parseImportMoney(invalid)).toThrow();
  });
  test("dates use explicit order and both Excel epochs, rejecting invalid calendar days", () => {
    expect(parseImportDate("09/10/2026", "mdy")).toBe("2026-09-10");
    expect(parseImportDate("09/10/2026", "dmy")).toBe("2026-10-09");
    expect(parseImportDate("2026-9-10", "dmy")).toBe("2026-09-10");
    expect(parseImportDate(1, "mdy")).toBe("1900-01-01");
    expect(parseImportDate(61, "mdy")).toBe("1900-03-01");
    expect(parseImportDate(0, "mdy", true)).toBe("1904-01-01");
    expect(parseImportDate(44814.75, "mdy", true)).toBe("2026-09-11");
    for (const invalid of ["2026-02-29", "2/30/2026", "09/10/26", 60, NaN])
      expect(() => parseImportDate(invalid, "mdy")).toThrow();
  });
  test("real XLSX bytes support selecting a sheet, title rows, cached numbers and 1904 dates", async () => {
    const workbook = utils.book_new();
    workbook.Workbook = { WBProps: { date1904: true } };
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([["Read me"], ["Choose Transactions"]]),
      "Instructions",
    );
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["Fictional household export"],
        ["Date", "Description", "Debit", "Credit", "Category"],
        [44813, "Cafe, Inc.", 18.75, null, "Food"],
        [44814, "Refund", null, 5.25, "Unknown"],
      ]),
      "Transactions",
    );
    const bytes = write(workbook, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;
    const source = await loadImportSource(new File([bytes], "household.xlsx"));
    expect(source.sheets).toEqual(["Instructions", "Transactions"]);
    const sheet = await loadImportSheet(source, "Transactions");
    expect(sheet.date1904).toBe(true);
    const config = {
      ...options(sheet.rows[1]),
      headerRow: 2,
      amountMode: "separate" as const,
    };
    const preview = previewImport(sheet, config, accounts, categories);
    expect(preview.rejected).toEqual([]);
    expect(preview.valid).toMatchObject([
      {
        rowNumber: 3,
        date: "2026-09-10",
        amountCents: 1875,
        categoryId: "food",
      },
      {
        rowNumber: 4,
        date: "2026-09-11",
        amountCents: -525,
        categoryId: "other",
        warning: "“Unknown” uses the default category.",
      },
    ]);
  });
  test("preview is read-only, reports each rejected row and protects against account misassignment", () => {
    const rows = readCsv(
      "Date,Description,Amount,Account,Category\n2026-09-10,Cafe,-12.50,Everyday Checking,Food\n2026-02-30,Cafe,5,,\n2026-09-11,Cafe,5,Unknown bank,\n2026-09-11,,5,,",
    );
    const config = { ...options(rows[0]), negativeExpenses: true };
    const preview = previewImport(
      { rows, date1904: false },
      config,
      accounts,
      categories,
    );
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].amountCents).toBe(1250);
    expect(preview.rejected.map((row) => row.rowNumber)).toEqual([3, 4, 5]);
    expect(preview.rejected[1].reason).toContain("Choose the Marten account");
    expect(rows[1][2]).toBe("-12.50");
  });
  test("duplicate keys survive file renaming, row order, category edits and overlapping exports", async () => {
    const rows = readCsv(
      "Date,Description,Amount\n2026-09-10,Cafe,12.50\n2026-09-10, CAFE ,12.50\n2026-09-11,Refund,-5.25",
    );
    const config = options(rows[0]);
    const initial = previewImport(
      { rows, date1904: false },
      config,
      accounts,
      categories,
    );
    expect(initial.valid).toHaveLength(2);
    expect(initial.duplicates).toBe(1);
    const overlap = previewImport(
      { rows: [rows[0], rows[3], rows[1]], date1904: false },
      { ...config, categoryId: "food" },
      accounts,
      categories,
    );
    expect(await importRowKey(initial.valid[0])).toBe(
      await importRowKey(overlap.valid[1]),
    );
    const kept = previewImport(
      { rows, date1904: false },
      { ...config, keepDuplicates: true },
      accounts,
      categories,
    );
    expect(kept.valid).toHaveLength(3);
    expect(await importRowKey(kept.valid[0])).not.toBe(
      await importRowKey(kept.valid[1]),
    );
  });
  test("separate debit and credit columns reject ambiguous amounts and missing column mapping", () => {
    const rows = readCsv(
      "Date,Description,Debit,Credit\n2026-09-10,Cafe,10,5\n2026-09-10,Cafe,-10,\n2026-09-10,Cafe,,",
    );
    const config = { ...options(rows[0]), amountMode: "separate" as const };
    expect(
      previewImport({ rows, date1904: false }, config, accounts, categories)
        .rejected,
    ).toHaveLength(3);
    expect(
      previewImport(
        { rows, date1904: false },
        options(rows[0]),
        accounts,
        categories,
      ).error,
    ).toContain("Map");
  });
  test("unsupported files and oversized inputs have clear limits", async () => {
    await expect(
      loadImportSource(new File(["old"], "old.xls")),
    ).rejects.toThrow("save a copy as .xlsx");
    await expect(
      loadImportSource(
        new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.csv"),
      ),
    ).rejects.toThrow("25 MB");
    const rows = [
      ["Date", "Description", "Amount"],
      ...Array.from({ length: 50001 }, () => ["2026-09-10", "Cafe", "12.50"]),
    ];
    expect(
      previewImport(
        { rows, date1904: false },
        options(rows[0]),
        accounts,
        categories,
      ).error,
    ).toContain("50,000");
  });
});

describe("Monarch Money exports", () => {
  const monarchAccounts = [
    { _id: "venture", name: "Venture X", mask: "2480", kind: "credit" },
    { _id: "blue", name: "Blue Cash Everyday", mask: "4008", kind: "credit" },
    {
      _id: "atmos",
      name: "Atmos Rewards Ascent Visa Signature",
      mask: "9617",
      kind: "credit",
    },
  ];
  const monarchCategories = [
    { _id: "other", name: "Uncategorized" },
    { _id: "amazon", name: "Amazon" },
    { _id: "groceries", name: "Groceries" },
  ];
  const transactionsCsv = [
    "Date\tMerchant\tCategory\tAccount\tOriginal Statement\tNotes\tAmount\tTags\tOwner\tReviewed\tId",
    "2026-09-10\tAmazon\tAmazon\tVenture X (...2480)\tAMAZON MKTPL*534KW6IC2\tGift for mom\t-32.79\tGifts, Family\tShared\t\t254598028972142820",
    "2026-09-10\tAmazon\tAmazon\tVenture X (...2480)\tAMAZON MKTPL*534KW6IC2\t\t-32.79\t\tShared\tReviewed\t254507665378914343",
    "2026-09-09\tTrader Joe's\tGroceries\tAtmos Rewards Ascent Visa Signature (...9617)\tTRADER JOE S #723\t\t-86.27\t\tShared\t\t254459782015365625",
    "2026-09-11\tAnthropic\tAI Assistants\tBlue Cash Everyday (...4008)\tANTHROPIC PBC\t\t-100.00\t\tShared\t\t254653633648800651",
    "2026-09-11\tAnthropic\tAI Assistants\tBlue Cash Everyday (...4008)\tANTHROPIC PBC\t\t-100.00\t\tShared\t\t254653633648800651",
    "",
  ].join("\n");
  test("every transaction column survives: accounts by last digits, tags, review state, and IDs", async () => {
    const rows = readCsv(transactionsCsv);
    const headers = rows[0];
    expect(detectExportFormat(headers)).toBe("monarch");
    expect(suggestMapping(headers)).toMatchObject({
      tags: 7,
      reviewed: 9,
      id: 10,
    });
    const preview = previewImport(
      { rows, date1904: false },
      { ...options(headers), negativeExpenses: true },
      monarchAccounts,
      monarchCategories,
    );
    expect(preview.error).toBe("");
    expect(preview.rejected).toEqual([]);
    // The repeated Monarch ID is the only duplicate; two identical Amazon
    // purchases with different IDs both import.
    expect(preview.duplicates).toBe(1);
    expect(preview.valid).toHaveLength(4);
    expect(preview.valid[0]).toMatchObject({
      accountId: "venture",
      categoryId: "amazon",
      categoryMatched: true,
      merchantName: "Amazon",
      originalName: "AMAZON MKTPL*534KW6IC2",
      amountCents: 3279,
      notes: "Gift for mom",
      tags: ["Gifts", "Family"],
      reviewed: false,
    });
    expect(preview.valid[1]).toMatchObject({ reviewed: true, tags: [] });
    expect(preview.valid[0].fingerprint).not.toBe(preview.valid[1].fingerprint);
    expect(preview.valid[2]).toMatchObject({
      accountId: "atmos",
      categoryId: "groceries",
      amountCents: 8627,
    });
    expect(preview.valid[3]).toMatchObject({
      accountId: "blue",
      categoryId: "other",
      categoryMatched: false,
      warning: "“AI Assistants” uses the default category.",
    });
    expect(preview.accountNames).toEqual([
      { name: "Venture X (...2480)", id: "venture", rows: 2, automatic: true },
      {
        name: "Atmos Rewards Ascent Visa Signature (...9617)",
        id: "atmos",
        rows: 1,
        automatic: true,
      },
      {
        name: "Blue Cash Everyday (...4008)",
        id: "blue",
        rows: 2,
        automatic: true,
      },
    ]);
    expect(preview.categoryNames).toContainEqual({
      name: "AI Assistants",
      id: "",
      rows: 2,
      automatic: true,
    });
    const keys = await Promise.all(preview.valid.map(importRowKey));
    expect(new Set(keys).size).toBe(4);
    // Choices made in the preview override the automatic matches.
    const chosen = previewImport(
      { rows, date1904: false },
      {
        ...options(headers),
        negativeExpenses: true,
        categoryMap: { "AI Assistants": "groceries" },
        accountMap: { "Venture X (...2480)": "" },
      },
      monarchAccounts,
      monarchCategories,
    );
    expect(chosen.valid).toHaveLength(2);
    expect(chosen.valid[1]).toMatchObject({
      categoryId: "groceries",
      categoryMatched: true,
      warning: undefined,
    });
    expect(chosen.rejected).toHaveLength(2);
    expect(chosen.rejected[0].reason).toContain("Choose the Marten account");
    expect(chosen.accountNames[0]).toMatchObject({ id: "", automatic: false });
  });
  test("account labels match by full name, name without suffix, and last digits", () => {
    expect(matchAccount("Venture X (...2480)", monarchAccounts)).toBe(
      "venture",
    );
    expect(matchAccount("venture x", monarchAccounts)).toBe("venture");
    expect(matchAccount("Coinbase", [{ _id: "c", name: "Coinbase" }])).toBe(
      "c",
    );
    expect(
      matchAccount("Sapphire Preferred (...7920)", [
        { _id: "s", name: "Chase Sapphire Preferred", mask: "7920" },
        { _id: "f", name: "Freedom", mask: "1111" },
      ]),
    ).toBe("s");
    expect(
      matchAccount("Discover Checking (...4663)", [
        { _id: "a", name: "Checking", mask: "4663" },
        { _id: "b", name: "Savings", mask: "4663" },
      ]),
    ).toBe("a");
    expect(
      matchAccount("Checking (...1111)", [
        { _id: "a", name: "Everyday", mask: "1111" },
        { _id: "b", name: "Other", mask: "1111" },
      ]),
    ).toBe("");
    expect(matchAccount("Unknown", monarchAccounts)).toBe("");
    expect(parseImportTags("Travel, travel; Reimbursable | ")).toEqual([
      "Travel",
      "Reimbursable",
    ]);
    expect(parseImportReviewed("Reviewed")).toBe(true);
    expect(parseImportReviewed("")).toBe(false);
  });
  test("a balance export maps each account, inverts debts, and keeps one balance per day", () => {
    const rows = readCsv(
      [
        "Date\tBalance\tAccount",
        "2025-02-10\t-11351.26\tSapphire Preferred (...7920)",
        "2025-02-10\t61.13\tDiscover Checking (...4663)",
        "2025-02-10\t69.00\tCoinbase",
        "2025-02-11\t70.00\tCoinbase",
        "2025-02-11\t71.00\tCoinbase",
        "2025-02-12\tabc\tCoinbase",
        "",
      ].join("\n"),
    );
    expect(detectExportFormat(rows[0])).toBe("monarch-balances");
    expect(detectExportFormat(["Date", "Balance"])).toBeNull();
    const accounts = [
      {
        _id: "sapphire",
        name: "Sapphire Preferred",
        mask: "7920",
        kind: "credit",
      },
      {
        _id: "checking",
        name: "Discover Checking",
        mask: "4663",
        kind: "cash",
      },
      { _id: "coin", name: "Coinbase", kind: "asset" },
    ];
    const settings = {
      headerRow: 1,
      dateOrder: "mdy" as const,
      accountMap: {},
      invertDebts: true,
    };
    const preview = previewBalanceImport(
      { rows, date1904: false },
      settings,
      accounts,
    );
    expect(preview.error).toBe("");
    expect(preview.valid).toEqual([
      {
        rowNumber: 2,
        accountId: "sapphire",
        date: "2025-02-10",
        balanceCents: 1135126,
      },
      {
        rowNumber: 3,
        accountId: "checking",
        date: "2025-02-10",
        balanceCents: 6113,
      },
      {
        rowNumber: 4,
        accountId: "coin",
        date: "2025-02-10",
        balanceCents: 6900,
      },
      {
        rowNumber: 5,
        accountId: "coin",
        date: "2025-02-11",
        balanceCents: 7100,
      },
    ]);
    expect(preview.rejected).toEqual([
      {
        rowNumber: 7,
        description: "Coinbase",
        reason: "Use a number such as 42.50, $1,234.56, or (42.50).",
      },
    ]);
    const skipped = previewBalanceImport(
      { rows, date1904: false },
      { ...settings, accountMap: { Coinbase: "" } },
      accounts,
    );
    expect(skipped.valid).toHaveLength(2);
    expect(skipped.skipped).toBe(3);
    expect(skipped.accountNames.find((a) => a.name === "Coinbase")).toEqual({
      name: "Coinbase",
      id: "",
      rows: 4,
      automatic: false,
    });
  });
});

describe("import template", () => {
  test("the downloadable template maps every column and previews cleanly", () => {
    const rows = readCsv(importTemplateCsv());
    const headers = rows[0];
    expect(detectExportFormat(headers)).toBeNull();
    const mapping = suggestMapping(headers);
    expect(Object.values(mapping).every((index) => index >= 0)).toBe(false);
    expect(mapping).toMatchObject({
      date: 0,
      description: 1,
      amount: 2,
      merchant: 3,
      category: 4,
      account: 5,
      notes: 6,
      tags: 7,
      reviewed: 8,
      id: 9,
    });
    const preview = previewImport(
      { rows, date1904: false },
      options(headers),
      [
        { _id: "checking", name: "Everyday Checking" },
        { _id: "travel", name: "Travel Card" },
      ],
      [
        { _id: "other", name: "Uncategorized" },
        { _id: "groceries", name: "Groceries" },
        { _id: "paycheck", name: "Paycheck" },
        { _id: "shopping", name: "Shopping" },
      ],
    );
    expect(preview.rejected).toEqual([]);
    expect(preview.valid.map((row) => row.amountCents)).toEqual([
      8627, -250000, 3279,
    ]);
    expect(preview.valid[2]).toMatchObject({
      accountId: "travel",
      categoryId: "shopping",
      tags: ["Gifts", "Family"],
      notes: "Gift for a friend",
    });
    expect(preview.valid[0].reviewed).toBe(true);
  });
});

describe("large exports", () => {
  test("reads and previews 50,000 CSV transactions without dropping the tail", async () => {
    const csv =
      "Date,Description,Amount,Id\n" +
      Array.from(
        { length: 50_000 },
        (_, i) => `2026-09-10,Cafe,12.50,${i}`,
      ).join("\n");
    const source = await loadImportSource(new File([csv], "large.csv"));
    const sheet = await loadImportSheet(source, "CSV");
    const result = previewImport(
      sheet,
      options(sheet.rows[0]),
      accounts,
      categories,
    );
    expect(result.error).toBe("");
    expect(result.valid).toHaveLength(50_000);
    expect(result.valid[49_999].rowNumber).toBe(50_001);
    expect(result.rejected).toHaveLength(0);
  });
  test("reads 50,000 Monarch balance rows through the shared CSV reader", async () => {
    const csv =
      "Date,Balance,Account\n" +
      Array.from(
        { length: 50_000 },
        (_, i) =>
          `${new Date(Date.UTC(1900, 0, i + 1)).toISOString().slice(0, 10)},${i},Everyday Checking`,
      ).join("\n");
    const source = await loadImportSource(new File([csv], "balances.csv"));
    const sheet = await loadImportSheet(source, "CSV");
    const result = previewBalanceImport(
      sheet,
      { headerRow: 1, dateOrder: "mdy", accountMap: {}, invertDebts: true },
      accounts,
    );
    expect(result.valid).toHaveLength(50_000);
    expect(result.valid[49_999].balanceCents).toBe(4_999_900);
  });
  test("XLSX accepts more than 5,000 rows and rejects oversized sheets", async () => {
    for (const count of [6000, 50052]) {
      const book = utils.book_new();
      utils.book_append_sheet(
        book,
        utils.aoa_to_sheet([
          ["Date", "Description", "Amount"],
          ...Array.from({ length: count }, () => ["2026-09-10", "Cafe", 12.5]),
        ]),
        "Import data",
      );
      const source = await loadImportSource(
        new File(
          [write(book, { type: "array", bookType: "xlsx" })],
          "history.xlsx",
        ),
      );
      if (count === 6000)
        expect(
          (await loadImportSheet(source, "Import data")).rows,
        ).toHaveLength(6001);
      else
        await expect(loadImportSheet(source, "Import data")).rejects.toThrow(
          "50,000",
        );
    }
  });
});
