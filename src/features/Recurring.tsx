import { useEffect, useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  List,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
} from "lucide-react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { recurringDates } from "../../convex/lib/finance";
import { recurringName } from "../../convex/lib/recurring";
import {
  accountOptions,
  categoryOptions,
  merchantOptions,
  useData,
} from "../lib/data";
import {
  dateLabel,
  localDate,
  money,
  monthEnd,
  monthOffset,
  monthStart,
  parseMoney,
} from "../lib/format";
import {
  Avatar,
  Button,
  Empty,
  Field,
  IconButton,
  Loading,
  Modal,
  Panel,
  Picker,
  SearchBox,
  Tabs,
  Toggle,
  useTask,
} from "../components/folio/ui";
import { PageHeader } from "../components/folio/PageHeader";
import { Select } from "../components/folio/Select";
import { DatePicker } from "../components/folio/DatePicker";
import {
  emptyRecurringFilters,
  filterRecurring,
  type RecurringFilters,
} from "../lib/recurringFilters";
import "./recurring.css";

type Schedule = Doc<"recurring">;
type Fields = Omit<Schedule, "_id" | "_creationTime" | "userId">;
export type RecurringDraft = Fields & { _id?: Id<"recurring"> };
type Draft = RecurringDraft;
type Occurrence = Schedule & { date: string; paid: boolean };
const frequencies: { value: Fields["frequency"]; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every three months" },
  { value: "yearly", label: "Yearly" },
];
const frequencyName = (frequency: Fields["frequency"]) =>
  frequencies.find((f) => f.value === frequency)?.label ?? frequency;

export function Recurring() {
  const [params] = useSearchParams();
  const requestedSearch = params.get("search") ?? "";
  const data = useData();
  const setStatementPaid = useMutation(api.recurring.setStatementPaid);
  const statementTask = useTask();
  const [month, setMonth] = useState(monthStart());
  const [mode, setMode] = useState("list");
  const [editor, setEditor] = useState<Draft | "new" | null>(null);
  const [suggestions, setSuggestions] = useState(false);
  const [statementEditor, setStatementEditor] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [filters, setFilters] = useState<RecurringFilters>({
    ...emptyRecurringFilters,
    search: requestedSearch,
  });
  useEffect(
    () => setFilters((current) => ({ ...current, search: requestedSearch })),
    [requestedSearch],
  );
  const filtering =
    !!filters.search.trim() ||
    !!filters.accountId ||
    filters.kind !== "all" ||
    filters.status !== "all";
  const clearFilters = () => setFilters(emptyRecurringFilters);
  const end = monthEnd(new Date(`${month}T12:00:00`));
  const {
    results: payments,
    status: paymentStatus,
    loadMore: loadPayments,
  } = usePaginatedQuery(
    api.recurring.payments,
    { from: month, to: end },
    { initialNumItems: 200 },
  );
  useEffect(() => {
    if (paymentStatus === "CanLoadMore") loadPayments(200);
  }, [paymentStatus, loadPayments]);
  const automatic = useQuery(api.recurring.automaticPayments, {
    from: month,
    to: end,
  });
  // An absent checkmark means unpaid only after every page has arrived.
  const paymentsLoaded =
    paymentStatus === "Exhausted" && automatic !== undefined;
  const paidOccurrences = useMemo(
    () =>
      new Set(
        mergePaymentStatus(automatic ?? [], payments)
          .filter((p) => p.paid)
          .map((p) => `${p.recurringId}:${p.date}`),
      ),
    [payments, automatic],
  );
  const today = localDate();
  const allOccurrences = useMemo(
    () =>
      data.recurring
        .filter((r) => r.active)
        .flatMap((r) =>
          recurringDates(r.nextDate, r.frequency, month, end).map((date) => ({
            ...r,
            date,
            paid: paidOccurrences.has(`${r._id}:${date}`),
          })),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data.recurring, month, end, paidOccurrences],
  );
  const occurrences = useMemo(
    () =>
      filterRecurring(allOccurrences, filters, data.accounts, data.merchants),
    [allOccurrences, filters, data.accounts, data.merchants],
  );
  const expenses = occurrences.filter((r) => r.amountCents > 0);
  const planned = expenses.reduce((sum, r) => sum + r.amountCents, 0);
  const remaining = expenses
    .filter((r) => !r.paid)
    .reduce((sum, r) => sum + r.amountCents, 0);
  const income = occurrences
    .filter((r) => r.amountCents < 0)
    .reduce((sum, r) => sum - r.amountCents, 0);
  const paused = filterRecurring(
    data.recurring.filter((r) => !r.active),
    filters,
    data.accounts,
    data.merchants,
  );
  const creditAccounts = data.accounts.filter(
    (a) => a.kind === "credit" && !a.closed,
  );
  const debts = data.accounts
    .map((a) => ({
      ...a,
      dueDate: a.statementReminder?.dueDate ?? a.dueDate,
      statementCents: a.statementReminder
        ? a.statementReminder.statementCents
        : a.statementCents,
      minimumCents: a.statementReminder
        ? a.statementReminder.minimumCents
        : a.minimumCents,
    }))
    .filter(
      (a) =>
        !a.closed &&
        (a.kind === "credit" || a.kind === "loan") &&
        a.dueDate &&
        a.dueDate >= month &&
        a.dueDate <= end,
    );
  const daysInMonth = Number(end.slice(8));
  const offset = new Date(`${month}T12:00:00`).getDay();
  const calendarLength = Math.ceil((offset + daysInMonth) / 7) * 7;
  return (
    <>
      <PageHeader title="Recurring">
        <Button
          icon={<Search size={16} />}
          onClick={() => setSuggestions(true)}
        >
          Find recurring
        </Button>
        <Button
          tone="primary"
          icon={<Plus size={16} />}
          disabled={!data.accounts.length}
          onClick={() => setEditor("new")}
        >
          Add recurring
        </Button>
      </PageHeader>
      <div className="recurring-toolbar">
        <div className="recurring-month">
          <IconButton
            label="Previous month"
            onClick={() => setMonth(monthOffset(month, -1))}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <h2>{dateLabel(month, { month: "long", year: "numeric" })}</h2>
          <IconButton
            label="Next month"
            onClick={() => setMonth(monthOffset(month, 1))}
          >
            <ChevronRight size={18} />
          </IconButton>
          <Button tone="quiet" onClick={() => setMonth(monthStart())}>
            Today
          </Button>
        </div>
        <Tabs
          pill
          value={mode}
          onChange={setMode}
          items={[
            { value: "list", label: "List", icon: <List size={16} /> },
            {
              value: "calendar",
              label: "Calendar",
              icon: <CalendarDays size={16} />,
            },
          ]}
        />
      </div>
      <div
        className="recurring-filters"
        role="group"
        aria-label="Filter scheduled items"
      >
        <SearchBox
          placeholder="Search schedules or merchants…"
          value={filters.search}
          onChange={(search) => setFilters({ ...filters, search })}
        />
        <Select
          aria-label="Recurring account filter"
          value={filters.accountId}
          onValueChange={(accountId) => setFilters({ ...filters, accountId })}
          options={[
            { value: "", label: "All accounts" },
            ...data.accounts.map((account) => ({
              value: account._id,
              label: account.name,
            })),
          ]}
        />
        <Select
          aria-label="Recurring type filter"
          value={filters.kind}
          onValueChange={(kind) =>
            setFilters({ ...filters, kind: kind as RecurringFilters["kind"] })
          }
          options={[
            { value: "all", label: "All types" },
            { value: "expense", label: "Payments" },
            { value: "income", label: "Income" },
            { value: "credit", label: "Credit card schedules" },
          ]}
        />
        <Select
          aria-label="Recurring payment status filter"
          value={filters.status}
          onValueChange={(status) =>
            setFilters({
              ...filters,
              status: status as RecurringFilters["status"],
            })
          }
          options={[
            { value: "all", label: "Any status" },
            { value: "paid", label: "Paid / received" },
            { value: "unpaid", label: "Unpaid / expected" },
          ]}
        />
        {filtering && (
          <Button tone="quiet" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="recurring-filter-summary" aria-live="polite">
        {paymentsLoaded ? (
          <span>
            {filtering
              ? `${occurrences.length} of ${allOccurrences.length}`
              : allOccurrences.length}{" "}
            scheduled {allOccurrences.length === 1 ? "item" : "items"} this
            month{filtering ? " · Totals reflect filters" : ""}
          </span>
        ) : (
          <span>Loading scheduled items…</span>
        )}
      </div>
      <Panel className="recurring-summary">
        <div>
          <span>Planned payments</span>
          <strong>{paymentsLoaded ? money(planned) : "—"}</strong>
          <small>
            {paymentsLoaded
              ? `${expenses.length} ${expenses.length === 1 ? "payment" : "payments"} ${filtering ? "shown" : "this month"}`
              : "Loading payments…"}
          </small>
        </div>
        <div>
          <span>Still to pay</span>
          <strong>{paymentsLoaded ? money(remaining) : "—"}</strong>
          <small>Based on your checkmarks</small>
        </div>
        <div>
          <span>Expected income</span>
          <strong className="positive">
            {paymentsLoaded ? money(income) : "—"}
          </strong>
          <small>Scheduled deposits</small>
        </div>
      </Panel>
      <Panel className="recurring-main">
        {!paymentsLoaded ? (
          <Loading text="Loading your schedule…" />
        ) : mode === "list" ? (
          occurrences.length ? (
            <div className="recurring-list">
              {occurrences.map((r, i) => (
                <div key={`${r._id}-${r.date}`}>
                  {(i === 0 || occurrences[i - 1].date !== r.date) && (
                    <div className="recurring-date-heading">
                      <span>
                        {dateLabel(r.date, {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {r.date === today && (
                        <span className="recurring-today-label">Today</span>
                      )}
                    </div>
                  )}
                  <RecurringRow occurrence={r} onEdit={() => setEditor(r)} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Repeat2 size={24} />}
              title={
                filtering ? "No scheduled items match" : "A clear month ahead"
              }
              description={
                filtering
                  ? "Try another account, type, or payment status, or clear your filters."
                  : "Track bills, subscriptions, and income so you know what’s coming."
              }
              action={
                filtering ? (
                  <Button onClick={clearFilters}>Clear filters</Button>
                ) : (
                  <Button
                    onClick={() => setEditor("new")}
                    disabled={!data.accounts.length}
                    icon={<Plus size={16} />}
                  >
                    Add recurring
                  </Button>
                )
              }
            />
          )
        ) : (
          <div className="recurring-calendar-wrap">
            <div
              className="recurring-calendar"
              role="table"
              aria-label={`${dateLabel(month, { month: "long", year: "numeric" })} recurring calendar`}
            >
              <div className="recurring-calendar-week" role="row">
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((day) => (
                  <div role="columnheader" key={day}>
                    <span className="calendar-weekday-long">{day}</span>
                    <span className="calendar-weekday-short">
                      {day.slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
              {Array.from({ length: calendarLength / 7 }, (_, week) => (
                <div className="recurring-calendar-week" role="row" key={week}>
                  {Array.from({ length: 7 }, (_, weekday) => {
                    const day = week * 7 + weekday - offset + 1;
                    const inMonth = day > 0 && day <= daysInMonth;
                    const date = `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
                    const rows = inMonth
                      ? occurrences.filter((r) => r.date === date)
                      : [];
                    return (
                      <div
                        role="cell"
                        key={weekday}
                        className={`recurring-calendar-day ${inMonth ? "" : "outside"} ${date === today ? "today" : ""}`}
                      >
                        {inMonth && (
                          <>
                            <button
                              className="recurring-day-number"
                              aria-label={`View ${dateLabel(date)}, ${rows.length} scheduled`}
                              onClick={() => setSelectedDay(date)}
                            >
                              {day}
                            </button>
                            <div className="recurring-day-events">
                              {rows.slice(0, 3).map((r) => {
                                const merchant = data.merchants.find(
                                  (m) => m._id === r.merchantId,
                                );
                                return (
                                  <button
                                    key={r._id}
                                    className={`recurring-calendar-event ${r.paid ? "paid" : ""} ${r.amountCents < 0 ? "income" : ""}`}
                                    onClick={() => setEditor(r)}
                                    title={`${recurringName(r, merchant?.name)}: ${money(Math.abs(r.amountCents))}`}
                                  >
                                    <span>
                                      {r.paid && <Check size={11} />}{" "}
                                      {recurringName(r, merchant?.name)}
                                    </span>
                                    <strong>
                                      {money(Math.abs(r.amountCents))}
                                    </strong>
                                  </button>
                                );
                              })}
                              {rows.length > 3 && (
                                <button
                                  className="recurring-more"
                                  onClick={() => setSelectedDay(date)}
                                >
                                  +{rows.length - 3} more
                                </button>
                              )}
                            </div>
                            {rows.length > 0 && (
                              <button
                                className="recurring-day-mobile"
                                onClick={() => setSelectedDay(date)}
                                aria-label={`${rows.length} scheduled on ${dateLabel(date)}`}
                              >
                                <span />
                                {rows.length}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
      {paused.length > 0 && (
        <Panel title="Paused" className="recurring-paused">
          {paused.map((r) => {
            const merchant = data.merchants.find((m) => m._id === r.merchantId);
            return (
              <button
                className="recurring-paused-row"
                key={r._id}
                onClick={() => setEditor(r)}
              >
                <Avatar
                  name={merchant?.name ?? "Recurring"}
                  logo={merchant?.resolvedLogoUrl}
                  color={merchant?.color}
                />
                <span className="row-title">
                  <strong>{recurringName(r, merchant?.name)}</strong>
                  <small>{frequencyName(r.frequency)} · Paused</small>
                </span>
                <span>{money(Math.abs(r.amountCents))}</span>
                <Pencil size={15} />
              </button>
            );
          })}
        </Panel>
      )}
      {(debts.length > 0 || creditAccounts.length > 0) && (
        <section className="recurring-statements">
          <div className="recurring-section-title recurring-section-actions">
            <div>
              <h2>Statements due this month</h2>
              <p>
                Bank dates and your own card reminders. Separate from your
                recurring plan and cash-flow forecast.
              </p>
            </div>
            {creditAccounts.length > 0 && (
              <Button
                icon={<Plus size={15} />}
                onClick={() => setStatementEditor("")}
              >
                Add statement reminder
              </Button>
            )}
          </div>
          {debts.length === 0 && (
            <p className="recurring-statement-empty">
              No statement dates this month. Add a reminder when your bank
              doesn’t provide a due date.
            </p>
          )}
          <div className="recurring-statement-grid">
            {debts.map((a) => (
              <Panel key={a._id} className="recurring-statement">
                <div className="recurring-statement-heading">
                  <Avatar name={a.institution} logo={a.logoUrl} />
                  <div>
                    <strong>{a.name}</strong>
                    <small>
                      {a.institution} {a.mask && `••${a.mask}`}
                    </small>
                  </div>
                  <CreditCard size={18} className="muted" />
                </div>
                <div className="recurring-statement-due">
                  Due{" "}
                  {dateLabel(a.dueDate!, { month: "short", day: "numeric" })}
                  <span className="status-chip">
                    {a.statementPaidDate === a.dueDate
                      ? "Marked paid"
                      : a.statementReminder
                        ? "Entered by you"
                        : a.manual
                          ? "Manual account"
                          : "Bank reported"}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Statement balance</dt>
                    <dd>
                      {a.statementCents === undefined
                        ? "Not provided"
                        : money(a.statementCents)}
                    </dd>
                  </div>
                  <div>
                    <dt>Minimum payment</dt>
                    <dd>
                      {a.minimumCents === undefined
                        ? "Not provided"
                        : money(a.minimumCents)}
                    </dd>
                  </div>
                </dl>
                <div className="recurring-statement-footer">
                  <small>
                    Updated{" "}
                    {dateLabel(
                      localDate(
                        new Date(a.statementReminder?.updatedAt ?? a.updatedAt),
                      ),
                      {
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </small>
                  <button
                    className="text-link"
                    disabled={statementTask.busy}
                    onClick={() =>
                      void statementTask.run(
                        () =>
                          setStatementPaid({
                            accountId: a._id,
                            dueDate: a.dueDate!,
                            paid: a.statementPaidDate !== a.dueDate,
                          }),
                        a.statementPaidDate === a.dueDate
                          ? "Statement marked unpaid"
                          : "Statement marked paid",
                      )
                    }
                  >
                    {a.statementPaidDate === a.dueDate
                      ? "Mark unpaid"
                      : "Mark paid"}
                  </button>
                  {a.kind === "credit" && (
                    <button
                      className="text-link"
                      onClick={() => setStatementEditor(a._id)}
                    >
                      {a.statementReminder ? "Edit reminder" : "Set a reminder"}
                    </button>
                  )}
                  <Link to={`/accounts?account=${a._id}`} className="text-link">
                    View account
                  </Link>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      )}
      <p className="recurring-footnote">
        Checkmarks include matching posted transactions and your manual choices.
        They don’t send payments or change your transactions.{" "}
        <Link to="/settings/preferences#reminders" className="text-link">
          Set up reminders
        </Link>
      </p>
      {editor !== null && (
        <RecurringEditor
          initial={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {statementEditor !== null && (
        <StatementReminderEditor
          initialAccountId={statementEditor}
          onClose={() => setStatementEditor(null)}
        />
      )}
      <DetectionReview
        open={suggestions}
        onClose={() => setSuggestions(false)}
        onReview={(draft) => {
          setSuggestions(false);
          setEditor(draft);
        }}
      />
      <Modal
        open={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={
          selectedDay
            ? dateLabel(selectedDay, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "Scheduled"
        }
      >
        {!paymentsLoaded ? (
          <Loading text="Loading your schedule…" />
        ) : occurrences.filter((r) => r.date === selectedDay).length ? (
          occurrences
            .filter((r) => r.date === selectedDay)
            .map((r) => (
              <RecurringRow
                key={r._id}
                occurrence={r}
                onEdit={() => {
                  setSelectedDay(null);
                  setEditor(r);
                }}
              />
            ))
        ) : (
          <Empty
            title="Nothing scheduled"
            action={
              <Button
                onClick={() => {
                  setSelectedDay(null);
                  setEditor("new");
                }}
              >
                Add recurring
              </Button>
            }
          />
        )}
      </Modal>
    </>
  );
}
function RecurringRow({
  occurrence: r,
  onEdit,
}: {
  occurrence: Occurrence;
  onEdit: () => void;
}) {
  const data = useData(),
    setPaid = useMutation(api.recurring.setPaid),
    { run, busy } = useTask();
  const merchant = data.merchants.find((m) => m._id === r.merchantId),
    account = data.accounts.find((a) => a._id === r.accountId);
  const incoming = r.amountCents < 0;
  return (
    <div className={`recurring-row ${r.paid ? "is-paid" : ""}`}>
      <button
        className={`recurring-check ${r.paid ? "checked" : ""}`}
        disabled={busy}
        role="checkbox"
        aria-checked={r.paid}
        aria-label={`${r.paid ? "Unmark" : "Mark"} ${recurringName(r, merchant?.name)} as ${incoming ? "received" : "paid"} on ${dateLabel(r.date)}`}
        onClick={() =>
          void run(() =>
            setPaid({ recurringId: r._id, date: r.date, paid: !r.paid }),
          )
        }
      >
        {r.paid && <Check size={15} />}
      </button>
      <button className="recurring-row-detail" onClick={onEdit}>
        <Avatar
          name={merchant?.name ?? "Recurring"}
          logo={merchant?.resolvedLogoUrl}
          color={merchant?.color}
        />
        <span className="row-title">
          <strong>{recurringName(r, merchant?.name)}</strong>
          <small>
            {frequencyName(r.frequency)} · {account?.name ?? "Account"}
          </small>
        </span>
        <span className={`amount ${incoming ? "positive" : ""}`}>
          {incoming ? "+" : ""}
          {money(Math.abs(r.amountCents))}
          <small>
            {r.paid
              ? incoming
                ? "Received"
                : "Paid"
              : r.date < localDate()
                ? "Not marked"
                : "Scheduled"}
          </small>
        </span>
        <Pencil size={15} className="recurring-row-edit" />
      </button>
    </div>
  );
}
export function RecurringEditor({
  initial,
  onClose,
}: {
  initial?: Draft;
  onClose: () => void;
}) {
  const data = useData(),
    save = useMutation(api.recurring.save),
    remove = useMutation(api.recurring.remove),
    saveMerchant = useMutation(api.settings.saveMerchant),
    { run, busy } = useTask();
  const [merchantId, setMerchantId] = useState<string>(
      initial?.merchantId ?? "",
    ),
    [newMerchant, setNewMerchant] = useState("");
  const [name, setName] = useState(
    initial?.name ??
      data.merchants.find((m) => m._id === initial?.merchantId)?.name ??
      "",
  );
  const [tolerance, setTolerance] = useState(
    String((initial?.amountToleranceCents ?? 0) / 100),
  );
  const [statementContains, setStatementContains] = useState(
    initial?.statementContains ?? "",
  );
  const [accountId, setAccountId] = useState<string>(
    initial?.accountId ?? data.accounts.find((a) => !a.closed)?._id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string>(
    initial?.categoryId ??
      data.categories.find((c) => c.name === "Uncategorized")?._id ??
      "",
  );
  const [amount, setAmount] = useState(
      initial ? String(Math.abs(initial.amountCents) / 100) : "",
    ),
    [income, setIncome] = useState((initial?.amountCents ?? 0) < 0);
  const [frequency, setFrequency] = useState<Fields["frequency"]>(
      initial?.frequency ?? "monthly",
    ),
    [nextDate, setNextDate] = useState(initial?.nextDate ?? localDate());
  const [note, setNote] = useState(initial?.note ?? ""),
    [active, setActive] = useState(initial?.active ?? true),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  async function submit() {
    await run(
      async () => {
        if (!merchantId || !accountId || !categoryId || !nextDate)
          throw new Error("Choose a merchant, account, category, and date.");
        const parsed = parseMoney(amount);
        if (parsed <= 0) throw new Error("Enter an amount greater than zero.");
        const resolved =
          merchantId === "__new__"
            ? await saveMerchant({ name: newMerchant, color: "#64748b" })
            : (merchantId as Id<"merchants">);
        await save({
          ...(initial?._id ? { id: initial._id } : {}),
          merchantId: resolved,
          name: name.trim(),
          amountToleranceCents: parseMoney(tolerance || "0"),
          statementContains: statementContains.trim(),
          accountId: accountId as Id<"accounts">,
          categoryId: categoryId as Id<"categories">,
          amountCents: income ? -parsed : parsed,
          frequency,
          nextDate,
          active,
          source: initial?.source ?? "manual",
          note,
        });
        onClose();
      },
      initial?._id ? "Recurring schedule updated" : "Recurring schedule added",
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={
        initial?._id
          ? "Edit recurring"
          : initial?.source === "detected"
            ? "Review recurring suggestion"
            : "Add recurring"
      }
      description={
        initial?.source === "detected" && !initial._id
          ? "Confirm the amount and schedule before adding this suggestion."
          : "Give this bill or subscription its own name and matching details. Other purchases from the merchant stay separate."
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="recurring-form"
      >
        <Field label="Schedule name">
          <input
            className="f-input"
            aria-label="Schedule name"
            placeholder="e.g. Amazon Prime"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Merchant">
          <Picker
            label="Merchant"
            value={merchantId}
            onChange={setMerchantId}
            options={[
              ...merchantOptions(data),
              { value: "__new__", label: "Add a new merchant…" },
            ]}
          />
        </Field>
        {merchantId === "__new__" && (
          <Field label="Merchant name">
            <input
              className="f-input"
              aria-label="Merchant name"
              value={newMerchant}
              onChange={(e) => setNewMerchant(e.target.value)}
              maxLength={120}
              required
            />
          </Field>
        )}
        <div className="recurring-form-pair">
          <Field label="Amount">
            <input
              className="f-input"
              aria-label="Recurring amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Type">
            <Select
              aria-label="Recurring type"
              value={income ? "income" : "payment"}
              onValueChange={(value) => setIncome(value === "income")}
              options={[
                { value: "payment", label: "Payment" },
                { value: "income", label: "Income" },
              ]}
            />
          </Field>
        </div>
        <Field label="Account">
          <Picker
            label="Account"
            value={accountId}
            onChange={setAccountId}
            options={accountOptions(data)}
          />
        </Field>
        <Field label="Category">
          <Picker
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions(data)}
          />
        </Field>
        <div className="recurring-form-pair">
          <Field label="Frequency">
            <Select
              aria-label="Frequency"
              value={frequency}
              onValueChange={(value) =>
                setFrequency(value as Fields["frequency"])
              }
              options={frequencies}
            />
          </Field>
          <Field label="Schedule starts">
            <DatePicker
              label="Next scheduled date"
              value={nextDate}
              onChange={setNextDate}
              required
            />
          </Field>
        </div>
        <details className="recurring-match-settings">
          <summary>Match transaction details</summary>
          <p>
            Matches the selected merchant and account within 3 days of a
            scheduled date. Amounts match exactly unless you allow a difference.
          </p>
          <div className="recurring-form-pair">
            <Field label="Amount can vary by (±)">
              <input
                className="f-input"
                aria-label="Amount tolerance"
                inputMode="decimal"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Statement contains (optional)">
              <input
                className="f-input"
                aria-label="Statement contains"
                value={statementContains}
                onChange={(e) => setStatementContains(e.target.value)}
                maxLength={240}
                placeholder="e.g. PRIME"
              />
            </Field>
          </div>
          <p>
            One matching posted transaction marks an occurrence paid. Ambiguous
            matches stay unchecked; your manual paid or unpaid choice overrides
            automatic matching.
          </p>
        </details>
        <details className="recurring-match-settings">
          <summary>Changes, cancellations & renewals</summary>
          <p>
            Changed cards? Update the account on this schedule. Matching does
            not follow a subscription between accounts automatically.
          </p>
          <p>
            Canceled? Turn off Active schedule to keep it in Paused. Resume it
            and update the start date when you subscribe again. This does not
            cancel or restart the service itself.
          </p>
          <p>
            A new price applies to this whole schedule. Future price changes are
            not scheduled automatically; keep the renewal price in Notes until
            it takes effect.
          </p>
        </details>
        <Field label="Notes">
          <textarea
            className="f-input"
            aria-label="Recurring notes"
            rows={2}
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you’d like to remember"
          />
        </Field>
        <Toggle
          label="Active schedule"
          description="Paused schedules stay saved and leave the calendar."
          checked={active}
          onChange={setActive}
        />
        <div className="modal-actions recurring-editor-actions">
          {initial?._id && (
            <Button
              type="button"
              tone="danger"
              icon={<Trash2 size={15} />}
              onClick={() => setDeleteConfirm(true)}
            >
              Delete
            </Button>
          )}
          <span />
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={busy}>
            Save schedule
          </Button>
        </div>
      </form>
      <Modal
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Delete recurring schedule?"
        description="This removes the schedule. Your transactions stay saved."
      >
        <div className="modal-actions">
          <Button onClick={() => setDeleteConfirm(false)}>Keep schedule</Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await remove({ id: initial!._id! });
                onClose();
              }, "Schedule deleted")
            }
          >
            Delete schedule
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
function StatementReminderEditor({
  initialAccountId,
  onClose,
}: {
  initialAccountId: string;
  onClose: () => void;
}) {
  const data = useData();
  const accounts = data.accounts.filter(
    (account) => account.kind === "credit" && !account.closed,
  );
  const initial =
    accounts.find((account) => account._id === initialAccountId) ??
    accounts.find(
      (account) => !account.statementReminder && !account.dueDate,
    ) ??
    accounts[0];
  const source = initial?.statementReminder ?? initial;
  const [accountId, setAccountId] = useState<string>(initial?._id ?? "");
  const [dueDate, setDueDate] = useState(source?.dueDate ?? "");
  const [amount, setAmount] = useState(
    source?.statementCents === undefined
      ? ""
      : String(source.statementCents / 100),
  );
  const [minimum, setMinimum] = useState(
    source?.minimumCents === undefined ? "" : String(source.minimumCents / 100),
  );
  const account = accounts.find((account) => account._id === accountId);
  const save = useMutation(api.recurring.saveStatementReminder),
    clear = useMutation(api.recurring.clearStatementReminder),
    { run, busy } = useTask();
  function chooseAccount(id: string) {
    const selected = accounts.find((account) => account._id === id);
    const values = selected?.statementReminder ?? selected;
    setAccountId(id);
    setDueDate(values?.dueDate ?? "");
    setAmount(
      values?.statementCents === undefined
        ? ""
        : String(values.statementCents / 100),
    );
    setMinimum(
      values?.minimumCents === undefined
        ? ""
        : String(values.minimumCents / 100),
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={
        account?.statementReminder
          ? "Edit statement reminder"
          : "Add statement reminder"
      }
      description="Keep a card’s due date here when your bank doesn’t provide it. This reminder covers one statement."
    >
      <form
        className="recurring-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            if (!accountId || !dueDate)
              throw new Error("Choose a credit card and due date.");
            await save({
              accountId: accountId as Id<"accounts">,
              dueDate,
              statementCents: amount.trim() ? parseMoney(amount) : undefined,
              minimumCents: minimum.trim() ? parseMoney(minimum) : undefined,
            });
            onClose();
          }, "Statement reminder saved");
        }}
      >
        <Field label="Credit card">
          <Picker
            label="Reminder credit card"
            value={accountId}
            onChange={chooseAccount}
            options={accounts.map((account) => ({
              value: account._id,
              label: `${account.name}${account.mask ? ` ••${account.mask}` : ""}`,
            }))}
          />
        </Field>
        <Field label="Due date">
          <DatePicker
            label="Statement reminder due date"
            value={dueDate}
            onChange={setDueDate}
            required
          />
        </Field>
        <div className="recurring-form-pair">
          <Field label="Statement amount (optional)">
            <input
              className="f-input"
              aria-label="Reminder statement amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Minimum payment (optional)">
            <input
              className="f-input"
              aria-label="Reminder minimum payment"
              inputMode="decimal"
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <p className="muted recurring-reminder-note">
          Entered by you and saved separately from bank data. Update it when the
          next statement arrives. This does not create a transaction or change
          your account balance.
        </p>
        <div className="modal-actions recurring-editor-actions">
          {account?.statementReminder && (
            <Button
              type="button"
              tone="danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await clear({ accountId: account._id });
                  onClose();
                }, "Statement reminder cleared")
              }
            >
              Clear reminder
            </Button>
          )}
          <span />
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={busy || !accountId || !dueDate}
          >
            Save reminder
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DetectionReview({
  open,
  onClose,
  onReview,
}: {
  open: boolean;
  onClose: () => void;
  onReview: (draft: Draft) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [open]);
  const data = useData(),
    result = useQuery(api.recurring.detect, open ? { now } : "skip");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Find recurring"
      description="Suggestions based on repeated transactions. Review each one before adding it to your plan."
    >
      {!result ? (
        <Loading text="Looking for recurring transactions…" />
      ) : result.proposals.length ? (
        <div className="recurring-suggestions">
          {!result.complete && (
            <p className="muted">
              These suggestions may not include every recurring pattern.
            </p>
          )}
          {result.proposals.map((p, i) => {
            const merchant = data.merchants.find((m) => m._id === p.merchantId);
            return (
              <div
                className="recurring-suggestion"
                key={`${p.merchantId}-${p.accountId}-${i}`}
              >
                <Avatar
                  name={merchant?.name ?? "Recurring"}
                  logo={merchant?.resolvedLogoUrl}
                  color={merchant?.color}
                />
                <div className="row-title">
                  <strong>{recurringName(p, merchant?.name)}</strong>
                  <small>
                    {frequencyName(p.frequency)} · {p.occurrences} similar
                    transactions
                  </small>
                  <small>
                    {dateLabel(p.firstDate, {
                      month: "short",
                      year: "numeric",
                    })}
                    –
                    {dateLabel(p.lastDate, { month: "short", year: "numeric" })}
                    {p.amountToleranceCents
                      ? ` · Varies by up to ${money(p.amountToleranceCents)}`
                      : " · Same amount"}
                  </small>
                  <span className="amount">
                    {money(Math.abs(p.amountCents))}
                  </span>
                </div>
                <Button onClick={() => onReview(p)}>Review</Button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<Search size={24} />}
          title="No new suggestions yet"
          description="As more transactions come in, Marten looks for charges and deposits with a regular pattern."
        />
      )}
    </Modal>
  );
}
