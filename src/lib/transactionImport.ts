export type ImportCell = string | number | null;
export type ImportSource = {
  name: string;
  sheets: string[];
  bytes?: ArrayBuffer;
  rows?: ImportCell[][];
};
export type ImportSheet = { rows: ImportCell[][]; date1904: boolean };
export type ImportMapping = Record<
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "merchant"
  | "category"
  | "account"
  | "notes"
  | "tags"
  | "reviewed"
  | "id",
  number
>;
export type ImportOptions = {
  headerRow: number;
  mapping: ImportMapping;
  amountMode: "signed" | "separate";
  negativeExpenses: boolean;
  dateOrder: "mdy" | "dmy";
  accountId: string;
  categoryId: string;
  keepDuplicates: boolean;
  /** Account name in the file → Marten account id chosen in the preview. */
  accountMap: Record<string, string>;
  /** Category name in the file → Marten category id ("" keeps the default). */
  categoryMap: Record<string, string>;
};
export type ImportLookup = {
  _id: string;
  name: string;
  mask?: string;
  importName?: string;
  kind?: string;
};
export type ReadyImportRow = {
  rowNumber: number;
  accountId: string;
  categoryId: string;
  /** True when the file named a category that maps to a Marten category. */
  categoryMatched: boolean;
  merchantName: string;
  date: string;
  amountCents: number;
  originalName: string;
  notes: string;
  tags: string[];
  reviewed: boolean;
  fingerprint: string;
  warning?: string;
};
/** A distinct account or category name seen in the file and where it lands. */
export type ImportNameMatch = {
  name: string;
  id: string;
  rows: number;
  automatic: boolean;
};
export const MAX_IMPORT_ROWS = 50_000;
const MAX_SHEET_ROWS = MAX_IMPORT_ROWS + 51;
const normalized = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
const cellText = (value: ImportCell | undefined) => String(value ?? "").trim();

export function readCsv(contents: string): ImportCell[][] {
  const text = contents.replace(/^\uFEFF/, "");
  const sample = text.slice(0, 65536).split(/\r?\n/).slice(0, 12).join("\n");
  const delimiters = [",", "\t", ";"].map((value) => ({ value, count: 0 }));
  let inQuotes = false;
  for (const char of sample) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      const candidate = delimiters.find((item) => item.value === char);
      if (candidate) candidate.count++;
    }
  }
  const delimiter = delimiters.sort((a, b) => b.count - a.count)[0].value;
  const rows: ImportCell[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  function finishCell() {
    row.push(value);
    value = "";
    closed = false;
    if (row.length > 100)
      throw new Error("Use a file with at most 100 columns.");
  }
  function finishRow() {
    finishCell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_SHEET_ROWS)
      throw new Error("Import at most 50,000 rows per file.");
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else value += char;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (char === delimiter) finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else if (closed && !/\s/.test(char))
      throw new Error(
        `Row ${rows.length + 1}: unexpected text after a closing quote.`,
      );
    else if (!closed) value += char;
  }
  if (quoted)
    throw new Error(
      "The CSV has an unclosed quoted field. Export it again and retry.",
    );
  if (value || row.length || closed) finishRow();
  return rows;
}

export async function loadImportSource(file: File): Promise<ImportSource> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose a file up to 25 MB.");
  if (/\.csv$/i.test(file.name))
    return {
      name: file.name,
      sheets: ["CSV"],
      rows: readCsv(await file.text()),
    };
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "Choose an .xlsx or .csv file. For older .xls files, save a copy as .xlsx first.",
    );
  const bytes = await file.arrayBuffer();
  const { read } = await import("xlsx");
  const workbook = read(bytes, {
    bookSheets: true,
    cellHTML: false,
    cellFormula: false,
  });
  if (!workbook.SheetNames.length)
    throw new Error("This workbook does not contain a worksheet.");
  return { name: file.name, sheets: workbook.SheetNames, bytes };
}

export async function loadImportSheet(
  source: ImportSource,
  sheet: string,
): Promise<ImportSheet> {
  if (source.rows) return { rows: source.rows, date1904: false };
  const { read, utils } = await import("xlsx");
  const workbook = read(source.bytes, {
    sheets: sheet,
    sheetRows: MAX_SHEET_ROWS,
    dense: true,
    cellHTML: false,
    cellFormula: false,
    cellText: false,
    cellDates: false,
  });
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error("That worksheet is unavailable.");
  const range = utils.decode_range(
    worksheet["!fullref"] ?? worksheet["!ref"] ?? "A1",
  );
  if (range.e.r >= MAX_SHEET_ROWS)
    throw new Error(
      "Use a worksheet with at most 50,000 rows and 50 header rows.",
    );
  if (range.e.c >= 100)
    throw new Error("Use a worksheet with at most 100 columns.");
  const rows = utils.sheet_to_json<ImportCell[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
    range: 0,
  });
  return { rows, date1904: !!workbook.Workbook?.WBProps?.date1904 };
}

/**
 * A small CSV showing every column the importer understands, in Marten's
 * default convention (expenses positive, income negative). Offered as a
 * download beside the format guide in the import dialog.
 */
export function importTemplateCsv() {
  const rows = [
    [
      "Date",
      "Description",
      "Amount",
      "Merchant",
      "Category",
      "Account",
      "Notes",
      "Tags",
      "Reviewed",
      "Transaction ID",
    ],
    [
      "2026-09-01",
      "TRADER JOE S #723",
      "86.27",
      "Trader Joe's",
      "Groceries",
      "Everyday Checking",
      "Weekly groceries",
      "",
      "Reviewed",
      "",
    ],
    [
      "2026-09-03",
      "PAYROLL ACME INC",
      "-2500.00",
      "Acme Inc",
      "Paycheck",
      "Everyday Checking",
      "",
      "Income",
      "",
      "",
    ],
    [
      "2026-09-04",
      "AMAZON MKTPL*1A2B3C",
      "32.79",
      "Amazon",
      "Shopping",
      "Travel Card",
      "Gift for a friend",
      "Gifts, Family",
      "",
      "order-1A2B3C",
    ],
  ];
  return (
    rows
      .map((row) =>
        row
          .map((cell) =>
            /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
          )
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
export type ExportFormat = "monarch" | "monarch-balances" | null;
/**
 * Recognizes exports from other apps so their conventions apply automatically.
 * Monarch Money's transaction CSV has Date, Merchant, Category, Account,
 * Original Statement, Notes, Amount, Tags, Owner, Reviewed, Id, with expenses
 * as negative amounts. Its balance CSV has Date, Balance, Account with one row
 * per account per day and debts as negative balances.
 */
export function detectExportFormat(headers: ImportCell[]): ExportFormat {
  const keys = new Set(
    headers.map((h) => normalized(cellText(h)).replace(/[_-]/g, " ")),
  );
  const monarch = [
    "date",
    "merchant",
    "category",
    "account",
    "original statement",
    "amount",
  ];
  if (monarch.every((key) => keys.has(key))) return "monarch";
  if (
    ["date", "balance", "account"].every((key) => keys.has(key)) &&
    !keys.has("amount")
  )
    return "monarch-balances";
  return null;
}
/**
 * Finds the Marten account a file's account label refers to. Labels such as
 * "Venture X (...2480)" match by name first, then by name without the suffix,
 * then by the last digits against the account mask. Ambiguous labels return "".
 */
export function matchAccount(label: string, accounts: ImportLookup[]): string {
  const full = normalized(label);
  if (!full) return "";
  const unique = (matches: ImportLookup[]) =>
    matches.length === 1 ? matches[0]._id : "";
  const exact = unique(
    accounts.filter(
      (a) => normalized(a.name) === full || a.importName === full,
    ),
  );
  if (exact) return exact;
  const suffix = /^(.*?)\s*\(\s*(?:\.{3}|…)?\s*[x*#•]*(\d{2,})\s*\)$/i.exec(
    label.trim(),
  );
  if (!suffix) return "";
  const base = normalized(suffix[1]),
    digits = suffix[2].slice(-4);
  const byName = unique(accounts.filter((a) => normalized(a.name) === base));
  if (byName) return byName;
  const byMask = accounts.filter(
    (a) => a.mask && a.mask.replace(/\D/g, "").slice(-4) === digits,
  );
  if (byMask.length === 1) return byMask[0]._id;
  return unique(
    byMask.filter((a) => {
      const name = normalized(a.name);
      return name.includes(base) || base.includes(name);
    }),
  );
}
export function matchCategory(
  label: string,
  categories: ImportLookup[],
): string {
  const matches = categories.filter(
    (item) =>
      normalized(item.name) === normalized(label) ||
      item.importName === normalized(label),
  );
  return matches.length === 1 ? matches[0]._id : "";
}
/** Splits a tag cell such as "Travel, Reimbursable" into distinct names. */
export function parseImportTags(value: ImportCell | undefined): string[] {
  const names: string[] = [];
  for (const part of cellText(value).split(/[,;|]/)) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name || names.some((n) => n.toLowerCase() === name.toLowerCase()))
      continue;
    if (name.length > 60)
      throw new Error("Tag names need at most 60 characters.");
    names.push(name);
  }
  if (names.length > 30) throw new Error("Use at most 30 tags per row.");
  return names;
}
export function parseImportReviewed(value: ImportCell | undefined): boolean {
  return /^(reviewed|yes|true|y|1|x|✓)$/i.test(cellText(value));
}
export function suggestMapping(headers: ImportCell[]): ImportMapping {
  const keys = headers.map((h) =>
    normalized(cellText(h)).replace(/[_-]/g, " "),
  );
  // Names are listed in priority order, so "description" wins over "merchant"
  // when a file (such as a Monarch export) has both.
  const find = (...names: string[]) => {
    for (const name of names) {
      const index = keys.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  return {
    date: find(
      "date",
      "transaction date",
      "posted date",
      "posting date",
      "trans date",
    ),
    description: find(
      "description",
      "original statement",
      "original description",
      "payee",
      "name",
      "merchant",
      "transaction description",
      "memo",
    ),
    amount: find("amount", "transaction amount", "total"),
    debit: find(
      "debit",
      "debits",
      "withdrawal",
      "withdrawals",
      "money out",
      "expense",
    ),
    credit: find(
      "credit",
      "credits",
      "deposit",
      "deposits",
      "money in",
      "income",
    ),
    merchant: find("merchant", "payee", "merchant name"),
    category: find("category", "category name"),
    account: find("account", "account name"),
    notes: find("notes", "note", "memo"),
    tags: find("tags", "tag", "labels"),
    reviewed: find("reviewed", "review status"),
    id: find("id", "transaction id", "external id", "reference"),
  };
}

export function parseImportMoney(value: ImportCell | undefined): number {
  if (typeof value === "number") {
    const cents = Math.round(value * 100);
    if (
      !Number.isFinite(value) ||
      Math.abs(value * 100 - cents) > 0.000001 ||
      Math.abs(cents) > 1e13
    )
      throw new Error("Amount must have no more than two decimal places.");
    return cents;
  }
  let text = cellText(value).replace(/\u2212/g, "-");
  if (!text) throw new Error("Amount is missing.");
  const parentheses = /^\(.*\)$/.test(text);
  if (parentheses) text = text.slice(1, -1).trim();
  text = text.replace(/^\$\s*/, "");
  if (
    !/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text) ||
    (parentheses && /^[+-]/.test(text))
  )
    throw new Error("Use a number such as 42.50, $1,234.56, or (42.50).");
  const result =
    Math.round(Number(text.replace(/,/g, "")) * 100) * (parentheses ? -1 : 1);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 1e13)
    throw new Error("Amount is too large.");
  return result;
}

export function parseImportDate(
  value: ImportCell | undefined,
  order: "mdy" | "dmy",
  date1904 = false,
): string {
  if (typeof value === "number") {
    const serial = Math.floor(value);
    if (
      !Number.isFinite(value) ||
      serial < 0 ||
      (!date1904 && serial === 60) ||
      serial > 2958465
    )
      throw new Error("Invalid Excel date.");
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    const result = new Date(
      base + (serial - (!date1904 && serial > 60 ? 1 : 0)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || result < "1900-01-01")
      throw new Error("Invalid Excel date.");
    return result;
  }
  const text = cellText(value);
  let year: number, month: number, day: number;
  const iso =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      text,
    );
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (slash) {
    year = Number(slash[3]);
    month = Number(slash[order === "mdy" ? 1 : 2]);
    day = Number(slash[order === "mdy" ? 2 : 1]);
  } else
    throw new Error(
      "Use a valid date: YYYY-MM-DD or a four-digit year with the selected date order.",
    );
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error("Date does not exist.");
  return date.toISOString().slice(0, 10);
}

export function previewImport(
  sheet: ImportSheet,
  options: ImportOptions,
  accounts: ImportLookup[],
  categories: ImportLookup[],
) {
  const valid: ReadyImportRow[] = [],
    rejected: { rowNumber: number; description: string; reason: string }[] = [];
  const accountNames = new Map<string, ImportNameMatch>(),
    categoryNames = new Map<string, ImportNameMatch>();
  let duplicates = 0;
  const seen = new Map<string, number>();
  const { mapping } = options;
  const sourceRows = sheet.rows.slice(options.headerRow);
  const count = sourceRows.filter((row) =>
    row.some((cell) => cellText(cell)),
  ).length;
  const summary = () => ({
    accountNames: [...accountNames.values()],
    categoryNames: [...categoryNames.values()],
  });
  if (count > MAX_IMPORT_ROWS)
    return {
      valid,
      rejected,
      duplicates,
      ...summary(),
      error: "Import at most 50,000 rows per file.",
    };
  if (
    mapping.date < 0 ||
    mapping.description < 0 ||
    (options.amountMode === "signed"
      ? mapping.amount < 0
      : mapping.debit < 0 || mapping.credit < 0)
  )
    return {
      valid,
      rejected,
      duplicates,
      ...summary(),
      error: "Map the date, description, and amount columns to see a preview.",
    };
  if (options.amountMode === "separate" && mapping.debit === mapping.credit)
    return {
      valid,
      rejected,
      duplicates,
      ...summary(),
      error: "Choose different columns for money out and money in.",
    };
  // Each distinct account or category label resolves once: the preview's
  // explicit choice wins, otherwise the automatic name match.
  function resolveAccount(label: string) {
    const known = accountNames.get(label);
    if (known) {
      known.rows++;
      return known.id;
    }
    const chosen = options.accountMap[label];
    const automatic = chosen === undefined;
    const id = automatic ? matchAccount(label, accounts) : chosen;
    accountNames.set(label, { name: label, id, rows: 1, automatic });
    return id;
  }
  function resolveCategory(label: string) {
    const known = categoryNames.get(label);
    if (known) {
      known.rows++;
      return known.id;
    }
    const chosen = options.categoryMap[label];
    const automatic = chosen === undefined;
    const id = automatic ? matchCategory(label, categories) : chosen;
    categoryNames.set(label, { name: label, id, rows: 1, automatic });
    return id;
  }
  sourceRows.forEach((row, index) => {
    if (!row.some((cell) => cellText(cell))) return;
    const rowNumber = index + options.headerRow + 1;
    const originalName =
      cellText(row[mapping.description]) || cellText(row[mapping.merchant]);
    try {
      if (!originalName || originalName.length > 500)
        throw new Error("Description needs 1–500 characters.");
      const merchantName = cellText(row[mapping.merchant]) || originalName;
      if (merchantName.length > 120)
        throw new Error(
          "Merchant needs at most 120 characters. Map a shorter merchant column.",
        );
      const date = parseImportDate(
        row[mapping.date],
        options.dateOrder,
        sheet.date1904,
      );
      let amountCents: number;
      if (options.amountMode === "signed")
        amountCents =
          parseImportMoney(row[mapping.amount]) *
          (options.negativeExpenses ? -1 : 1);
      else {
        const debit = cellText(row[mapping.debit])
          ? parseImportMoney(row[mapping.debit])
          : 0;
        const credit = cellText(row[mapping.credit])
          ? parseImportMoney(row[mapping.credit])
          : 0;
        if (debit < 0 || credit < 0)
          throw new Error(
            "Money out and money in must be positive; use a signed amount column for negative values.",
          );
        if (debit && credit)
          throw new Error("Both money out and money in contain an amount.");
        if (!cellText(row[mapping.debit]) && !cellText(row[mapping.credit]))
          throw new Error("Amount is missing.");
        amountCents = debit - credit;
      }
      // Category names resolve before the account check so every category in
      // the file is listed even while some rows still need an account.
      const categoryName = cellText(row[mapping.category]);
      const matchedCategory = categoryName ? resolveCategory(categoryName) : "";
      const accountName = cellText(row[mapping.account]);
      const accountId = accountName
        ? resolveAccount(accountName)
        : options.accountId;
      if (!accountId || !accounts.some((a) => a._id === accountId))
        throw new Error(
          accountName
            ? `Choose the Marten account for “${accountName}” under Accounts in this file, or unmap Account to use the default.`
            : "Choose a default account.",
        );
      const categoryMatched =
        !!matchedCategory && categories.some((c) => c._id === matchedCategory);
      const categoryId = categoryMatched ? matchedCategory : options.categoryId;
      if (!categoryId || !categories.some((c) => c._id === categoryId))
        throw new Error("Choose a default category.");
      const notes = cellText(row[mapping.notes]);
      if (notes.length > 10000)
        throw new Error("Notes exceed 10,000 characters.");
      const tags = parseImportTags(row[mapping.tags]);
      const reviewed = parseImportReviewed(row[mapping.reviewed]);
      // A source transaction ID (such as Monarch's) identifies the row on its
      // own, so two identical purchases with different IDs both import.
      const externalId = cellText(row[mapping.id]);
      if (externalId.length > 120)
        throw new Error("Transaction ID needs at most 120 characters.");
      const base = externalId
        ? JSON.stringify(["id", externalId])
        : JSON.stringify([
            accountId,
            date,
            normalized(originalName),
            amountCents,
          ]);
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      if (occurrence && (externalId || !options.keepDuplicates)) {
        duplicates++;
        return;
      }
      valid.push({
        rowNumber,
        accountId,
        categoryId,
        categoryMatched,
        date,
        amountCents,
        originalName,
        merchantName,
        notes,
        tags,
        reviewed,
        fingerprint: `${base}:${occurrence}`,
        warning:
          categoryName && !categoryMatched
            ? `“${categoryName}” uses the default category.`
            : undefined,
      });
    } catch (error) {
      rejected.push({
        rowNumber,
        description: originalName,
        reason: error instanceof Error ? error.message : "Invalid row.",
      });
    }
  });
  return { valid, rejected, duplicates, ...summary(), error: "" };
}
export type BalanceImportRow = {
  rowNumber: number;
  accountId: string;
  date: string;
  balanceCents: number;
};
/**
 * Previews a balance-history file with Date, Balance, and Account columns,
 * such as Monarch Money's balance export. Monarch lists credit cards and loans
 * as negative balances; Marten stores the amount owed, so those are inverted.
 */
export function previewBalanceImport(
  sheet: ImportSheet,
  options: {
    headerRow: number;
    dateOrder: "mdy" | "dmy";
    accountMap: Record<string, string>;
    invertDebts: boolean;
  },
  accounts: ImportLookup[],
) {
  const headers = sheet.rows[options.headerRow - 1] ?? [];
  const keys = headers.map((h) =>
    normalized(cellText(h)).replace(/[_-]/g, " "),
  );
  const columns = {
    date: keys.indexOf("date"),
    balance: keys.indexOf("balance"),
    account: keys.indexOf("account"),
  };
  const valid: BalanceImportRow[] = [],
    rejected: { rowNumber: number; description: string; reason: string }[] = [];
  const accountNames = new Map<string, ImportNameMatch>();
  const latest = new Map<string, number>();
  let skipped = 0;
  const sourceRows = sheet.rows.slice(options.headerRow);
  if (columns.date < 0 || columns.balance < 0 || columns.account < 0)
    return {
      valid,
      rejected,
      skipped,
      accountNames: [],
      error: "Use columns named Date, Balance, and Account.",
    };
  if (sourceRows.length > MAX_IMPORT_ROWS)
    return {
      valid,
      rejected,
      skipped,
      accountNames: [],
      error: "Import at most 50,000 balance rows per file.",
    };
  sourceRows.forEach((row, index) => {
    if (!row.some((cell) => cellText(cell))) return;
    const rowNumber = index + options.headerRow + 1;
    const label = cellText(row[columns.account]);
    try {
      if (!label) throw new Error("Account is missing.");
      let match = accountNames.get(label);
      if (!match) {
        const chosen = options.accountMap[label];
        match = {
          name: label,
          id: chosen === undefined ? matchAccount(label, accounts) : chosen,
          rows: 0,
          automatic: chosen === undefined,
        };
        accountNames.set(label, match);
      }
      match.rows++;
      const chosenId = match.id;
      const account = accounts.find((a) => a._id === chosenId);
      const date = parseImportDate(
        row[columns.date],
        options.dateOrder,
        sheet.date1904,
      );
      let balanceCents = parseImportMoney(row[columns.balance]);
      if (!account) {
        skipped++;
        return;
      }
      if (
        options.invertDebts &&
        (account.kind === "credit" || account.kind === "loan")
      )
        balanceCents = -balanceCents;
      // One balance per account per day: a later row for the same day wins.
      const key = `${account._id}:${date}`;
      const existing = latest.get(key);
      if (existing !== undefined) {
        valid[existing].balanceCents = balanceCents;
        return;
      }
      latest.set(key, valid.length);
      valid.push({ rowNumber, accountId: account._id, date, balanceCents });
    } catch (error) {
      rejected.push({
        rowNumber,
        description: label,
        reason: error instanceof Error ? error.message : "Invalid row.",
      });
    }
  });
  return {
    valid,
    rejected,
    skipped,
    accountNames: [...accountNames.values()],
    error: "",
  };
}

export async function importRowKey(row: ReadyImportRow) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(row.fingerprint),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
