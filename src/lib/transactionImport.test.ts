import { describe, expect, test } from "vitest";
import { utils, write } from "xlsx";
import {
  importRowKey,
  loadImportSheet,
  loadImportSource,
  parseImportDate,
  parseImportMoney,
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
  };
}
describe("spreadsheet transaction imports", () => {
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
    expect(preview.rejected[1].reason).toContain("does not match");
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
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.csv"),
      ),
    ).rejects.toThrow("5 MB");
    const rows = [
      ["Date", "Description", "Amount"],
      ...Array.from({ length: 5001 }, () => ["2026-09-10", "Cafe", "12.50"]),
    ];
    expect(
      previewImport(
        { rows, date1904: false },
        options(rows[0]),
        accounts,
        categories,
      ).error,
    ).toContain("5,000");
  });
});
