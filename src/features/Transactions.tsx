import { AmountInput } from "../components/folio/AmountInput";
import {
  useAmountsHidden,
  displayMoney as money,
} from "../lib/amountVisibility";
import { CategoryIcon } from "../components/folio/CategoryIcon";
import { transactionDatePresets } from "../lib/dateRanges";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useSearchParams } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowDownUp,
  CheckCircle2,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Receipt,
  Repeat2,
  Upload,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  matchesRecurringSchedule,
  recurringName,
} from "../../convex/lib/recurring";
import {
  accountOptions,
  categoryOptions,
  useData,
  useTransactions,
} from "../lib/data";
import { csv, dateLabel, download } from "../lib/format";
import {
  Avatar,
  Button,
  Empty,
  IconButton,
  Loading,
  Panel,
  Picker,
  SearchBox,
  Tabs,
  useTask,
  useToast,
} from "../components/folio/ui";
import { PageHeader } from "../components/folio/PageHeader";
import { Select } from "../components/folio/Select";
import { DateRangeButton } from "../components/folio/DateRangeButton";
import { TransactionDrawer } from "./transactions/TransactionDrawer";
import {
  NewTransaction,
  ImportTransactions,
} from "./transactions/TransactionForms";
import { BulkTransactions } from "./transactions/BulkTransactions";
import { AttachReceipt } from "./transactions/AttachReceipt";
export function Transactions() {
  useAmountsHidden();
  const data = useData(),
    [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? ""),
    [debounced, setDebounced] = useState(search);
  const [from, setFrom] = useState(params.get("from") ?? ""),
    [to, setTo] = useState(params.get("to") ?? ""),
    [tab, setTab] = useState(
      params.get("tab") === "receipts" ? "receipts" : "all",
    ),
    [category, setCategory] = useState(params.get("category") ?? ""),
    [tag, setTag] = useState(params.get("tag") ?? ""),
    [review, setReview] = useState("all"),
    [visibility, setVisibility] = useState("all"),
    [sort, setSort] = useState("newest"),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState("");
  const [account, setAccount] = useState(params.get("account") ?? ""),
    [merchant, setMerchant] = useState(params.get("merchant") ?? "");
  const [selected, setSelected] = useState<string | null>(
      params.get("transaction"),
    ),
    [add, setAdd] = useState(false),
    [importOpen, setImportOpen] = useState(params.get("import") === "true"),
    [attachOpen, setAttachOpen] = useState(false),
    [selecting, setSelecting] = useState(false),
    [bulkOpen, setBulkOpen] = useState(false),
    [checked, setChecked] = useState<Set<Id<"transactions">>>(new Set());
  const [columns, setColumns] = useState({
      category: true,
      account: true,
      notes: true,
      tags: false,
    }),
    [showSummary, setShowSummary] = useState(false);
  const bulk = useMutation(api.transactions.bulkUpdate),
    { busy, run } = useTask(),
    toast = useToast();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const requestedTransaction = params.get("transaction");
  const requestedSearch = params.get("search") ?? "";
  const requestedMerchant = params.get("merchant") ?? "";
  const requestedAccount = params.get("account") ?? "";
  const requestedCategory = params.get("category") ?? "";
  const requestedTag = params.get("tag") ?? "";
  const requestedFrom = params.get("from") ?? "";
  const requestedTo = params.get("to") ?? "";
  const requestedTab = params.get("tab") === "receipts" ? "receipts" : "all";
  const requestedImport = params.get("import") === "true";
  useEffect(() => {
    setSelected(requestedTransaction);
  }, [requestedTransaction]);
  useEffect(() => {
    setSearch(requestedSearch);
    setMerchant(requestedMerchant);
    setAccount(requestedAccount);
    setCategory(requestedCategory);
    setTag(requestedTag);
    setFrom(requestedFrom);
    setTo(requestedTo);
    setTab(requestedTab);
  }, [
    requestedSearch,
    requestedMerchant,
    requestedAccount,
    requestedCategory,
    requestedTag,
    requestedFrom,
    requestedTo,
    requestedTab,
  ]);
  useEffect(() => {
    if (requestedImport) setImportOpen(true);
  }, [requestedImport]);
  const result = useTransactions(
    {
      from: from || undefined,
      to: to || undefined,
      search: debounced || undefined,
      accountId: (account || undefined) as Id<"accounts"> | undefined,
      merchantId: (merchant || undefined) as Id<"merchants"> | undefined,
    },
    true,
  );
  const transactions = useMemo(
    () =>
      result.results
        .filter(
          (tx) =>
            (tab !== "receipts" || (tx.attachmentCount ?? 0) > 0) &&
            (!category ||
              tx.categoryId === category ||
              tx.splits.some((s) => s.categoryId === category)) &&
            (!tag || tx.tagIds.includes(tag as Id<"tags">)) &&
            (review === "all" ||
              (review === "reviewed" ? tx.reviewed : !tx.reviewed)) &&
            (visibility === "all" ||
              (visibility === "hidden" ? tx.hidden : !tx.hidden)) &&
            (!minimum ||
              !Number.isFinite(Number(minimum)) ||
              tx.amountCents >= Number(minimum) * 100) &&
            (!maximum ||
              !Number.isFinite(Number(maximum)) ||
              tx.amountCents <= Number(maximum) * 100),
        )
        .sort((a, b) =>
          sort === "oldest"
            ? a.date.localeCompare(b.date)
            : sort === "largest"
              ? b.amountCents - a.amountCents
              : sort === "smallest"
                ? a.amountCents - b.amountCents
                : b.date.localeCompare(a.date),
        ),
    [
      result.results,
      tab,
      category,
      tag,
      review,
      visibility,
      sort,
      minimum,
      maximum,
    ],
  );
  const selectedIndex = transactions.findIndex((t) => t._id === selected),
    total = transactions.reduce((s, t) => s + t.amountCents, 0),
    filters = [
      category,
      tag,
      review !== "all",
      visibility !== "all",
      account,
      merchant,
      minimum,
      maximum,
    ].filter(Boolean).length;
  const openTx = (id: string | null) => {
    setSelected(id);
    const next = new URLSearchParams(params);
    if (id) next.set("transaction", id);
    else next.delete("transaction");
    setParams(next, { replace: true });
  };
  function toggle(id: Id<"transactions">) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 100) next.add(id);
      else toast("Select up to 100 transactions at a time.", true);
      return next;
    });
  }
  function exportRows() {
    download(
      "marten-transactions.csv",
      csv([
        [
          "Date",
          "Merchant",
          "Category",
          "Account",
          "Amount",
          "Notes",
          "Tags",
          "Pending",
          "Hidden",
          "Reviewed",
        ],
        ...transactions.map((t) => [
          t.date,
          data.merchants.find((m) => m._id === t.merchantId)?.name ??
            t.originalName,
          data.categories.find((c) => c._id === t.categoryId)?.name ?? "",
          data.accounts.find((a) => a._id === t.accountId)?.name ?? "",
          (t.amountCents / 100).toFixed(2),
          t.notes,
          t.tagIds
            .map((id) => data.tags.find((tag) => tag._id === id)?.name ?? "")
            .join("; "),
          String(t.pending),
          String(t.hidden),
          String(t.reviewed),
        ]),
      ]),
    );
    toast("Transactions exported");
  }
  function clearFilters() {
    setCategory("");
    setTag("");
    setReview("all");
    setVisibility("all");
    setMinimum("");
    setMaximum("");
    setAccount("");
    setMerchant("");
    setParams({});
  }
  const allChecked =
    transactions.length > 0 &&
    transactions.slice(0, 100).every((t) => checked.has(t._id));
  return (
    <>
      <PageHeader title="Transactions" />
      <div className="transaction-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All" },
            { value: "receipts", label: "Receipts" },
          ]}
        />
        <div className="toolbar-spacer" />
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search transactions…"
        />
        <DateRangeButton
          from={from}
          to={to}
          presets={transactionDatePresets()}
          onChange={(nextFrom, nextTo) => {
            setFrom(nextFrom);
            setTo(nextTo);
          }}
        />
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button
              icon={<Filter size={16} />}
              className={filters ? "filter-active" : ""}
            >
              Filters
              {filters > 0 && <span className="count-badge">{filters}</span>}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="filter-popover"
              align="end"
              sideOffset={8}
            >
              <h3>Filter transactions</h3>
              <label>
                Category
                <Picker
                  label="Filter category"
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: "", label: "All categories" },
                    ...categoryOptions(data),
                  ]}
                />
              </label>
              <label>
                Account
                <Picker
                  label="Filter account"
                  value={account}
                  onChange={setAccount}
                  options={[
                    { value: "", label: "All accounts" },
                    ...accountOptions(data),
                  ]}
                />
              </label>
              <label>
                Tag
                <Picker
                  label="Filter tag"
                  value={tag}
                  onChange={setTag}
                  options={[
                    { value: "", label: "All tags" },
                    ...data.tags.map((t) => ({ value: t._id, label: t.name })),
                  ]}
                />
              </label>
              <label>
                Review status
                <Select
                  value={review}
                  onValueChange={setReview}
                  aria-label="Review status"
                  options={[
                    { value: "all", label: "Any status" },
                    { value: "unreviewed", label: "Needs review" },
                    { value: "reviewed", label: "Reviewed" },
                  ]}
                />
              </label>
              <label>
                Visibility
                <Select
                  value={visibility}
                  onValueChange={setVisibility}
                  aria-label="Transaction visibility"
                  options={[
                    { value: "all", label: "All transactions" },
                    { value: "visible", label: "Visible" },
                    { value: "hidden", label: "Hidden" },
                  ]}
                />
              </label>
              <div className="form-grid">
                <label>
                  Min amount
                  <AmountInput
                    type="text"
                    inputMode="decimal"
                    value={minimum}
                    onChange={(e) => {
                      if (/^-?\d*(?:\.\d{0,2})?$/.test(e.target.value))
                        setMinimum(e.target.value);
                    }}
                    placeholder="No minimum"
                  />
                </label>
                <label>
                  Max amount
                  <AmountInput
                    type="text"
                    inputMode="decimal"
                    value={maximum}
                    onChange={(e) => {
                      if (/^-?\d*(?:\.\d{0,2})?$/.test(e.target.value))
                        setMaximum(e.target.value);
                    }}
                    placeholder="No maximum"
                  />
                </label>
              </div>
              <Button tone="quiet" onClick={clearFilters}>
                Clear filters
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Button
          tone="primary"
          icon={<Plus size={16} />}
          onClick={() => setAdd(true)}
        >
          Add transaction
        </Button>
      </div>
      {(merchant || account) && (
        <div className="active-filters">
          {merchant && (
            <button
              onClick={() => {
                setMerchant("");
                setParams({});
              }}
            >
              {data.merchants.find((m) => m._id === merchant)?.name}
              <X size={13} />
            </button>
          )}
          {account && (
            <button
              onClick={() => {
                setAccount("");
                setParams({});
              }}
            >
              {data.accounts.find((a) => a._id === account)?.name}
              <X size={13} />
            </button>
          )}
        </div>
      )}
      <Panel
        className={`transactions-panel ${selecting ? "is-selecting" : ""}`}
      >
        <div className="transaction-list-header">
          <div>
            <h2>
              {selecting ? `${checked.size} selected` : "All transactions"}
            </h2>
            <small className="muted">
              {selecting ? (
                "Select up to 100 transactions"
              ) : (
                <>
                  {transactions.length.toLocaleString()} transactions
                  {result.status !== "Exhausted" ? " · loading more…" : ""}
                </>
              )}
            </small>
          </div>
          <div className="table-tools">
            <div
              className={`table-tools-mode ${!selecting ? "inactive" : ""}`}
              aria-hidden={!selecting}
            >
              <Button
                disabled={busy || !checked.size || !selecting}
                onClick={() => setBulkOpen(true)}
              >
                Edit selected
              </Button>
              <Button
                disabled={busy || !checked.size}
                icon={<CheckCircle2 size={15} />}
                onClick={() =>
                  void run(
                    () =>
                      bulk({ ids: [...checked], patch: { reviewed: true } }),
                    "Transactions reviewed",
                  )
                }
              >
                Review
              </Button>
              <Button
                tone="quiet"
                onClick={() => {
                  setSelecting(false);
                  setChecked(new Set());
                }}
              >
                Done
              </Button>
            </div>
            <div
              className={`table-tools-mode ${selecting ? "inactive" : ""}`}
              aria-hidden={selecting}
            >
              <Button onClick={() => setSelecting(true)}>Edit multiple</Button>
              <Select
                className="select-wrapper transaction-sort"
                icon={<ArrowDownUp size={15} />}
                value={sort}
                onValueChange={setSort}
                aria-label="Sort transactions"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "largest", label: "Amount: high to low" },
                  { value: "smallest", label: "Amount: low to high" },
                ]}
              />
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Button icon={<Columns3 size={15} />}>Columns</Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="small-menu"
                    align="end"
                    sideOffset={6}
                  >
                    {Object.entries(columns).map(([key, value]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) =>
                            setColumns((c) => ({
                              ...c,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        {key[0].toUpperCase() + key.slice(1)}
                      </label>
                    ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={showSummary}
                        onChange={(e) => setShowSummary(e.target.checked)}
                      />
                      Summary
                    </label>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <IconButton label="Transaction tools">
                    <MoreHorizontal size={19} />
                  </IconButton>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="small-menu"
                    align="end"
                    sideOffset={6}
                  >
                    <button
                      onClick={exportRows}
                      disabled={result.status !== "Exhausted"}
                    >
                      <Download size={16} />
                      Export CSV
                    </button>
                    <button onClick={() => setImportOpen(true)}>
                      <Upload size={16} />
                      Import Excel or CSV
                    </button>
                    <button onClick={() => setAttachOpen(true)}>
                      <Paperclip size={16} />
                      Attach a receipt
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </div>
        </div>
        {showSummary && (
          <div className="transaction-summary">
            <span>Filtered total</span>
            <strong>
              {result.status === "Exhausted" ? money(total) : "Calculating…"}
            </strong>
            <span>
              {transactions.filter((t) => !t.reviewed).length} need review
            </span>
          </div>
        )}
        {result.status === "LoadingFirstPage" ? (
          <Loading />
        ) : transactions.length ? (
          <div className="table-scroll">
            <table
              className="transactions-table"
              style={{
                minWidth:
                  370 +
                  Number(columns.category) * 190 +
                  Number(columns.account) * 210 +
                  Number(columns.tags) * 150,
              }}
            >
              <colgroup>
                <col />
                {columns.category && <col style={{ width: "25%" }} />}
                {columns.account && <col style={{ width: "25%" }} />}
                {columns.tags && <col style={{ width: 150 }} />}
                <col style={{ width: 124 }} />
                <col style={{ width: 28 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="merchant-heading">
                    {selecting && (
                      <input
                        type="checkbox"
                        aria-label="Select first 100 transactions"
                        checked={allChecked}
                        onChange={() =>
                          setChecked(
                            allChecked
                              ? new Set()
                              : new Set(
                                  transactions.slice(0, 100).map((t) => t._id),
                                ),
                          )
                        }
                      />
                    )}
                    <span>Merchant</span>
                  </th>
                  {columns.category && <th>Category</th>}
                  {columns.account && <th>Account</th>}
                  {columns.tags && <th>Tags</th>}
                  <th className="amount">Amount</th>
                  <th className="end-cell" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, index) => {
                  const merchant = data.merchants.find(
                      (m) => m._id === tx.merchantId,
                    ),
                    category = data.categories.find(
                      (c) => c._id === tx.categoryId,
                    ),
                    account = data.accounts.find((a) => a._id === tx.accountId);
                  const dayStart =
                    index === 0 || transactions[index - 1].date !== tx.date;
                  return (
                    <Fragment key={tx._id}>
                      {dayStart && (sort === "newest" || sort === "oldest") && (
                        <tr className="date-group">
                          <td
                            colSpan={
                              2 +
                              Number(columns.category) +
                              Number(columns.account) +
                              Number(columns.tags)
                            }
                          >
                            {dateLabel(tx.date, {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td />
                        </tr>
                      )}
                      <tr
                        className={`${tx._id === selected ? "selected " : ""}${tx.hidden ? "hidden-transaction" : ""}`}
                        onClick={() =>
                          selecting ? toggle(tx._id) : openTx(tx._id)
                        }
                      >
                        <td className="merchant-table-cell">
                          {selecting && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${merchant?.name ?? tx.originalName}`}
                              checked={checked.has(tx._id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggle(tx._id)}
                            />
                          )}
                          <button
                            className="merchant-cell"
                            onClick={(e) => {
                              e.stopPropagation();
                              selecting ? toggle(tx._id) : openTx(tx._id);
                            }}
                          >
                            <Avatar
                              name={merchant?.name ?? tx.originalName}
                              logo={merchant?.resolvedLogoUrl}
                              color={merchant?.color}
                            />
                            <span>
                              <strong>
                                {merchant?.name ?? tx.originalName}
                              </strong>
                              {(() => {
                                const matches = data.recurring.filter(
                                  (schedule) =>
                                    matchesRecurringSchedule(schedule, tx),
                                );
                                return (
                                  matches.length > 0 && (
                                    <small
                                      className="transaction-recurring-label"
                                      title="Matches schedule details; payment status is managed in Recurring"
                                    >
                                      <Repeat2 size={12} />
                                      {matches.length === 1
                                        ? recurringName(
                                            matches[0],
                                            merchant?.name,
                                          )
                                        : `${matches.length} schedule matches`}
                                    </small>
                                  )
                                );
                              })()}
                              {sort !== "newest" && sort !== "oldest" && (
                                <small>{dateLabel(tx.date)}</small>
                              )}
                            </span>
                            {!tx.reviewed && (
                              <span
                                className="review-dot"
                                title="Needs review"
                              />
                            )}
                            {columns.notes && tx.notes && (
                              <MessageSquare size={14} className="muted" />
                            )}
                            {(tx.attachmentCount ?? 0) > 0 && (
                              <Receipt size={14} className="muted" />
                            )}
                          </button>
                        </td>
                        {columns.category && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <InlineCategory
                              transaction={tx}
                              label={`${tx.splits.length ? "Split · " : ""}${category?.name ?? "Uncategorized"}`}
                            />
                          </td>
                        )}
                        {columns.account && (
                          <td>
                            <span
                              className="account-cell"
                              title={account?.name}
                            >
                              <Avatar
                                name={account?.institution ?? "Account"}
                                logo={account?.logoUrl}
                                size="small"
                              />
                              <span className="account-label">
                                {account?.name}
                              </span>
                            </span>
                          </td>
                        )}
                        {columns.tags && (
                          <td>
                            <div className="tag-cell">
                              {tx.tagIds.map((id) => {
                                const tag = data.tags.find((t) => t._id === id);
                                return (
                                  tag && (
                                    <span
                                      key={id}
                                      className="tag-chip"
                                      style={{ background: tag.color + "25" }}
                                    >
                                      {tag.name}
                                    </span>
                                  )
                                );
                              })}
                            </div>
                          </td>
                        )}
                        <td
                          className={`amount ${tx.amountCents < 0 ? "positive" : ""}`}
                        >
                          {tx.pending && (
                            <span className="pending-badge" title="Pending">
                              P
                            </span>
                          )}
                          {tx.amountCents < 0 ? "+" : ""}
                          {money(
                            Math.abs(tx.amountCents),
                            true,
                            account?.currency ?? "USD",
                          )}
                        </td>
                        <td className="end-cell">
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<Receipt size={25} />}
            title="No transactions found"
            description={
              search || filters
                ? "Try changing your search or filters."
                : tab === "receipts"
                  ? "Attach a receipt to a transaction and it will appear here."
                  : "Connect an account or add your first transaction."
            }
            action={
              search || filters ? (
                <Button
                  onClick={() => {
                    setSearch("");
                    clearFilters();
                  }}
                >
                  Clear search and filters
                </Button>
              ) : tab === "receipts" ? (
                <Button
                  icon={<Paperclip size={16} />}
                  onClick={() => setAttachOpen(true)}
                >
                  Attach receipt
                </Button>
              ) : (
                <Button onClick={() => setAdd(true)}>Add transaction</Button>
              )
            }
          />
        )}
        {result.status !== "Exhausted" &&
          result.status !== "LoadingFirstPage" && (
            <div className="table-loading">
              <span className="loading-dot" />
              Loading more transactions…
            </div>
          )}
      </Panel>
      {bulkOpen && (
        <BulkTransactions
          transactions={result.results.filter((tx) => checked.has(tx._id))}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false);
            setChecked(new Set());
            setSelecting(false);
          }}
        />
      )}
      <TransactionDrawer
        id={selected as Id<"transactions"> | null}
        onClose={() => openTx(null)}
        previous={
          selectedIndex > 0
            ? () => openTx(transactions[selectedIndex - 1]._id)
            : undefined
        }
        next={
          selectedIndex >= 0 && selectedIndex < transactions.length - 1
            ? () => openTx(transactions[selectedIndex + 1]._id)
            : undefined
        }
      />
      <NewTransaction
        open={add}
        onClose={() => setAdd(false)}
        onCreated={(id) => openTx(id)}
      />
      <AttachReceipt
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onAttached={(id) => {
          setAttachOpen(false);
          setSelected(id);
        }}
      />
      <ImportTransactions
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          if (params.has("import")) {
            const next = new URLSearchParams(params);
            next.delete("import");
            setParams(next, { replace: true });
          }
        }}
      />
    </>
  );
}
function InlineCategory({
  transaction,
  label,
}: {
  transaction: Doc<"transactions">;
  label: string;
}) {
  useAmountsHidden();
  const data = useData(),
    update = useMutation(api.transactions.update),
    { run } = useTask();
  const c = data.categories.find((c) => c._id === transaction.categoryId);
  return transaction.splits.length ? (
    <span className="split-category">
      <CategoryIcon emoji={c?.emoji} /> {label}
    </span>
  ) : (
    <Picker
      label={`Category for ${data.merchants.find((m) => m._id === transaction.merchantId)?.name ?? "transaction"}`}
      className="inline-picker"
      value={transaction.categoryId}
      options={categoryOptions(data)}
      onChange={(id) =>
        void run(() =>
          update({
            id: transaction._id,
            patch: { categoryId: id as Id<"categories"> },
          }),
        )
      }
    />
  );
}
