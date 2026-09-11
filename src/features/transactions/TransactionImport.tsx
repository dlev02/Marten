import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { accountOptions, categoryOptions, useData } from "../../lib/data";
import { message, money } from "../../lib/format";
import {
  importRowKey,
  loadImportSheet,
  loadImportSource,
  previewImport,
  suggestMapping,
  type ImportMapping,
  type ImportOptions,
  type ImportSheet,
  type ImportSource,
} from "../../lib/transactionImport";
import { Button, Field, Modal, Picker, Tabs } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import "./import.css";

const emptyMapping = suggestMapping([]);
export function ImportTransactions({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const data = useData();
  const importMapped = useMutation(api.transactions.importMapped);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sheet, setSheet] = useState<ImportSheet | null>(null);
  const [options, setOptions] = useState<ImportOptions>({
    headerRow: 1,
    mapping: emptyMapping,
    amountMode: "signed",
    negativeExpenses: false,
    dateOrder: "mdy",
    accountId: "",
    categoryId: "",
    keepDuplicates: false,
  });
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState("ready"),
    [page, setPage] = useState(0);
  const fallbackAccount = data.accounts.find((a) => !a.closed)?._id ?? "";
  const fallbackCategory =
    data.categories.find(
      (c) => c.enabled && c.name.toLowerCase() === "uncategorized",
    )?._id ??
    data.categories.find((c) => c.enabled)?._id ??
    "";
  const resolved = {
    ...options,
    accountId: options.accountId || fallbackAccount,
    categoryId: options.categoryId || fallbackCategory,
  };
  const preview = useMemo(
    () =>
      sheet
        ? previewImport(
            sheet,
            {
              ...options,
              accountId: options.accountId || fallbackAccount,
              categoryId: options.categoryId || fallbackCategory,
            },
            data.accounts,
            data.categories,
          )
        : null,
    [
      sheet,
      options,
      fallbackAccount,
      fallbackCategory,
      data.accounts,
      data.categories,
    ],
  );
  const locked = busy || loading;
  function changeOptions(patch: Partial<ImportOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
    setPage(0);
    setResult(null);
    setProgress("");
    setError("");
  }
  function applySheet(next: ImportSheet) {
    const mapping = suggestMapping(next.rows[0] ?? []);
    setSheet(next);
    setOptions((current) => ({
      ...current,
      headerRow: 1,
      mapping,
      amountMode:
        mapping.amount < 0 && mapping.debit >= 0 && mapping.credit >= 0
          ? "separate"
          : "signed",
    }));
    setPreviewTab("ready");
    setPage(0);
    setResult(null);
    setProgress("");
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    setSheet(null);
    setSource(null);
    setResult(null);
    setProgress("");
    try {
      const next = await loadImportSource(file);
      const first = await loadImportSheet(next, next.sheets[0]);
      if (sequence !== loadSequence.current) return;
      setSource(next);
      setSheetName(next.sheets[0]);
      applySheet(first);
    } catch (cause) {
      if (sequence === loadSequence.current) setError(message(cause));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  async function chooseSheet(value: string) {
    if (!source) return;
    const sequence = ++loadSequence.current;
    setSheetName(value);
    setLoading(true);
    setError("");
    setSheet(null);
    setResult(null);
    try {
      const next = await loadImportSheet(source, value);
      if (sequence === loadSequence.current) applySheet(next);
    } catch (cause) {
      if (sequence === loadSequence.current) setError(message(cause));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  async function save() {
    if (!preview?.valid.length || busy || result) return;
    setBusy(true);
    setError("");
    let inserted = 0,
      skipped = 0;
    try {
      for (let offset = 0; offset < preview.valid.length; ) {
        const candidates = await Promise.all(
          preview.valid.slice(offset, offset + 100).map(async (row) => ({
            key: await importRowKey(row),
            accountId: row.accountId as Id<"accounts">,
            categoryId: row.categoryId as Id<"categories">,
            merchantName: row.merchantName,
            date: row.date,
            amountCents: row.amountCents,
            originalName: row.originalName,
            notes: row.notes,
          })),
        );
        let byteCount = 0;
        const rows = candidates.filter((row) => {
          byteCount += new TextEncoder().encode(JSON.stringify(row)).byteLength;
          return byteCount <= 400_000;
        });
        if (!rows.length)
          throw new Error(
            "A row is too large to import. Shorten its notes and retry.",
          );
        const batch = await importMapped({ rows });
        inserted += batch.inserted;
        skipped += batch.skipped;
        offset += rows.length;
        setProgress(`Processed ${offset} of ${preview.valid.length} rows…`);
      }
      setResult({ inserted, skipped });
      setProgress("");
    } catch (cause) {
      setError(
        `${message(cause)} ${inserted} rows were saved before this stopped. Retry safely; previously saved rows will be skipped.`,
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }
  const headers = sheet?.rows[options.headerRow - 1] ?? [];
  const columnOptions = [
    { value: "-1", label: "Not mapped" },
    ...headers.map((cell, index) => ({
      value: String(index),
      label: `${index + 1}. ${String(cell ?? "").trim() || "Unnamed column"}`,
    })),
  ];
  function column(field: keyof ImportMapping, label: string) {
    return (
      <Field key={field} label={label}>
        <Select
          aria-label={`Import ${label} column`}
          disabled={locked}
          value={String(options.mapping[field])}
          options={columnOptions}
          onValueChange={(value) =>
            changeOptions({
              mapping: { ...options.mapping, [field]: Number(value) },
            })
          }
        />
      </Field>
    );
  }
  const visibleRows =
    (previewTab === "ready" ? preview?.valid : preview?.rejected) ?? [];
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <Modal
      open={open}
      onClose={locked ? () => {} : onClose}
      title="Import transactions"
      wide
      description="Choose an Excel or CSV file, match its columns, and review the rows before importing."
    >
      <div className="transaction-import">
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ref={fileInput}
          className="sr-only"
          aria-label="Choose transaction spreadsheet"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          className="attachment-dropzone"
          disabled={locked}
          onClick={() => fileInput.current?.click()}
        >
          {source ? <FileSpreadsheet size={21} /> : <Upload size={21} />}
          <span>
            {loading
              ? "Reading file…"
              : (source?.name ?? "Choose Excel or CSV file")}
          </span>
          <small>.xlsx or .csv · Up to 5 MB and 5,000 rows</small>
        </button>
        {error && (
          <p role="alert" className="import-error">
            {error}
          </p>
        )}
        {source && (
          <div className="import-grid import-source-controls">
            <Field label="Worksheet">
              <Select
                aria-label="Import worksheet"
                disabled={locked || source.sheets.length < 2}
                value={sheetName}
                options={source.sheets.map((name) => ({
                  value: name,
                  label: name,
                }))}
                onValueChange={(value) => void chooseSheet(value)}
              />
            </Field>
            <Field label="Column headers are on row">
              <Select
                aria-label="Import header row"
                disabled={locked}
                value={String(options.headerRow)}
                options={Array.from(
                  { length: Math.min(50, sheet?.rows.length ?? 1) },
                  (_, index) => ({
                    value: String(index + 1),
                    label: `Row ${index + 1}`,
                  }),
                )}
                onValueChange={(value) => {
                  const headerRow = Number(value);
                  const mapping = suggestMapping(
                    sheet?.rows[headerRow - 1] ?? [],
                  );
                  changeOptions({
                    headerRow,
                    mapping,
                    amountMode:
                      mapping.amount < 0 &&
                      mapping.debit >= 0 &&
                      mapping.credit >= 0
                        ? "separate"
                        : "signed",
                  });
                }}
              />
            </Field>
          </div>
        )}
        {sheet && (
          <>
            <section className="import-section" aria-label="Match columns">
              <h3>Match your columns</h3>
              <div className="import-grid">
                {column("date", "Date")}
                {column("description", "Description")}
                <Field label="Amount columns">
                  <Select
                    aria-label="Import amount columns"
                    disabled={locked}
                    value={options.amountMode}
                    options={[
                      { value: "signed", label: "One amount column" },
                      { value: "separate", label: "Money out and money in" },
                    ]}
                    onValueChange={(value) =>
                      changeOptions({
                        amountMode: value as ImportOptions["amountMode"],
                      })
                    }
                  />
                </Field>
                {options.amountMode === "signed" ? (
                  column("amount", "Amount")
                ) : (
                  <>
                    {column("debit", "Money out")}
                    {column("credit", "Money in")}
                  </>
                )}
                {options.amountMode === "signed" && (
                  <Field label="In this file">
                    <Select
                      aria-label="Import amount sign"
                      disabled={locked}
                      value={options.negativeExpenses ? "negative" : "positive"}
                      options={[
                        { value: "positive", label: "Expenses are positive" },
                        { value: "negative", label: "Expenses are negative" },
                      ]}
                      onValueChange={(value) =>
                        changeOptions({
                          negativeExpenses: value === "negative",
                        })
                      }
                    />
                  </Field>
                )}
                <Field label="Date order">
                  <Select
                    aria-label="Import date order"
                    disabled={locked}
                    value={options.dateOrder}
                    options={[
                      { value: "mdy", label: "Month / day / year" },
                      { value: "dmy", label: "Day / month / year" },
                    ]}
                    onValueChange={(value) =>
                      changeOptions({
                        dateOrder: value as ImportOptions["dateOrder"],
                      })
                    }
                  />
                </Field>
              </div>
              <details className="import-optional">
                <summary>Optional columns</summary>
                <div className="import-grid">
                  {column("merchant", "Merchant")}
                  {column("category", "Category")}
                  {column("account", "Account")}
                  {column("notes", "Notes")}
                </div>
                <p>
                  Account and category names match your Marten names. Unknown
                  accounts are rejected; unknown categories use your default.
                </p>
              </details>
              <div className="import-grid import-defaults">
                <Field label="Default account">
                  <Picker
                    label="Import default account"
                    disabled={locked}
                    value={resolved.accountId}
                    options={accountOptions(data)}
                    onChange={(value) =>
                      !locked && changeOptions({ accountId: value })
                    }
                  />
                </Field>
                <Field label="Default category">
                  <Picker
                    label="Import default category"
                    disabled={locked}
                    value={resolved.categoryId}
                    options={categoryOptions(data)}
                    onChange={(value) =>
                      !locked && changeOptions({ categoryId: value })
                    }
                  />
                </Field>
              </div>
            </section>
            <section className="import-section" aria-label="Import preview">
              <h3>Review your import</h3>
              <p className="import-hint">
                Expenses appear as positive amounts; income and refunds appear
                as negative. Your saved rules apply after import. Account
                balances stay unchanged.
              </p>
              <label className="import-checkbox">
                <input
                  type="checkbox"
                  checked={options.keepDuplicates}
                  disabled={locked}
                  onChange={(event) =>
                    changeOptions({ keepDuplicates: event.target.checked })
                  }
                />
                Keep identical rows within this file
              </label>
              <p className="import-hint">
                Rows with the same account, date, description, and amount count
                as duplicates. Previously imported rows are always skipped;
                bank-synced and manually added transactions are not compared.
              </p>
              {preview?.error && (
                <p className="import-error" role="status">
                  {preview.error}
                </p>
              )}
              <div className="import-preview-head">
                <Tabs
                  value={previewTab}
                  onChange={(value) => {
                    setPreviewTab(value);
                    setPage(0);
                  }}
                  items={[
                    {
                      value: "ready",
                      label: `Ready (${preview?.valid.length ?? 0})`,
                    },
                    {
                      value: "rejected",
                      label: `Rejected (${preview?.rejected.length ?? 0})`,
                    },
                  ]}
                />
                <span>
                  {preview?.duplicates ?? 0} duplicate{" "}
                  {preview?.duplicates === 1 ? "row" : "rows"} skipped
                </span>
              </div>
              <div
                className="import-preview-table"
                tabIndex={0}
                role="region"
                aria-label="Spreadsheet row preview"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>{previewTab === "ready" ? "Date" : "Description"}</th>
                      <th>
                        {previewTab === "ready"
                          ? "Description / account"
                          : "Reason"}
                      </th>
                      {previewTab === "ready" && (
                        <>
                          <th>Category</th>
                          <th className="import-number">Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewTab === "ready"
                      ? preview?.valid
                          .slice(currentPage * 20, currentPage * 20 + 20)
                          .map((row) => (
                            <tr key={row.rowNumber}>
                              <td>{row.rowNumber}</td>
                              <td>{row.date}</td>
                              <td>
                                <strong>{row.originalName}</strong>
                                <small>
                                  {
                                    data.accounts.find(
                                      (a) => a._id === row.accountId,
                                    )?.name
                                  }
                                </small>
                              </td>
                              <td>
                                {
                                  data.categories.find(
                                    (c) => c._id === row.categoryId,
                                  )?.name
                                }
                                {row.warning && (
                                  <small className="import-warning">
                                    {row.warning}
                                  </small>
                                )}
                              </td>
                              <td className="import-number">
                                {money(row.amountCents)}
                              </td>
                            </tr>
                          ))
                      : preview?.rejected
                          .slice(currentPage * 20, currentPage * 20 + 20)
                          .map((row) => (
                            <tr key={row.rowNumber}>
                              <td>{row.rowNumber}</td>
                              <td>{row.description || "—"}</td>
                              <td>{row.reason}</td>
                            </tr>
                          ))}
                    {!visibleRows.length && (
                      <tr>
                        <td
                          colSpan={previewTab === "ready" ? 5 : 3}
                          className="import-preview-empty"
                        >
                          {previewTab === "ready"
                            ? "Match your columns and defaults to prepare rows."
                            : "No rejected rows."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="import-pagination">
                <span>
                  Page {currentPage + 1} of {pageCount}
                </span>
                <Button
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  disabled={currentPage + 1 >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
              {!!preview?.rejected.length && (
                <p className="import-hint">
                  Only ready rows will be imported. Rejected rows stay out until
                  you correct the file or mapping.
                </p>
              )}
            </section>
          </>
        )}
        {progress && (
          <p role="status" className="import-progress">
            {progress}
          </p>
        )}
        {result && (
          <div role="status" className="import-result">
            <CheckCircle2 size={22} />
            <div>
              <strong>
                {result.inserted}{" "}
                {result.inserted === 1 ? "transaction" : "transactions"}{" "}
                imported
              </strong>
              <p>
                {result.skipped} previously imported rows skipped.{" "}
                {preview?.rejected.length ?? 0} rejected rows excluded.
              </p>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <Button onClick={onClose} disabled={locked}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              tone="primary"
              disabled={locked || !preview?.valid.length || !!preview.error}
              onClick={() => void save()}
            >
              {busy
                ? "Importing…"
                : `Import ${preview?.valid.length ?? 0} ready ${preview?.valid.length === 1 ? "row" : "rows"}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
