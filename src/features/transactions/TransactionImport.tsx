import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "../../lib/convex";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { accountOptions, categoryOptions, useData } from "../../lib/data";
import { download, message } from "../../lib/format";
import {
  importRowKey,
  importTemplateCsv,
  suggestMapping,
  suggestHeaderRow,
  detectExportFormat,
  type ImportLookup,
  type ImportMapping,
  type ImportNameMatch,
  type ImportOptions,
  type ImportSheet,
  type ImportSource,
} from "../../lib/transactionImport";
import { Button, Field, Modal, Picker, Tabs } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import "./import.css";

import { runImportWorker } from "../../lib/importWorker";

import {
  isNewImportId,
  newImportId,
  suggestImportAccount,
  suggestImportCategory,
  type ImportChoices,
  type planImport,
} from "../../lib/importPlan";
import { CategoryIconPicker } from "../../components/folio/CategoryIcon";

const emptyMapping = suggestMapping([]);
const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${count === 1 ? noun : noun === "category" ? "categories" : `${noun}s`}`;
type ImportResult =
  | { kind: "transactions"; inserted: number; matched: number; skipped: number }
  | { kind: "balances"; updates: number; accounts: number };
export function ImportTransactions({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useAmountsHidden();
  const data = useData();
  const importMapped = useMutation(api.transactions.importMapped);
  const prepareDestinations = useMutation(api.imports.prepareDestinations);
  const importBalances = useMutation(api.workspace.importBalances);
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
    accountMap: {},
    categoryMap: {},
  });
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewTab, setPreviewTab] = useState("ready"),
    [page, setPage] = useState(0);
  // Merchant count updates during batch saves must not revalidate the entire file.
  const accountSignature = JSON.stringify(
    data.accounts.map(({ _id, name, mask, kind, importName }) => ({
      _id,
      name,
      mask,
      kind,
      importName,
    })),
  );
  const categorySignature = JSON.stringify(
    data.categories.map(({ _id, name, importName }) => ({
      _id,
      name,
      importName,
    })),
  );
  const importAccounts = useMemo(
    () => JSON.parse(accountSignature) as ImportLookup[],
    [accountSignature],
  );
  const importCategories = useMemo(
    () => JSON.parse(categorySignature) as ImportLookup[],
    [categorySignature],
  );
  const fallbackAccount = "";
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
  const headers = sheet?.rows[options.headerRow - 1] ?? [];
  const exportFormat = detectExportFormat(headers);
  const balanceMode = exportFormat === "monarch-balances";
  const expenseMode = exportFormat === "expense-sheet";
  const [plan, setPlan] = useState<ReturnType<typeof planImport> | null>(null);
  const preview = plan?.preview ?? null;
  const balancePreview = plan?.balancePreview ?? null;
  const [choices, setChoices] = useState<ImportChoices>({
    accounts: {},
    categories: {},
  });
  const [validating, setValidating] = useState(false);
  useEffect(() => {
    if (busy) return;
    if (!sheet || !open) {
      setPlan(null);
      setValidating(false);
      return;
    }
    const controller = new AbortController();
    setValidating(true);
    const work = runImportWorker(
      "planImport",
      [
        sheet,
        {
          ...options,
          accountId: options.accountId || fallbackAccount,
          categoryId: options.categoryId || fallbackCategory,
        },
        importAccounts,
        importCategories,
        choices,
      ],
      controller.signal,
    ).then(setPlan);
    void work
      .catch((cause) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setValidating(false);
      });
    return () => controller.abort();
  }, [
    sheet,
    open,
    balanceMode,
    options,
    fallbackAccount,
    fallbackCategory,
    importAccounts,
    importCategories,
    choices,
    busy,
  ]);
  const locked = busy || loading || validating;
  function changeOptions(patch: Partial<ImportOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
    setPage(0);
    setResult(null);
    setProgress("");
    setError("");
  }
  function applySheet(next: ImportSheet) {
    const headerRow = suggestHeaderRow(next.rows);
    const nextHeaders = next.rows[headerRow - 1] ?? [];
    const mapping = suggestMapping(nextHeaders);
    const format = detectExportFormat(nextHeaders);
    setSheet(next);
    setChoices({ accounts: {}, categories: {} });
    setOptions((current) => ({
      ...current,
      headerRow,
      mapping,
      amountMode:
        mapping.amount < 0 && mapping.debit >= 0 && mapping.credit >= 0
          ? "separate"
          : "signed",
      // Monarch exports list expenses as negative amounts.
      negativeExpenses: format === "monarch",
      keepDuplicates: format === "expense-sheet",
      fallbackYear: "",
      accountMap: {},
      categoryMap: {},
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
      const next = await runImportWorker("loadImportSource", [file]);
      const first = await runImportWorker("loadImportSheet", [
        next,
        next.sheets[0],
      ]);
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
      const next = await runImportWorker("loadImportSheet", [source, value]);
      if (sequence === loadSequence.current) applySheet(next);
    } catch (cause) {
      if (sequence === loadSequence.current) setError(message(cause));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  async function resolveDestinations() {
    if (!sheet || !plan) throw new Error("Choose a file first.");
    const createdAccounts: Doc<"accounts">[] = [],
      createdCategories: Doc<"categories">[] = [];
    for (let i = 0; i < plan.newAccounts.length; i += 100) {
      const result = await prepareDestinations({
        accounts: plan.newAccounts.slice(i, i + 100),
        categories: [],
      });
      createdAccounts.push(...result.accounts);
    }
    for (let i = 0; i < plan.newCategories.length; i += 100) {
      const result = await prepareDestinations({
        accounts: [],
        categories: plan.newCategories.slice(i, i + 100),
      });
      createdCategories.push(...result.categories);
    }
    const accountMap = { ...options.accountMap };
    const categoryMap = { ...options.categoryMap };
    for (const a of plan.newAccounts) {
      const match = createdAccounts.find(
        (c) =>
          c.importName === newImportId(a.name).slice(4) || c.name === a.name,
      );
      if (match) accountMap[a.name] = match._id;
    }
    for (const c of plan.newCategories) {
      const match = createdCategories.find(
        (a) =>
          a.importName === newImportId(c.name).slice(4) || a.name === c.name,
      );
      if (match) categoryMap[c.name] = match._id;
    }
    // Keep resolved IDs for retries even if metadata subscriptions have not caught up yet.
    setOptions((current) => ({ ...current, accountMap, categoryMap }));
    return await runImportWorker("planImport", [
      sheet,
      { ...resolved, accountMap, categoryMap },
      [
        ...importAccounts.filter(
          (a) => !createdAccounts.some((c) => c._id === a._id),
        ),
        ...createdAccounts,
      ],
      [
        ...importCategories.filter(
          (c) => !createdCategories.some((a) => a._id === c._id),
        ),
        ...createdCategories,
      ],
      choices,
    ]);
  }
  async function saveTransactions() {
    if (!preview?.valid.length || busy || result) return;
    setBusy(true);
    setError("");
    let inserted = 0,
      skipped = 0,
      matched = 0;
    try {
      setProgress("Preparing accounts and categories…");
      const ready = (await resolveDestinations()).preview;
      if (!ready || ready.error)
        throw new Error(ready?.error || "Could not prepare this import.");
      for (let offset = 0; offset < ready.valid.length; ) {
        const candidates = await Promise.all(
          ready.valid.slice(offset, offset + 100).map(async (row) => ({
            key: await importRowKey(row),
            accountId: row.accountId as Id<"accounts">,
            categoryId: row.categoryId as Id<"categories">,
            categoryMatched: row.categoryMatched,
            ...(row.descriptionInferred ? { descriptionInferred: true } : {}),
            merchantName: row.merchantName,
            date: row.date,
            amountCents: row.amountCents,
            originalName: row.originalName,
            notes: row.notes,
            tags: row.tags,
            reviewed: row.reviewed,
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
        matched += batch.matched;
        offset += rows.length;
        setProgress(`Processed ${offset} of ${ready.valid.length} rows…`);
      }
      setResult({ kind: "transactions", inserted, skipped, matched });
      setProgress("");
    } catch (cause) {
      setError(
        `${message(cause)} ${inserted + matched} rows were saved before this stopped. Retry safely; previously saved rows will be skipped and any accounts or categories already created will be reused.`,
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }
  async function saveBalances() {
    if (!balancePreview?.valid.length || busy || result) return;
    setBusy(true);
    setError("");
    let updates = 0;
    try {
      setProgress("Preparing accounts…");
      const ready = (await resolveDestinations()).balancePreview;
      if (!ready || ready.error)
        throw new Error(ready?.error || "Could not prepare this import.");
      const byAccount = new Map<
        string,
        { date: string; balanceCents: number }[]
      >();
      for (const row of ready.valid) {
        const rows = byAccount.get(row.accountId) ?? [];
        rows.push({ date: row.date, balanceCents: row.balanceCents });
        byAccount.set(row.accountId, rows);
      }
      for (const [accountId, rows] of byAccount) {
        for (let offset = 0; offset < rows.length; offset += 100) {
          updates += await importBalances({
            accountId: accountId as Id<"accounts">,
            rows: rows.slice(offset, offset + 100),
          });
          setProgress(
            `Saved ${updates} of ${ready.valid.length} balance updates…`,
          );
        }
      }
      setResult({ kind: "balances", updates, accounts: byAccount.size });
      setProgress("");
    } catch (cause) {
      setError(
        `${message(cause)} ${updates} balance updates were saved before this stopped. Retrying replaces the same dates and reuses accounts already created, so it is safe.`,
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }
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
  const accountChoices = [
    { value: "", label: balanceMode ? "Skip this account" : "Choose account…" },
    ...data.accounts.map((a) => ({
      value: a._id,
      label: `${a.name}${a.closed ? " · Closed" : ""} · ${a.institution}`,
    })),
  ];
  const categoryChoices = [
    { value: "", label: "Use category for blank rows" },
    ...data.categories.map((c) => ({
      value: c._id,
      label: `${c.name}${c.enabled ? "" : " · Disabled"} · ${data.groups.find((g) => g._id === c.groupId)?.name ?? ""}`,
    })),
  ];
  const choicesForImport = choices;
  function updateAccountChoice(
    name: string,
    value: ImportChoices["accounts"][string],
  ) {
    setChoices((c) => ({ ...c, accounts: { ...c.accounts, [name]: value } }));
    setResult(null);
  }
  function updateCategoryChoice(
    name: string,
    value: ImportChoices["categories"][string],
  ) {
    setChoices((c) => ({
      ...c,
      categories: { ...c.categories, [name]: value },
    }));
    setResult(null);
  }
  function nameTable(
    kind: "account" | "category",
    names: ImportNameMatch[],
    choices: { value: string; label: string }[],
  ) {
    if (!names.length) return null;
    const mapKey = kind === "account" ? "accountMap" : "categoryMap";

    return (
      <section
        className="import-section"
        aria-label={`${kind === "account" ? "Accounts" : "Categories"} in this file`}
      >
        <h3>{kind === "account" ? "Accounts" : "Categories"} in this file</h3>
        <p className="import-hint">
          {kind === "account"
            ? "Matching accounts keep their history. Missing accounts will be created as manual accounts when you import. Review the type and mark old accounts closed. Current balances are not inferred from transactions."
            : "Matching categories are kept. Missing names will become new categories when you import. Review each suggested icon and type; transfers stay out of spending."}
        </p>
        <div className="import-map" role="table">
          {names.map((item) => (
            <div className="import-map-row" role="row" key={item.name}>
              <span role="cell" className="import-map-name">
                <strong>{item.name}</strong>
                <small>
                  {item.rows} {item.rows === 1 ? "row" : "rows"}
                  {isNewImportId(item.id)
                    ? " · will be created"
                    : item.id
                      ? " · matched"
                      : " · needs a choice"}
                </small>
              </span>
              <span role="cell">
                <Select
                  aria-label={`${kind === "account" ? "Account" : "Category"} for ${item.name}`}
                  disabled={locked}
                  value={item.id}
                  options={[
                    {
                      value: newImportId(item.name),
                      label:
                        kind === "account"
                          ? "Create manual account"
                          : "Create category",
                    },
                    ...choices,
                  ]}
                  onValueChange={(value) =>
                    changeOptions({
                      [mapKey]: { ...options[mapKey], [item.name]: value },
                    })
                  }
                />
              </span>
              {isNewImportId(item.id) &&
                kind === "account" &&
                (() => {
                  const proposed = {
                    ...suggestImportAccount(item.name),
                    ...choicesForImport.accounts[item.name],
                  };
                  return (
                    <div className="import-new-details">
                      <Select
                        aria-label={`Type for ${item.name}`}
                        disabled={locked}
                        value={proposed.kind}
                        options={[
                          { value: "cash", label: "Cash / checking / savings" },
                          { value: "credit", label: "Credit card" },
                          { value: "investment", label: "Investment" },
                          { value: "loan", label: "Loan" },
                          { value: "asset", label: "Other asset" },
                        ]}
                        onValueChange={(value) =>
                          updateAccountChoice(item.name, {
                            ...proposed,
                            kind: value as typeof proposed.kind,
                          })
                        }
                      />
                      <label className="import-checkbox">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={proposed.closed}
                          aria-label={`Closed account: ${item.name}`}
                          onChange={(event) =>
                            updateAccountChoice(item.name, {
                              ...proposed,
                              closed: event.target.checked,
                            })
                          }
                        />
                        Closed account
                      </label>
                    </div>
                  );
                })()}
              {isNewImportId(item.id) &&
                kind === "category" &&
                (() => {
                  const proposed = {
                    ...suggestImportCategory(item.name),
                    ...choicesForImport.categories[item.name],
                  };
                  return (
                    <div className="import-new-details">
                      <span className="import-category-icon">
                        <CategoryIconPicker
                          value={proposed.emoji}
                          onChange={(emoji) =>
                            !locked &&
                            updateCategoryChoice(item.name, {
                              ...proposed,
                              emoji,
                            })
                          }
                        />
                      </span>
                      <Select
                        aria-label={`Type for ${item.name}`}
                        disabled={locked}
                        value={proposed.kind}
                        options={[
                          { value: "expense", label: "Expense" },
                          { value: "income", label: "Income" },
                          { value: "transfer", label: "Transfer" },
                        ]}
                        onValueChange={(value) =>
                          updateCategoryChoice(item.name, {
                            ...proposed,
                            kind: value as typeof proposed.kind,
                          })
                        }
                      />
                    </div>
                  );
                })()}
            </div>
          ))}
        </div>
      </section>
    );
  }
  const visibleRows =
    (previewTab === "ready" ? preview?.valid : preview?.rejected) ?? [];
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const balanceAccounts = balancePreview
    ? new Set(balancePreview.valid.map((row) => row.accountId)).size
    : 0;
  return (
    <Modal
      open={open}
      onClose={locked ? () => {} : onClose}
      title={balanceMode ? "Import account balances" : "Import transactions"}
      wide
      description={
        balanceMode
          ? "Match each account in the file, review the counts, and add its balance history."
          : "Choose an Excel or CSV file, match its columns, and review the rows before importing."
      }
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
            {loading || validating
              ? validating
                ? "Checking rows…"
                : "Reading file…"
              : (source?.name ?? "Choose Excel or CSV file")}
          </span>
          <small>
            .xlsx or .csv · Up to 25 MB and 50,000 rows, including a Monarch
            balance export
          </small>
        </button>
        <details className="import-optional import-guide" open={!source}>
          <summary>What your file needs</summary>
          <div className="import-guide-columns">
            <section>
              <h4>Required columns</h4>
              <dl>
                <dt>Date</dt>
                <dd>2026-09-13 or 9/13/2026. Excel date cells work.</dd>
                <dt>Description</dt>
                <dd>
                  The statement text. Original Statement, Payee, Name, or Memo
                  headers are read too. In a Month / Date / Amount / Category /
                  Notes expense sheet, the category supplies the description.
                </dd>
                <dt>Amount</dt>
                <dd>
                  One signed column, or Money out / Money in. $1,234.56 and
                  (42.50) are fine.
                </dd>
              </dl>
            </section>
            <section>
              <h4>Optional columns</h4>
              <dl>
                <dt>Merchant</dt>
                <dd>A clean name; otherwise the description is used.</dd>
                <dt>Category, Account</dt>
                <dd>
                  Matched to your Marten names; anything unmatched gets a
                  choice. “Checking (…1234)” matches by its last digits.
                </dd>
                <dt>Notes, Tags, Reviewed, ID</dt>
                <dd>Tags are comma-separated; the ID keeps rows unique.</dd>
              </dl>
            </section>
          </div>
          <ul className="import-guide-notes">
            <li>
              Headers can sit on any of the first 50 rows, so a bank download
              works without renaming. Unmatched columns can be picked by hand.
            </li>
            <li>
              Expenses are positive and income negative; choose “Expenses are
              negative” if your file is the other way round.
            </li>
            <li>
              Monarch Money transaction and balance exports are recognized.
            </li>
            <li>
              Expense sheets can use full Excel dates, or a day number with a
              Month column. For day-only dates, include a year in Month or Year,
              or enter it in the import settings. Notes are kept in full.
            </li>
          </ul>
          <Button
            tone="quiet"
            icon={<Download size={15} />}
            disabled={locked}
            onClick={() =>
              download("marten-import-template.csv", importTemplateCsv())
            }
          >
            Download template CSV
          </Button>
        </details>
        {error && (
          <p role="alert" className="import-error">
            {error}
          </p>
        )}
        {source && (
          <details className="import-optional">
            <summary>File settings</summary>
            <div className="import-grid import-source-controls">
              {source.sheets.length > 1 && (
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
              )}
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
                      accountMap: {},
                      categoryMap: {},
                    });
                  }}
                />
              </Field>
            </div>
          </details>
        )}
        {sheet && balanceMode && balancePreview && (
          <>
            <div className="account-notice">
              Monarch Money balance export detected. Each day's balance is added
              to the matching account's history, so net worth and account charts
              reach back as far as the file does. A day's net worth adds up the
              accounts that have a balance by then, so include every account for
              a complete picture. Monarch lists credit cards and loans as
              negative balances; they are saved as the amount owed.
            </div>
            {nameTable("account", balancePreview.accountNames, accountChoices)}
            <section className="import-section" aria-label="Import preview">
              <h3>Review your import</h3>
              <p className="import-hint">
                {balancePreview.error ||
                  `${balancePreview.valid.length} balance ${balancePreview.valid.length === 1 ? "update" : "updates"} for ${balanceAccounts} ${balanceAccounts === 1 ? "account" : "accounts"} ${balancePreview.valid.length === 1 ? "is" : "are"} ready. ${plural(balancePreview.skipped, "row")} ${balancePreview.skipped === 1 ? "belongs" : "belong"} to skipped accounts and ${plural(balancePreview.rejected.length, "row")} ${balancePreview.rejected.length === 1 ? "was" : "were"} rejected. An imported date replaces its existing historical balance; current balances stay unchanged.`}
              </p>
              {balancePreview.rejected.length > 0 && (
                <div
                  className="import-preview-table import-preview-table-compact"
                  tabIndex={0}
                  role="region"
                  aria-label="Rejected balance rows"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Account</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balancePreview.rejected.slice(0, 20).map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td>{row.description || "—"}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
        {sheet && !balanceMode && (
          <>
            <section className="import-section" aria-label="Match columns">
              {expenseMode && (
                <>
                  <h3>Expense spreadsheet recognized</h3>
                  <p className="import-hint">
                    Your five columns are mapped from row {options.headerRow}.
                    Categories label each expense; no merchant name is needed.
                    Notes are kept.
                  </p>
                  <details className="import-optional">
                    <summary>Combining this with bank history?</summary>
                    <p>
                      Category-only expenses are not automatically matched to
                      bank transactions. Import spreadsheet history first, then
                      connect each bank from the day after the spreadsheet ends.
                      Overlapping dates can count an expense twice. Split a
                      mixed-account sheet by account, or keep it in a separate
                      manual history account.
                    </p>
                  </details>
                </>
              )}
              {exportFormat === "monarch" && (
                <>
                  <h3>Monarch transactions recognized</h3>
                  <p className="import-hint">
                    Date, merchant, category, account, original statement,
                    notes, amount, tags, review status, and transaction ID are
                    mapped. Owner is not imported. Review accounts and
                    categories below.
                  </p>
                </>
              )}
              <details
                className="import-optional"
                open={exportFormat === null ? true : undefined}
              >
                <summary>
                  {exportFormat === "monarch" || expenseMode
                    ? "Review all column mappings"
                    : "Match your columns"}
                </summary>
                <div className="import-grid">
                  {column("date", "Date")}
                  {column("month", "Month")}
                  {column("year", "Year")}
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
                        value={
                          options.negativeExpenses ? "negative" : "positive"
                        }
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
                  {!expenseMode && options.mapping.month >= 0 && (
                    <Field label="Year for day-only dates">
                      <input
                        aria-label="Year for day-only dates"
                        inputMode="numeric"
                        placeholder="e.g. 2026"
                        maxLength={4}
                        disabled={locked}
                        value={options.fallbackYear ?? ""}
                        onChange={(event) =>
                          changeOptions({ fallbackYear: event.target.value })
                        }
                      />
                      <small>
                        Only used when Date is a day number and the row has no
                        year. Full dates keep their own year.
                      </small>
                    </Field>
                  )}
                </div>
                <div>
                  <div className="import-grid">
                    {column("merchant", "Merchant")}
                    {column("category", "Category")}
                    {column("account", "Account")}
                    {column("notes", "Notes")}
                    {column("tags", "Tags")}
                    {column("reviewed", "Reviewed")}
                    {column("id", "Transaction ID")}
                  </div>
                  <p>
                    Tags are created when they do not exist yet. A reviewed
                    column marks rows as reviewed. A transaction ID keeps two
                    identical purchases apart and makes re-imports skip exactly
                    the rows already saved.
                  </p>
                </div>
              </details>
              <div className="import-grid import-defaults">
                {expenseMode && options.mapping.month >= 0 && (
                  <Field
                    label="Year for day-only dates"
                    hint="For day numbers like 12. Full dates keep their own year."
                  >
                    <input
                      aria-label="Year for day-only dates"
                      inputMode="numeric"
                      placeholder="e.g. 2026"
                      maxLength={4}
                      disabled={locked}
                      value={options.fallbackYear ?? ""}
                      onChange={(event) =>
                        changeOptions({ fallbackYear: event.target.value })
                      }
                    />
                  </Field>
                )}
                {(options.mapping.account < 0 ||
                  preview?.rejected.some(
                    (r) => r.reason === "Choose a default account.",
                  )) && (
                  <Field label="Account for rows without an account">
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
                )}
                {(options.mapping.category < 0 ||
                  preview?.valid.some((r) => !r.categoryMatched)) && (
                  <Field label="Category for blank or unmapped categories">
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
                )}
              </div>
            </section>
            {preview &&
              nameTable("account", preview.accountNames, accountChoices)}
            {preview &&
              nameTable("category", preview.categoryNames, categoryChoices)}
            <section className="import-section" aria-label="Import preview">
              <h3>Review your import</h3>
              <p className="import-hint">
                Expenses are positive; income and refunds are negative.
                Categories from your file are kept. Account balances stay
                unchanged.
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
              <details className="import-optional">
                <summary>How duplicate rows are handled</summary>
                <p className="import-hint">
                  Without a transaction ID, rows with the same account, date,
                  description, and amount count as duplicates
                  {expenseMode
                    ? "; expense sheets also compare the source category and notes"
                    : ""}
                  . Previously imported rows are always skipped.{" "}
                  {expenseMode
                    ? "Category-only rows stay separate from bank entries. Use the Source filter in Transactions to review each set, and hide overlapping entries to exclude them from reports."
                    : "A uniquely matched bank or manual transaction on the same account (same amount, within three days) receives the spreadsheet details instead of a second copy. Ambiguous matches stay separate for review."}
                </p>
              </details>
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
                                  {isNewImportId(row.accountId)
                                    ? plan?.newAccounts.find(
                                        (a) =>
                                          newImportId(a.name) === row.accountId,
                                      )?.name
                                    : data.accounts.find(
                                        (a) => a._id === row.accountId,
                                      )?.name}
                                  {row.tags.length
                                    ? ` · ${row.tags.join(", ")}`
                                    : ""}
                                  {row.reviewed ? " · reviewed" : ""}
                                </small>
                                {row.notes && (
                                  <details className="import-row-notes">
                                    <summary>Notes</summary>
                                    <p>{row.notes}</p>
                                  </details>
                                )}
                              </td>
                              <td>
                                {isNewImportId(row.categoryId)
                                  ? plan?.newCategories.find(
                                      (c) =>
                                        newImportId(c.name) === row.categoryId,
                                    )?.name
                                  : data.categories.find(
                                      (c) => c._id === row.categoryId,
                                    )?.name}
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
        {!result &&
          plan &&
          (plan.newAccounts.length > 0 || plan.newCategories.length > 0) && (
            <p className="import-hint" role="status">
              Import will create{" "}
              {plural(plan.newAccounts.length, "manual account")} and{" "}
              {plural(plan.newCategories.length, "category")}. Nothing is
              created until you import. New manual accounts start at $0; update
              their current balances separately.
            </p>
          )}
        {result && (
          <div role="status" className="import-result">
            <CheckCircle2 size={22} />
            <div>
              {result.kind === "balances" ? (
                <>
                  <strong>
                    {result.updates} balance{" "}
                    {result.updates === 1 ? "update" : "updates"} imported
                  </strong>
                  <p>
                    History for {result.accounts}{" "}
                    {result.accounts === 1 ? "account" : "accounts"} now reaches
                    back through the file. Net worth and account charts include
                    it.
                  </p>
                </>
              ) : (
                <>
                  <strong>
                    {result.inserted}{" "}
                    {result.inserted === 1 ? "transaction" : "transactions"}{" "}
                    imported
                  </strong>
                  <p>
                    {result.matched} existing{" "}
                    {result.matched === 1 ? "transaction" : "transactions"}{" "}
                    updated with the file's details. {result.skipped} previously
                    imported rows skipped. {preview?.rejected.length ?? 0}{" "}
                    rejected rows excluded.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <Button onClick={onClose} disabled={locked}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && balanceMode && (
            <Button
              tone="primary"
              disabled={
                locked ||
                !balancePreview?.valid.length ||
                !!balancePreview.error
              }
              onClick={() => void saveBalances()}
            >
              {busy
                ? "Importing…"
                : `Import ${balancePreview?.valid.length ?? 0} balance ${balancePreview?.valid.length === 1 ? "update" : "updates"}`}
            </Button>
          )}
          {!result && !balanceMode && (
            <Button
              tone="primary"
              disabled={locked || !preview?.valid.length || !!preview.error}
              onClick={() => void saveTransactions()}
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
