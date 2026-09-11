import { CategoryIcon } from "../components/folio/CategoryIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  SlidersHorizontal,
  PieChart as PieIcon,
  Save,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  accountOptions,
  categoryOptions,
  merchantOptions,
  useData,
  useTransactions,
} from "../lib/data";
import {
  csv,
  dateLabel,
  download,
  localDate,
  money,
  monthEnd,
  monthOffset,
  monthStart,
} from "../lib/format";
import { summarize } from "../lib/reporting";
import {
  aggregatePeriods,
  comparisonPeriods,
  periodDates,
  type ReportPeriod,
} from "../lib/reportPeriods";
import {
  Button,
  Empty,
  Field,
  IconButton,
  Loading,
  Modal,
  Panel,
  Picker,
  Tabs,
  useTask,
} from "../components/folio/ui";
import { FlowChart } from "../components/folio/charts";
import { Select } from "../components/folio/Select";
import { DatePicker } from "../components/folio/DatePicker";
import { CashFlowTimeline } from "../components/folio/CashFlowTimeline";
import { MoneyFlow } from "../components/folio/MoneyFlow";
import { PageHeader } from "../components/folio/PageHeader";
import "./reports.css";

type Summary = ReturnType<typeof summarize>;
type BreakdownRow = Summary["spending"][number];
type ReportKind = "cashflow" | "spending" | "income";
type Period = ReportPeriod;
const groupOptions = [
  { value: "category", label: "Category" },
  { value: "group", label: "Group" },
  { value: "merchant", label: "Merchant" },
];
const reportOptions = [
  { value: "cashflow", label: "Cash flow" },
  { value: "spending", label: "Spending" },
  { value: "income", label: "Income" },
];
type ReportFilters = {
  accountId?: Id<"accounts">;
  categoryId?: Id<"categories">;
  merchantId?: Id<"merchants">;
  tagId?: Id<"tags">;
};
function useReport(
  from: string,
  to: string,
  groupBy: string,
  filters: ReportFilters,
) {
  const data = useData(),
    transactions = useTransactions(
      {
        from,
        to,
        accountId: filters.accountId,
        merchantId: filters.merchantId,
      },
      true,
    );
  const matching = useMemo(
    () =>
      transactions.results.filter(
        (tx) => !filters.tagId || tx.tagIds.includes(filters.tagId),
      ),
    [transactions.results, filters.tagId],
  );
  const summary = useMemo(
    () => summarize(matching, data, groupBy, filters.categoryId),
    [matching, data, groupBy, filters.categoryId],
  );
  const complete = transactions.status === "Exhausted";
  const timeline = useMemo(() => {
    if (from > to) return [];
    const result: Summary["months"] = [],
      months = new Map(summary.months.map((m) => [m.month, m]));
    const first = new Date(`${from}T12:00:00`),
      end = new Date(`${to}T12:00:00`);
    for (
      let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
      cursor <= end;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      const month = localDate(cursor).slice(0, 7);
      result.push({
        ...(months.get(month) ?? { month, income: 0, expense: 0, savings: 0 }),
        label: cursor.toLocaleDateString("en-US", {
          month: "short",
          ...(first.getFullYear() !== end.getFullYear()
            ? { year: "2-digit" as const }
            : {}),
        }),
      });
    }
    return result;
  }, [summary.months, from, to]);
  return { summary, complete, timeline, count: matching.length };
}
function Totals({
  summary,
  complete,
}: {
  summary: Summary;
  complete: boolean;
}) {
  return (
    <div className="report-totals" aria-busy={!complete}>
      {[
        {
          name: "Income",
          value: summary.income,
          className: "positive",
          note: "Money coming in",
        },
        {
          name: "Expenses",
          value: summary.expense,
          className: "",
          note: "Spending after refunds",
        },
        {
          name: "Net cash flow",
          value: summary.savings,
          className: summary.savings < 0 ? "negative" : "positive",
          note:
            summary.income > 0
              ? `${summary.rate.toFixed(1)}% savings rate`
              : "Savings rate unavailable without income",
        },
      ].map((item) => (
        <div className="report-total" key={item.name}>
          <span>{item.name}</span>
          <strong className={item.className}>
            {complete ? money(item.value, false) : "—"}
          </strong>
          <small>{item.note}</small>
        </div>
      ))}
    </div>
  );
}
function GroupPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="report-select-label">
      <span>Group by</span>
      <Select
        aria-label="Group report by"
        value={value}
        onValueChange={onChange}
        options={groupOptions}
      />
    </label>
  );
}
function Breakdown({
  rows,
  total,
  title,
}: {
  rows: BreakdownRow[];
  total: number;
  title: string;
}) {
  const positiveTotal = rows.reduce(
    (sum, row) => sum + Math.max(row.value, 0),
    0,
  );
  return (
    <Panel title={title} className="report-breakdown">
      {rows.length ? (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Entries</th>
                <th scope="col">Amount</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="report-category">
                      <span
                        className="report-dot"
                        style={{ background: row.color }}
                      />
                      <span>
                        {row.emoji && (
                          <CategoryIcon
                            className="report-emoji"
                            emoji={row.emoji}
                          />
                        )}
                        {row.name}
                      </span>
                    </div>
                  </td>
                  <td>{row.count}</td>
                  <td className="amount">{money(row.value)}</td>
                  <td>
                    <div className="report-share">
                      <span>
                        {positiveTotal > 0 && row.value >= 0
                          ? `${((row.value / positiveTotal) * 100).toFixed(1)}%`
                          : "—"}
                      </span>
                      <span className="report-share-track">
                        <i
                          style={{
                            width: `${positiveTotal > 0 ? (Math.max(row.value, 0) / positiveTotal) * 100 : 0}%`,
                            background: row.color,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{rows.reduce((sum, row) => sum + row.count, 0)}</td>
                <td className="amount">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="report-table-note">
            Split allocations count as separate entries.
            {rows.some((row) => row.value < 0)
              ? " Negative amounts reduce the total; shares show positive amounts."
              : ""}
          </p>
        </div>
      ) : (
        <Empty
          title={`No ${title.toLowerCase()} in this period`}
          description="Try a different date range."
        />
      )}
    </Panel>
  );
}
function BreakdownDonut({
  rows,
  total,
  report,
}: {
  rows: BreakdownRow[];
  total: number;
  report: ReportKind;
}) {
  const positive = rows.filter((row) => row.value > 0);
  const title = report === "income" ? "Income" : "Spending";
  return positive.length ? (
    <div className="report-donut-layout">
      <div
        className="report-donut"
        role="img"
        aria-label={`${title} by selected grouping; total ${money(total)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={positive}
              nameKey="name"
              dataKey="value"
              innerRadius={82}
              outerRadius={111}
              paddingAngle={positive.length > 1 ? 2 : 0}
              stroke="none"
              animationDuration={500}
              isAnimationActive={
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches
              }
            >
              {positive.map((row) => (
                <Cell key={row.id} fill={row.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => money(Number(value))}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="report-donut-center">
          <span>Total {title.toLowerCase()}</span>
          <strong>{money(total, false)}</strong>
        </div>
      </div>
      <div className="report-legend">
        {positive.slice(0, 8).map((row) => (
          <div key={row.id}>
            <span className="report-dot" style={{ background: row.color }} />
            <span>{row.name}</span>
            <strong>{money(row.value, false)}</strong>
          </div>
        ))}
        {positive.length > 8 && (
          <small className="muted">
            {positive.length - 8} more in the breakdown below
          </small>
        )}
        {rows.some((row) => row.value < 0) && (
          <p className="muted">
            The ring shows positive categories. Refunds and reversals are
            included in the total and the breakdown below.
          </p>
        )}
      </div>
    </div>
  ) : (
    <Empty
      icon={<PieIcon size={26} />}
      title={`No positive ${title.toLowerCase()} to chart`}
      description="Any refunds or reversals are shown in the breakdown below."
    />
  );
}
function ReportChart({
  summary,
  timeline,
  chart,
  report,
  stacked,
}: {
  summary: Summary;
  timeline: Summary["months"];
  chart: string;
  report: ReportKind;
  stacked: boolean;
}) {
  const rows = report === "income" ? summary.earnings : summary.spending;
  return chart === "donut" ? (
    <BreakdownDonut
      rows={rows}
      total={report === "income" ? summary.income : summary.expense}
      report={report}
    />
  ) : (
    <FlowChart data={timeline} stacked={stacked} report={report} />
  );
}
function ReportFooter({ count }: { count: number }) {
  return (
    <p className="report-footnote">
      Based on {count.toLocaleString()} transactions in this period. Pending,
      hidden, and transfer entries are excluded from income and expenses.
    </p>
  );
}
function exportReport(
  summary: Summary,
  from: string,
  to: string,
  report: ReportKind,
) {
  const rows: (string | number)[][] = [
    ["Marten report", report],
    ["From", from],
    ["Through", to],
    [],
    ["Income", (summary.income / 100).toFixed(2)],
    ["Expenses", (summary.expense / 100).toFixed(2)],
    ["Net cash flow", (summary.savings / 100).toFixed(2)],
    [],
    ["Type", "Name", "Entries", "Amount (USD)"],
  ];
  if (report !== "spending")
    for (const row of summary.earnings)
      rows.push(["Income", row.name, row.count, (row.value / 100).toFixed(2)]);
  if (report !== "income")
    for (const row of summary.spending)
      rows.push(["Expense", row.name, row.count, (row.value / 100).toFixed(2)]);
  download(`marten-${report}-${from}-to-${to}.csv`, csv(rows));
}

export function CashFlow() {
  const [anchor, setAnchor] = useState(monthStart()),
    [period, setPeriod] = useState<Period>("monthly"),
    [groupBy, setGroupBy] = useState("category"),
    [chart, setChart] = useState("flow");
  const data = useData();
  const range = periodDates(anchor, period);
  const periods = comparisonPeriods(anchor, period);
  const transactions = useTransactions(
    { from: periods[0].from, to: range.to },
    true,
  );
  const complete = transactions.status === "Exhausted";
  const selectedTransactions = useMemo(
    () =>
      transactions.results.filter(
        (tx) => tx.date >= range.from && tx.date <= range.to,
      ),
    [transactions.results, range.from, range.to],
  );
  const summary = useMemo(
    () => summarize(selectedTransactions, data, groupBy),
    [selectedTransactions, data, groupBy],
  );
  const history = useMemo(
    () => summarize(transactions.results, data),
    [transactions.results, data],
  );
  const timeline = aggregatePeriods(history.months, periods);
  const count = selectedTransactions.length;
  const move = (direction: number) => {
    const date = new Date(`${anchor}T12:00:00`);
    setAnchor(
      localDate(
        new Date(
          date.getFullYear(),
          date.getMonth() +
            direction *
              (period === "yearly" ? 12 : period === "quarterly" ? 3 : 1),
          1,
        ),
      ),
    );
  };
  return (
    <div className="reports-page">
      <PageHeader title="Cash Flow">
        <Button
          icon={<Download size={16} />}
          disabled={!complete}
          onClick={() =>
            exportReport(summary, range.from, range.to, "cashflow")
          }
        >
          Export
        </Button>
      </PageHeader>
      <div className="report-toolbar">
        <Tabs
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          pill
          items={[
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "yearly", label: "Yearly" },
          ]}
        />
        <div className="report-period">
          <IconButton label="Previous period" onClick={() => move(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <strong>{range.label}</strong>
          <IconButton label="Next period" onClick={() => move(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <Panel title="Cash flow over time" className="cashflow-history-panel">
        {complete ? (
          <CashFlowTimeline
            data={timeline}
            selectedIndex={timeline.length - 1}
            onSelect={(index) => setAnchor(timeline[index].from)}
          />
        ) : (
          <Loading text="Loading cash flow history…" />
        )}
      </Panel>
      <div className="cashflow-period-heading">
        <h2>{range.label}</h2>
        <Select
          aria-label="Cash flow details view"
          value={chart}
          onValueChange={setChart}
          options={[
            { value: "flow", label: "Money flow" },
            { value: "breakdown", label: "Category breakdown" },
          ]}
        />
      </div>
      <Totals summary={summary} complete={complete} />
      <div className="report-section-heading">
        <h2>Where your money went</h2>
        <GroupPicker value={groupBy} onChange={setGroupBy} />
      </div>
      {complete ? (
        <>
          {chart === "flow" ? (
            <Panel className="cashflow-money-panel">
              <MoneyFlow {...summary} />
            </Panel>
          ) : (
            <div className="report-breakdowns">
              <Breakdown
                rows={summary.spending}
                total={summary.expense}
                title="Expenses"
              />
              <Breakdown
                rows={summary.earnings}
                total={summary.income}
                title="Income"
              />
            </div>
          )}
          <ReportFooter count={count} />
        </>
      ) : (
        <Loading text="Calculating the complete period…" />
      )}
    </div>
  );
}

export function Reports() {
  const [params] = useSearchParams();
  const restoredLink = useRef<string | null>(null);
  const data = useData(),
    task = useTask(),
    saveReport = useMutation(api.workspace.saveReport),
    deleteReport = useMutation(api.workspace.deleteReport);
  const [report, setReport] = useState<ReportKind>("spending"),
    [from, setFrom] = useState(() => monthOffset(monthStart(), -5)),
    [to, setTo] = useState(monthEnd()),
    [groupBy, setGroupBy] = useState("category"),
    [chart, setChart] = useState("bar"),
    [stacked, setStacked] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"savedReports"> | null>(null),
    [deleteOpen, setDeleteOpen] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>({}),
    [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = Object.values(filters).filter(Boolean).length;
  const selected =
    data.savedReports.find((saved) => saved._id === selectedId) ?? null;
  const valid = !!from && !!to && from <= to;
  const {
    summary,
    complete: loaded,
    timeline,
    count,
  } = useReport(
    valid ? from : "9999-12-31",
    valid ? to : "9999-12-31",
    groupBy,
    filters,
  );
  const complete = valid && loaded;
  const restore = useCallback(
    (id: string) => {
      const saved = data.savedReports.find((item) => item._id === id);
      if (!saved) {
        setSelectedId(null);
        return;
      }
      setSelectedId(saved._id);
      setReport(
        saved.report === "cashFlow" ? "cashflow" : (saved.report as ReportKind),
      );
      setFrom(saved.from);
      setTo(saved.to);
      setGroupBy(
        groupOptions.some((g) => g.value === saved.groupBy)
          ? saved.groupBy
          : "category",
      );
      setChart(
        saved.chart === "pie" || saved.chart === "donut" ? "donut" : "bar",
      );
      setStacked(saved.stacked ?? false);
      setFilters({
        accountId: saved.accountId,
        categoryId: saved.categoryId,
        merchantId: saved.merchantId,
        tagId: saved.tagId,
      });
      setFiltersOpen(
        !!(
          saved.accountId ||
          saved.categoryId ||
          saved.merchantId ||
          saved.tagId
        ),
      );
    },
    [data.savedReports],
  );
  useEffect(() => {
    const id = params.get("report");
    if (!id) {
      restoredLink.current = null;
      return;
    }
    if (
      restoredLink.current === id ||
      !data.savedReports.some((item) => item._id === id)
    )
      return;
    restoredLink.current = id;
    restore(id);
  }, [params, data.savedReports, restore]);
  function openSave() {
    setName(
      selected?.name ??
        `${reportOptions.find((r) => r.value === report)?.label} report`,
    );
    setSaveOpen(true);
  }
  return (
    <div className="reports-page">
      <PageHeader title="Reports">
        <Button
          icon={<Download size={16} />}
          disabled={!complete}
          onClick={() => exportReport(summary, from, to, report)}
        >
          Export
        </Button>
        <Button
          tone="primary"
          icon={<Save size={16} />}
          disabled={!complete}
          onClick={openSave}
        >
          Save report
        </Button>
      </PageHeader>
      <div className="report-nav">
        <Tabs
          value={report}
          onChange={(v) => setReport(v as ReportKind)}
          items={reportOptions}
        />
        <div className="report-saved">
          <Select
            aria-label="Saved reports"
            value={selected?._id ?? ""}
            onValueChange={restore}
            options={[
              { value: "", label: "Saved reports" },
              ...data.savedReports.map((saved) => ({
                value: saved._id,
                label: saved.name,
              })),
            ]}
          />
          {selected && (
            <IconButton
              label="Delete saved report"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="report-filters">
        <label>
          <span>From</span>
          <DatePicker
            label="Report start date"
            value={from}
            onChange={setFrom}
            max={to || undefined}
          />
        </label>
        <label>
          <span>Through</span>
          <DatePicker
            label="Report end date"
            value={to}
            onChange={setTo}
            min={from || undefined}
          />
        </label>
        <GroupPicker value={groupBy} onChange={setGroupBy} />
        <label>
          <span>Chart</span>
          <Select
            aria-label="Report chart type"
            value={chart}
            onValueChange={setChart}
            options={[
              { value: "bar", label: "Trend bars" },
              { value: "donut", label: "Donut chart" },
            ]}
          />
        </label>
        {chart === "bar" && report === "cashflow" && (
          <label className="report-stack">
            <input
              type="checkbox"
              checked={stacked}
              onChange={(e) => setStacked(e.target.checked)}
            />
            Stack bars
          </label>
        )}
        <Button
          className={filtersOpen || filterCount ? "report-filter-active" : ""}
          icon={<SlidersHorizontal size={15} />}
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          aria-controls="report-extra-filters"
        >
          Filters{filterCount ? ` · ${filterCount}` : ""}
        </Button>
      </div>
      {filtersOpen && (
        <div className="report-extra-filters" id="report-extra-filters">
          <Field label="Account">
            <Picker
              value={filters.accountId ?? ""}
              onChange={(value) =>
                setFilters({
                  ...filters,
                  accountId: (value as Id<"accounts">) || undefined,
                })
              }
              options={[
                { value: "", label: "All accounts" },
                ...accountOptions(data),
              ]}
              label="Report account"
            />
          </Field>
          <Field label="Category">
            <Picker
              value={filters.categoryId ?? ""}
              onChange={(value) =>
                setFilters({
                  ...filters,
                  categoryId: (value as Id<"categories">) || undefined,
                })
              }
              options={[
                { value: "", label: "All categories" },
                ...categoryOptions(data),
              ]}
              label="Report category"
            />
          </Field>
          <Field label="Merchant">
            <Picker
              value={filters.merchantId ?? ""}
              onChange={(value) =>
                setFilters({
                  ...filters,
                  merchantId: (value as Id<"merchants">) || undefined,
                })
              }
              options={[
                { value: "", label: "All merchants" },
                ...merchantOptions(data),
              ]}
              label="Report merchant"
            />
          </Field>
          <Field label="Tag">
            <Picker
              value={filters.tagId ?? ""}
              onChange={(value) =>
                setFilters({
                  ...filters,
                  tagId: (value as Id<"tags">) || undefined,
                })
              }
              options={[
                { value: "", label: "All tags" },
                ...data.tags.map((tag) => ({
                  value: tag._id,
                  label: tag.name,
                })),
              ]}
              label="Report tag"
            />
          </Field>
          {filterCount > 0 && (
            <button
              type="button"
              className="text-link"
              onClick={() => setFilters({})}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {!valid ? (
        <div className="report-range-error" role="alert">
          Choose a start date on or before the end date.
        </div>
      ) : (
        <>
          <Totals summary={summary} complete={complete} />
          <Panel
            title={
              chart === "donut"
                ? report === "income"
                  ? "Income breakdown"
                  : "Spending breakdown"
                : report === "income"
                  ? "Income over time"
                  : report === "spending"
                    ? "Spending over time"
                    : "Cash flow over time"
            }
            className="report-chart-panel"
            action={
              <span className="muted">
                {dateLabel(from)} – {dateLabel(to)}
              </span>
            }
          >
            {complete ? (
              summary.spending.length || summary.earnings.length ? (
                <ReportChart
                  summary={summary}
                  timeline={timeline}
                  chart={chart}
                  report={report}
                  stacked={stacked}
                />
              ) : (
                <Empty
                  icon={<TrendingUp size={26} />}
                  title="No activity in this date range"
                  description="Choose a different period or add transactions to build your report."
                />
              )
            ) : (
              <Loading text="Loading all transactions for this report…" />
            )}
          </Panel>
          {complete && (
            <>
              <div className={report === "cashflow" ? "report-breakdowns" : ""}>
                {report !== "income" && (
                  <Breakdown
                    rows={summary.spending}
                    total={summary.expense}
                    title="Expenses"
                  />
                )}
                {report !== "spending" && (
                  <Breakdown
                    rows={summary.earnings}
                    total={summary.income}
                    title="Income"
                  />
                )}
              </div>
              <ReportFooter count={count} />
            </>
          )}
        </>
      )}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={selected ? "Update saved report" : "Save report"}
        description="Save the dates, grouping, and chart settings to open this report again."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(async () => {
              const id = await saveReport({
                ...(selected ? { id: selected._id } : {}),
                name: name.trim(),
                report,
                from,
                to,
                groupBy,
                chart,
                stacked,
                ...filters,
              });
              setSelectedId(id);
              setSaveOpen(false);
            }, "Report saved");
          }}
        >
          <Field label="Report name">
            <input
              aria-label="Report name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="report-dialog-actions">
            <Button type="button" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              disabled={task.busy || !name.trim()}
            >
              Save report
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete saved report?"
        description={`Remove “${selected?.name ?? "this report"}” from your saved reports. Your transactions stay in Marten.`}
      >
        <div className="report-dialog-actions">
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            tone="danger"
            disabled={task.busy}
            onClick={() => {
              if (selected)
                void task.run(async () => {
                  await deleteReport({ id: selected._id });
                  setSelectedId(null);
                  setDeleteOpen(false);
                }, "Saved report deleted");
            }}
          >
            Delete report
          </Button>
        </div>
      </Modal>
    </div>
  );
}
