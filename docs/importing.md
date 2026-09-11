# Transaction imports

Open **Transactions → Transaction tools → Import Excel or CSV**. Choose a file, select its worksheet and header row, match the columns, and review the ready and rejected rows. Nothing is saved until you select **Import ready rows**.

## File and column support

- Excel `.xlsx` and UTF-8 `.csv`, up to 5 MB, 5,000 transaction rows, and 100 columns. Headers can be on any of the first 50 rows. For older `.xls` files, save a copy as `.xlsx` first.
- CSV supports comma, tab, and semicolon delimiters, quoted fields, escaped quotes, multiline notes, and a byte order mark. Malformed quotes produce an error.
- Required columns: date, description, and either one amount column or separate money-out/debit and money-in/credit columns.
- Optional columns: merchant, category, account, and notes. Without a merchant column, the description becomes the merchant name. Merchant names are limited to 120 characters; descriptions to 500 and notes to 10,000.
- Account and category names match Marten names without case or repeated-space differences. Unknown or ambiguous account names are rejected to avoid assigning transactions to the wrong account. Remove the Account mapping to assign every row to the selected default account. Blank accounts use the default. Unknown or ambiguous categories use the selected default category and show a warning in the preview.
- The general mapping flow does not assume a particular household spreadsheet layout. A specific family spreadsheet can be accommodated after its actual columns are supplied.

## Dates and amounts

The preview uses Marten's stored convention: **positive expenses, negative income and refunds**. If a bank export uses negative expenses, choose **Expenses are negative** to invert its signed amount column. Separate debit/credit columns must contain nonnegative amounts, with at most one nonzero value in each row.

Amounts accept numbers, US dollar formatting such as `$1,234.56`, and negative values in parentheses such as `(42.50)`. More than two decimal places, malformed separators, and unsupported currency text are rejected. Marten currently uses USD; importing does not convert currencies.

Dates accept `YYYY-MM-DD`, dates with a four-digit year in the selected month/day or day/month order, and numeric Excel dates using the workbook's 1900 or 1904 date system. Impossible calendar dates are rejected. Excel date cells may contain a time component; the date is retained. Formulas are not executed: only stored cell values are read, so recalculate and save the workbook if formula-derived cells lack cached values.

## Duplicates, retries, and balances

The importer compares account, date, normalized original description, and amount. Identical rows within a file are skipped by default. **Keep identical rows within this file** preserves multiple occurrences when they represent separate purchases.

Each row receives a stable hash and occurrence number, independent of the file name, sheet name, row order, category, and notes. Repeating a spreadsheet import or importing an overlapping export skips keys already saved by this importer. The final result reports those skips. Different accounts are distinct. Transactions added manually, synchronized from a bank, or inserted through the earlier fixed-column CSV API are not compared by this importer. An additional identical purchase in a later file cannot be distinguished from an already imported purchase without a source transaction ID; add that purchase manually if needed.

Rows are saved in atomic batches of at most 100 and approximately 400 KB of row payload. A failed batch leaves no partial transactions or empty merchants. Earlier completed batches remain saved; a retry skips those rows. Only ready rows are sent. Rejected rows remain excluded until the file or mapping is corrected.

Saved transaction rules run during import. Original descriptions and notes remain available. Importing transactions does **not** change account balances or historical balance entries. Use the separate account balance history import when historical balances are needed.

The workbook is parsed in the browser and is not uploaded or stored as a file. Only the selected, validated transaction fields are sent to the authenticated workspace mutation. Account and category ownership are checked server-side, as are dates, integer-cent amounts, and text limits.

## Implementation and verification

- UI: `src/features/transactions/TransactionImport.tsx`; entry point re-exported by `TransactionForms.tsx`.
- Parsing and preview: `src/lib/transactionImport.ts`; SheetJS is dynamically imported for Excel files. The dependency is pinned to official `xlsx-0.20.3.tgz`, following [SheetJS installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/). Reading uses bounded rows and a selected sheet, following [parse options](https://docs.sheetjs.com/docs/api/parse-options/), and respects [Excel date systems](https://docs.sheetjs.com/docs/csf/features/dates/).
- Mutation: `transactions.importMapped`; stable keys reuse the existing per-user import index. No schema change is required.
- Focused verification: `npx vitest run src/lib/transactionImport.test.ts convex/accounts.test.ts` — **19 tests passed**. Includes real XLSX bytes, both date systems, quoted CSV, refunds, duplicate keys, file limits, account ownership, batch rollback, rule application, and unchanged balances. App TypeScript and ESLint for changed TypeScript files passed.

Browser QA used a separate fictional **Morgan QA** sample workspace through Aside on September 10, 2026. A two-sheet XLSX with a title row produced two ready rows ($18.75 expense and -$5.25 refund), one rejected impossible date, and one skipped duplicate. Toggling duplicate retention changed the ready count from two to three and back without resizing the preview table. Import saved two rows. Retrying saved zero and skipped the same two existing rows. A quoted CSV with negative expenses was mapped to $23.45 expense and -$4.50 refund and saved two rows.

Screenshots in the Aside QA session:

- `import-excel-mapping.png`
- `import-excel-preview.png`
- `import-excel-rejected.png`
- `import-excel-result.png`
- `import-excel-retry.png`
- `import-csv-result.png`

These checks use synthetic files; the specific family spreadsheet format remains to be provided.
