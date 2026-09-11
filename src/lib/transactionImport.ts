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
  | "notes",
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
};
export type ImportLookup = { _id: string; name: string };
export type ReadyImportRow = {
  rowNumber: number;
  accountId: string;
  categoryId: string;
  merchantName: string;
  date: string;
  amountCents: number;
  originalName: string;
  notes: string;
  fingerprint: string;
  warning?: string;
};
export const MAX_IMPORT_ROWS = 5000;
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
      throw new Error("Import at most 5,000 transactions per file.");
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
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file up to 5 MB.");
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
      "Use a worksheet with at most 5,000 transactions and 50 header rows.",
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

export function suggestMapping(headers: ImportCell[]): ImportMapping {
  const keys = headers.map((h) =>
    normalized(cellText(h)).replace(/[_-]/g, " "),
  );
  const find = (...names: string[]) =>
    keys.findIndex((key) => names.includes(key));
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
  let duplicates = 0;
  const seen = new Map<string, number>();
  const { mapping } = options;
  const sourceRows = sheet.rows.slice(options.headerRow);
  const count = sourceRows.filter((row) =>
    row.some((cell) => cellText(cell)),
  ).length;
  if (count > MAX_IMPORT_ROWS)
    return {
      valid,
      rejected,
      duplicates,
      error: "Import at most 5,000 transactions per file.",
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
      error: "Map the date, description, and amount columns to see a preview.",
    };
  if (options.amountMode === "separate" && mapping.debit === mapping.credit)
    return {
      valid,
      rejected,
      duplicates,
      error: "Choose different columns for money out and money in.",
    };
  sourceRows.forEach((row, index) => {
    if (!row.some((cell) => cellText(cell))) return;
    const rowNumber = index + options.headerRow + 1;
    const originalName = cellText(row[mapping.description]);
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
      const accountName = cellText(row[mapping.account]);
      const matches = accounts.filter(
        (item) => normalized(item.name) === normalized(accountName),
      );
      const accountId = accountName
        ? matches.length === 1
          ? matches[0]._id
          : ""
        : options.accountId;
      if (!accountId || !accounts.some((a) => a._id === accountId))
        throw new Error(
          accountName
            ? `Account “${accountName}” does not match one unique Marten account. Rename it in the file, or unmap Account to use the default.`
            : "Choose a default account.",
        );
      const categoryName = cellText(row[mapping.category]);
      const categoryMatches = categories.filter(
        (item) => normalized(item.name) === normalized(categoryName),
      );
      const categoryId =
        categoryMatches.length === 1
          ? categoryMatches[0]._id
          : options.categoryId;
      if (!categoryId || !categories.some((c) => c._id === categoryId))
        throw new Error("Choose a default category.");
      const notes = cellText(row[mapping.notes]);
      if (notes.length > 10000)
        throw new Error("Notes exceed 10,000 characters.");
      const base = JSON.stringify([
        accountId,
        date,
        normalized(originalName),
        amountCents,
      ]);
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      if (occurrence && !options.keepDuplicates) {
        duplicates++;
        return;
      }
      valid.push({
        rowNumber,
        accountId,
        categoryId,
        date,
        amountCents,
        originalName,
        merchantName,
        notes,
        fingerprint: `${base}:${occurrence}`,
        warning:
          categoryName && categoryMatches.length !== 1
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
  return { valid, rejected, duplicates, error: "" };
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
