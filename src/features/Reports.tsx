import {
  useAmountsHidden,
  displayMoney as money,
} from "../lib/amountVisibility";
import { CategoryIcon } from "../components/folio/CategoryIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "convex/react";
import {
  BarChart3,
  LayoutGrid,
  Waypoints,
  ChevronLeft,
  ChevronRight,
  Download,
  SlidersHorizontal,
  PieChart as PieIcon,
  Save,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { entries } from "../../convex/lib/finance";
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
  monthEnd,
  monthOffset,
  monthStart,
} from "../lib/format";
import {
  summarize,
  normalizeReportChart,
  reportCharts,
  type ReportChart as ChartKind,
  type ReportKind,
} from "../lib/reporting";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import {
  aggregatePeriods,
  comparisonPeriods,
  periodDates,
  type ReportPeriod,
} from "../lib/reportPeriods";
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
  Tabs,
  useTask,
} from "../components/folio/ui";
import {
  BreakdownLegend,
  BreakdownTreemap,
  FlowChart,
} from "../components/folio/charts";
import { Select } from "../components/folio/Select";
import { DatePicker } from "../components/folio/DatePicker";
import { CashFlowTimeline } from "../components/folio/CashFlowTimeline";
import { MoneyFlow } from "../components/folio/MoneyFlow";
import { PageHeader } from "../components/folio/PageHeader";
import { TransactionDrawer } from "./transactions/TransactionDrawer";
import "./reports.css";

type Summary = ReturnType<typeof summarize>;
type BreakdownRow = Summary["spending"][number];
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
  return {
    summary,
    complete,
    timeline,
    count: matching.length,
    transactions: matching,
  };
}
function Totals({
  summary,
  complete,
}: {
  summary: Summary;
  complete: boolean;
}) {
  useAmountsHidden();
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
  useAmountsHidden();
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
  selected,
  onSelect,
}: {
  rows: BreakdownRow[];
  total: number;
  title: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  useAmountsHidden();
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
                <tr
                  key={row.id}
                  className={`report-row-selectable ${selected === row.id ? "selected" : ""}`}
                  onClick={() => onSelect(row.id)}
                >
                  <td>
                    {/* The button carries keyboard access; the row extends the click target. */}
                    <button
                      type="button"
                      className="report-category report-row-button"
                      aria-pressed={selected === row.id}
                    >
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
                    </button>
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
            Select a row to see its transactions. Split allocations count as
            separate entries.
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
  selected,
  onSelect,
}: {
  rows: BreakdownRow[];
  total: number;
  report: ReportKind;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  useAmountsHidden();
  const [active, setActive] = useState<string | null>(null);
  const positive = rows.filter((row) => row.value > 0);
  const title = report === "income" ? "Income" : "Spending";
  return positive.length ? (
    <div className="report-donut-layout">
      <div
        onMouseLeave={() => setActive(null)}
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
              isAnimationActive={false}
              onMouseEnter={(_, index) =>
                setActive(positive[index]?.name ?? null)
              }
              onClick={(_, index) => {
                const row = positive[index];
                if (row) onSelect(row.name);
              }}
            >
              {positive.map((row) => {
                const highlighted =
                  active === row.name ||
                  (active === null && selected === row.name);
                return (
                  <Cell
                    key={row.id}
                    fill={row.color}
                    opacity={
                      active === null
                        ? selected === null || selected === row.name
                          ? 1
                          : 0.4
                        : active === row.name
                          ? 1
                          : 0.4
                    }
                    stroke={highlighted ? "var(--text)" : "none"}
                    strokeWidth={highlighted ? 2 : 0}
                  />
                );
              })}
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
          <span>{active ?? `Total ${title.toLowerCase()}`}</span>
          <strong>
            {money(
              active
                ? (positive.find((row) => row.name === active)?.value ?? total)
                : total,
              false,
            )}
          </strong>
        </div>
      </div>
      <BreakdownLegend
        rows={positive}
        active={active}
        onHover={setActive}
        selected={selected}
        onSelect={onSelect}
        note={
          rows.some((row) => row.value < 0)
            ? "The ring shows positive categories. Refunds and reversals are included in the total and the breakdown below."
            : undefined
        }
      />
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
  selected,
  onSelect,
}: {
  summary: Summary;
  timeline: Summary["months"];
  chart: ChartKind;
  report: ReportKind;
  stacked: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  useAmountsHidden();
  const rows = report === "income" ? summary.earnings : summary.spending;
  // Chart shapes are name-keyed; the page tracks the breakdown row id.
  const selectedName = rows.find((row) => row.id === selected)?.name ?? null;
  const selectByName = (name: string) => {
    const row = rows.find((item) => item.name === name);
    if (row) onSelect(row.id);
  };
  if (chart === "sankey") return <MoneyFlow {...summary} />;
  if (chart === "treemap")
    return (
      <BreakdownTreemap
        data={rows}
        label={report === "income" ? "Income" : "Spending"}
        selected={selectedName}
        onSelect={selectByName}
      />
    );
  return chart === "donut" ? (
    <BreakdownDonut
      rows={rows}
      total={report === "income" ? summary.income : summary.expense}
      report={report}
      selected={selectedName}
      onSelect={selectByName}
    />
  ) : (
    <FlowChart data={timeline} stacked={stacked} report={report} />
  );
}
const chartLabels: Record<ChartKind, string> = {
  bar: "Trend bars",
  donut: "Donut",
  treemap: "Treemap",
  sankey: "Sankey",
};
const chartIcons = {
  bar: BarChart3,
  donut: PieIcon,
  treemap: LayoutGrid,
  sankey: Waypoints,
};
function ChartSwitcher({
  chart,
  report,
  onChange,
  stacked,
  onStackedChange,
}: {
  chart: ChartKind;
  report: ReportKind;
  onChange: (value: ChartKind) => void;
  stacked: boolean;
  onStackedChange: (value: boolean) => void;
}) {
  useAmountsHidden();
  return (
    <div className="report-chart-controls">
      {chart === "bar" && report === "cashflow" && (
        <label className="report-stack">
          <input
            type="checkbox"
            checked={stacked}
            onChange={(event) => onStackedChange(event.target.checked)}
          />
          Stacked
        </label>
      )}
      <ToggleGroup
        type="single"
        value={chart}
        onValueChange={(value) => {
          if (value) onChange(value as ChartKind);
        }}
        aria-label="Chart type"
        className="report-chart-switcher"
      >
        {reportCharts[report].map((value) => {
          const Icon = chartIcons[value];
          return (
            <ToggleGroupItem key={value} value={value} asChild>
              <IconButton label={chartLabels[value]}>
                <Icon size={17} />
              </IconButton>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
function chartTitle(report: ReportKind, chart: ChartKind) {
  if (chart === "sankey") return "Where your money went";
  const subject =
    report === "income"
      ? "Income"
      : report === "spending" || chart !== "bar"
        ? "Spending"
        : "Cash flow";
  return `${subject} ${chart === "bar" ? "over time" : "breakdown"}`;
}
function ReportFooter({ count }: { count: number }) {
  useAmountsHidden();
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

type DrillSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
const drillSortOptions: { value: DrillSort; label: string }[] = [
  { value: "date-desc", label: "Date · newest" },
  { value: "date-asc", label: "Date · oldest" },
  { value: "amount-desc", label: "Amount · high to low" },
  { value: "amount-asc", label: "Amount · low to high" },
];
type DrillEntry = { tx: Doc<"transactions">; amountCents: number };
/**
 * Transactions behind one breakdown row, using the same entry rules as
 * `summarize` so split allocations and the category filter match the table.
 * Amounts are the row's share of each transaction, signed the way the row is
 * (income and expenses both read as positive totals).
 */
function drilldownEntries(
  transactions: Doc<"transactions">[],
  data: ReturnType<typeof useData>,
  groupBy: string,
  rowId: string,
  categoryId?: string,
): DrillEntry[] {
  const result: DrillEntry[] = [];
  for (const tx of transactions) {
    if (tx.removedFromBank) continue;
    let amountCents = 0,
      matched = false;
    for (const entry of entries(tx)) {
      if (categoryId && entry.categoryId !== categoryId) continue;
      const category = data.categories.find((c) => c._id === entry.categoryId),
        categoryGroup = data.groups.find((g) => g._id === category?.groupId);
      if (!categoryGroup || categoryGroup.kind === "transfer") continue;
      const id =
        groupBy === "merchant"
          ? entry.merchantId
          : groupBy === "group"
            ? categoryGroup._id
            : entry.categoryId;
      if (`${categoryGroup.kind}:${id}` !== rowId) continue;
      matched = true;
      amountCents +=
        categoryGroup.kind === "income"
          ? -entry.amountCents
          : entry.amountCents;
    }
    if (matched) result.push({ tx, amountCents });
  }
  return result;
}
function Drilldown({
  row,
  entries: list,
  from,
  to,
  onClear,
  onOpen,
}: {
  row: BreakdownRow;
  entries: DrillEntry[];
  from: string;
  to: string;
  onClear: () => void;
  onOpen: (id: Id<"transactions">) => void;
}) {
  useAmountsHidden();
  const data = useData();
  const [sort, setSort] = useState<DrillSort>("date-desc");
  const income = row.id.startsWith("income:");
  const sorted = useMemo(() => {
    const copy = [...list];
    copy.sort((a, b) =>
      sort === "date-desc"
        ? b.tx.date.localeCompare(a.tx.date) ||
          b.tx._creationTime - a.tx._creationTime
        : sort === "date-asc"
          ? a.tx.date.localeCompare(b.tx.date) ||
            a.tx._creationTime - b.tx._creationTime
          : sort === "amount-desc"
            ? b.amountCents - a.amountCents
            : a.amountCents - b.amountCents,
    );
    return copy;
  }, [list, sort]);
  const total = list.reduce((sum, entry) => sum + entry.amountCents, 0);
  const largest = list.reduce(
    (max, entry) => Math.max(max, entry.amountCents),
    0,
  );
  const dates = list.map((entry) => entry.tx.date).sort();
  const stats = [
    { name: "Total", value: money(total) },
    { name: "Transactions", value: list.length.toLocaleString() },
    { name: "Average", value: list.length ? money(total / list.length) : "—" },
    { name: "Largest", value: list.length ? money(largest) : "—" },
    { name: "First", value: dates.length ? dateLabel(dates[0]) : "—" },
    {
      name: "Last",
      value: dates.length ? dateLabel(dates[dates.length - 1]) : "—",
    },
  ];
  return (
    <Panel className="report-drilldown">
      <div className="report-drilldown-header">
        <div className="report-drilldown-title">
          <span className="report-dot" style={{ background: row.color }} />
          {row.emoji && (
            <CategoryIcon
              className="report-drilldown-emoji"
              emoji={row.emoji}
            />
          )}
          <div>
            <h3>{row.name}</h3>
            <small>
              {income ? "Income" : "Spending"} · {dateLabel(from)} –{" "}
              {dateLabel(to)}
            </small>
          </div>
        </div>
        <Button icon={<X size={15} />} onClick={onClear}>
          Clear
        </Button>
      </div>
      <dl className="report-drilldown-stats">
        {stats.map((stat) => (
          <div key={stat.name}>
            <dt>{stat.name}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="report-drilldown-tools">
        <span className="muted">
          {list.length === 1 ? "1 transaction" : `${list.length} transactions`}
        </span>
        <label className="report-select-label">
          <span>Sort</span>
          <Select
            aria-label="Sort drilldown transactions"
            value={sort}
            onValueChange={(value) => setSort(value as DrillSort)}
            options={drillSortOptions}
          />
        </label>
      </div>
      {sorted.length ? (
        <div className="report-drilldown-list" role="list">
          {sorted.map(({ tx, amountCents }) => {
            const merchant = data.merchants.find(
                (m) => m._id === tx.merchantId,
              ),
              account = data.accounts.find((a) => a._id === tx.accountId);
            return (
              <button
                type="button"
                role="listitem"
                key={tx._id}
                className="report-drilldown-row"
                onClick={() => onOpen(tx._id)}
              >
                <span className="report-drilldown-date">
                  {dateLabel(tx.date, { month: "short", day: "numeric" })}
                </span>
                <span className="report-drilldown-merchant">
                  <Avatar
                    name={merchant?.name ?? tx.originalName}
                    logo={merchant?.resolvedLogoUrl}
                    color={merchant?.color}
                    size="small"
                  />
                  <strong>{merchant?.name ?? tx.originalName}</strong>
                </span>
                <span className="report-drilldown-account">
                  {account?.name ?? "Account"}
                </span>
                <span
                  className={`report-drilldown-amount ${income ? "positive" : ""}`}
                >
                  {income ? "+" : ""}
                  {money(Math.abs(amountCents))}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No transactions match"
          description="This selection has no entries in the current period."
        />
      )}
    </Panel>
  );
}
/**
 * Selection for the report drilldown: one breakdown row id, cleared by Escape,
 * by choosing the same row again, or whenever the report inputs change.
 */
function useDrilldown(resetKey: string) {
  const [selected, setSelected] = useState<string | null>(null);
  const [openId, setOpenId] = useState<Id<"transactions"> | null>(null);
  useEffect(() => {
    setSelected(null);
    setOpenId(null);
  }, [resetKey]);
  useEffect(() => {
    if (!selected || openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (target?.closest('[role="dialog"], [role="listbox"], [role="menu"]'))
        return;
      setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, openId]);
  const toggle = useCallback(
    (id: string) => setSelected((current) => (current === id ? null : id)),
    [],
  );
  return {
    selected,
    toggle,
    clear: () => setSelected(null),
    openId,
    setOpenId,
  };
}
function DrilldownSection({
  drill,
  rows,
  transactions,
  groupBy,
  categoryId,
  from,
  to,
}: {
  drill: ReturnType<typeof useDrilldown>;
  rows: BreakdownRow[];
  transactions: Doc<"transactions">[];
  groupBy: string;
  categoryId?: string;
  from: string;
  to: string;
}) {
  useAmountsHidden();
  const data = useData();
  const row = rows.find((item) => item.id === drill.selected) ?? null;
  const list = useMemo(
    () =>
      row
        ? drilldownEntries(transactions, data, groupBy, row.id, categoryId)
        : [],
    [row, transactions, data, groupBy, categoryId],
  );
  const index = list.findIndex((entry) => entry.tx._id === drill.openId);
  return (
    <>
      {row && (
        <Drilldown
          row={row}
          entries={list}
          from={from}
          to={to}
          onClear={drill.clear}
          onOpen={drill.setOpenId}
        />
      )}
      <TransactionDrawer
        id={drill.openId}
        onClose={() => drill.setOpenId(null)}
        previous={
          index > 0 ? () => drill.setOpenId(list[index - 1].tx._id) : undefined
        }
        next={
          index >= 0 && index < list.length - 1
            ? () => drill.setOpenId(list[index + 1].tx._id)
            : undefined
        }
      />
    </>
  );
}

export function CashFlow() {
  useAmountsHidden();
  const [anchor, setAnchor] = useState(monthStart()),
    [period, setPeriod] = useState<Period>("monthly"),
    [groupBy, setGroupBy] = useState("category"),
    [chart, setChart] = useState<ChartKind>("sankey"),
    [stacked, setStacked] = useState(false);
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
  const drill = useDrilldown(`${range.from}|${range.to}|${groupBy}`);
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
      </div>
      <Totals summary={summary} complete={complete} />
      <div className="report-section-heading">
        <h2>Period details</h2>
        <GroupPicker value={groupBy} onChange={setGroupBy} />
      </div>
      {complete ? (
        <>
          <Panel
            title={chartTitle("cashflow", chart)}
            className="report-chart-panel"
            action={
              <ChartSwitcher
                chart={chart}
                report="cashflow"
                onChange={setChart}
                stacked={stacked}
                onStackedChange={setStacked}
              />
            }
          >
            <div className={`report-chart-body chart-${chart}`}>
              <ReportChart
                summary={summary}
                timeline={summary.months}
                chart={chart}
                report="cashflow"
                stacked={stacked}
                selected={drill.selected}
                onSelect={drill.toggle}
              />
            </div>
          </Panel>
          <div className="report-breakdowns">
            <Breakdown
              rows={summary.spending}
              total={summary.expense}
              title="Expenses"
              selected={drill.selected}
              onSelect={drill.toggle}
            />
            <Breakdown
              rows={summary.earnings}
              total={summary.income}
              title="Income"
              selected={drill.selected}
              onSelect={drill.toggle}
            />
          </div>
          <DrilldownSection
            drill={drill}
            rows={[...summary.spending, ...summary.earnings]}
            transactions={selectedTransactions}
            groupBy={groupBy}
            from={range.from}
            to={range.to}
          />
          <ReportFooter count={count} />
        </>
      ) : (
        <Loading text="Calculating the complete period…" />
      )}
    </div>
  );
}

export function Reports() {
  useAmountsHidden();
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
    [chart, setChart] = useState<ChartKind>("bar"),
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
    transactions: reportTransactions,
  } = useReport(
    valid ? from : "9999-12-31",
    valid ? to : "9999-12-31",
    groupBy,
    filters,
  );
  const complete = valid && loaded;
  const drill = useDrilldown(
    `${from}|${to}|${groupBy}|${report}|${filters.accountId ?? ""}|${filters.categoryId ?? ""}|${filters.merchantId ?? ""}|${filters.tagId ?? ""}`,
  );
  const restore = useCallback(
    (id: string) => {
      const saved = data.savedReports.find((item) => item._id === id);
      if (!saved) {
        setSelectedId(null);
        return;
      }
      setSelectedId(saved._id);
      const kind: ReportKind =
        saved.report === "income" || saved.report === "spending"
          ? saved.report
          : "cashflow";
      setReport(kind);
      setFrom(saved.from);
      setTo(saved.to);
      setGroupBy(
        groupOptions.some((g) => g.value === saved.groupBy)
          ? saved.groupBy
          : "category",
      );
      setChart(normalizeReportChart(saved.chart, kind));
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
          onChange={(v) => {
            const kind = v as ReportKind;
            setReport(kind);
            setChart(normalizeReportChart(chart, kind));
          }}
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
            title={chartTitle(report, chart)}
            className="report-chart-panel"
            action={
              <ChartSwitcher
                chart={chart}
                report={report}
                onChange={setChart}
                stacked={stacked}
                onStackedChange={setStacked}
              />
            }
          >
            <div className={`report-chart-body chart-${chart}`}>
              {complete ? (
                summary.spending.length || summary.earnings.length ? (
                  <ReportChart
                    summary={summary}
                    timeline={timeline}
                    chart={chart}
                    report={report}
                    stacked={stacked}
                    selected={drill.selected}
                    onSelect={drill.toggle}
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
            </div>
          </Panel>
          {complete && (
            <>
              <div className={report === "cashflow" ? "report-breakdowns" : ""}>
                {report !== "income" && (
                  <Breakdown
                    rows={summary.spending}
                    total={summary.expense}
                    title="Expenses"
                    selected={drill.selected}
                    onSelect={drill.toggle}
                  />
                )}
                {report !== "spending" && (
                  <Breakdown
                    rows={summary.earnings}
                    total={summary.income}
                    title="Income"
                    selected={drill.selected}
                    onSelect={drill.toggle}
                  />
                )}
              </div>
              <DrilldownSection
                drill={drill}
                rows={[
                  ...(report !== "income" ? summary.spending : []),
                  ...(report !== "spending" ? summary.earnings : []),
                ]}
                transactions={reportTransactions}
                groupBy={groupBy}
                categoryId={filters.categoryId}
                from={from}
                to={to}
              />
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
