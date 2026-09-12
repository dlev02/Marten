import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  GripVertical,
  Plus,
  Settings2,
  WalletCards,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { recurringDates } from "../../convex/lib/finance";
import { accountNetWorth, useData, useTransactions } from "../lib/data";
import {
  dateLabel,
  localDate,
  money,
  monthEnd,
  monthOffset,
  monthStart,
} from "../lib/format";
import { summarize } from "../lib/reporting";
import {
  Avatar,
  Button,
  Empty,
  IconButton,
  Loading,
  Modal,
  Panel,
  useTask,
} from "../components/folio/ui";
import {
  FlowChart,
  NetWorthChart,
  SpendingDonut,
} from "../components/folio/charts";
import { PageHeader, AddAccountButton } from "../components/folio/PageHeader";
import { Select } from "../components/folio/Select";
const widgetNames: Record<string, string> = {
  netWorth: "Net worth",
  transactions: "Recent transactions",
  recurring: "Upcoming recurring",
  spending: "Spending this month",
  cashFlow: "Cash flow",
};
export function Dashboard({ onAddAccount }: { onAddAccount: () => void }) {
  const data = useData(),
    navigate = useNavigate();
  const today = localDate(),
    from = monthStart(),
    to = monthEnd(),
    sixMonths = monthOffset(from, -5);
  const monthly = useTransactions({ from, to }, true),
    historyTx = useTransactions({ from: sixMonths, to }, true);
  const history = useQuery(api.workspace.balanceHistory, {
    from: sixMonths,
    to: today,
  });
  const [customize, setCustomize] = useState(false),
    [range, setRange] = useState("6M");
  const summary = useMemo(
      () => summarize(monthly.results, data),
      [monthly.results, data],
    ),
    flow = useMemo(
      () => summarize(historyTx.results, data),
      [historyTx.results, data],
    );
  const networth = data.accounts
    .filter((a) => a.currency === "USD")
    .reduce((sum, a) => sum + accountNetWorth(a), 0);
  const chart = useMemo(() => {
    const balances = new Map<string, number>();
    const points: { date: string; label: string; value: number }[] = [];
    const accounts = new Map(
      data.accounts
        .filter((a) => !a.excludeNetWorth && a.currency === "USD")
        .map((a) => [a._id as string, a]),
    );
    const days = new Map<string, NonNullable<typeof history>["rows"]>();
    for (const row of history?.rows ?? []) {
      const list = days.get(row.date) ?? [];
      list.push(row);
      days.set(row.date, list);
    }
    for (const [date, rows] of [...days.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      for (const row of rows) {
        const account = accounts.get(row.accountId);
        if (account)
          balances.set(
            account._id,
            (account.kind === "credit" || account.kind === "loan" ? -1 : 1) *
              row.balanceCents,
          );
      }
      points.push({
        date,
        label: dateLabel(date, { month: "short", day: "numeric" }),
        value: [...balances.values()].reduce((sum, b) => sum + b, 0),
      });
    }
    const cutoff =
      range === "1M"
        ? monthOffset(from, -1)
        : range === "3M"
          ? monthOffset(from, -2)
          : sixMonths;
    return points.filter((p) => p.date >= cutoff);
  }, [history, data.accounts, range, from, sixMonths]);
  const change = chart.length > 1 ? networth - chart[0].value : 0;
  const schedules = data.recurring
    .filter((r) => r.active)
    .flatMap((r) =>
      recurringDates(r.nextDate, r.frequency, today, to).map((date) => ({
        ...r,
        date,
        name:
          r.name ??
          data.merchants.find((m) => m._id === r.merchantId)?.name ??
          "Recurring transaction",
        account: data.accounts.find((a) => a._id === r.accountId)?.name ?? "",
        color: data.merchants.find((m) => m._id === r.merchantId)?.color,
      })),
    )
    .map((r) => ({ ...r, kind: "schedule" as const }));
  // A card or loan statement is due every month, so it belongs with upcoming items.
  const statements = data.accounts
    .filter(
      (a) =>
        (a.kind === "credit" || a.kind === "loan") &&
        !a.closed &&
        !!a.dueDate &&
        a.dueDate >= today &&
        a.dueDate <= to &&
        a.statementPaidDate !== a.dueDate &&
        (a.paymentPlan === "minimum"
          ? a.minimumCents !== undefined
          : a.statementCents !== undefined || a.minimumCents !== undefined),
    )
    .map((a) => ({
      _id: a._id,
      kind: "statement" as const,
      date: a.dueDate!,
      name: `${a.name} statement`,
      account:
        a.paymentPlan === "minimum" ? "Minimum payment" : "Statement balance",
      color: undefined,
      logo: a.logoUrl,
      amountCents:
        a.paymentPlan === "minimum"
          ? a.minimumCents!
          : (a.statementCents ?? a.minimumCents!),
    }));
  const upcoming = [...schedules, ...statements]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const defaults = [
      "netWorth",
      "transactions",
      "recurring",
      "spending",
      "cashFlow",
    ],
    widgets = data.profile?.widgets?.length
      ? data.profile.widgets.filter((w) => defaults.includes(w))
      : defaults;
  const complete = monthly.status === "Exhausted";
  const panels: Record<string, React.ReactNode> = {
    netWorth: (
      <Panel
        title="Net worth"
        className="dashboard-networth"
        action={
          <button
            className="text-link subtle-link"
            onClick={() => {
              void navigate("/accounts");
            }}
          >
            View accounts <ArrowRight size={14} />
          </button>
        }
      >
        <div className="networth-top">
          <div>
            <div className="hero-value">{money(networth, false)}</div>
            <div className={`change ${change < 0 ? "negative" : "positive"}`}>
              {change < 0 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
              <strong>{money(Math.abs(change), false)}</strong>
              <span>
                in the last{" "}
                {range === "1M"
                  ? "month"
                  : range === "3M"
                    ? "3 months"
                    : "6 months"}
              </span>
            </div>
          </div>
          <Select
            aria-label="Net worth period"
            className="small-select"
            value={range}
            onValueChange={setRange}
            options={[
              { value: "1M", label: "1M" },
              { value: "3M", label: "3M" },
              { value: "6M", label: "6M" },
            ]}
          />
        </div>
        {history ? (
          chart.length ? (
            <NetWorthChart data={chart} />
          ) : (
            <Empty
              title="Your history starts here"
              description="Balance history will build as your accounts update."
            />
          )
        ) : (
          <Loading text="Loading balance history…" />
        )}
      </Panel>
    ),
    transactions: (
      <Panel
        title="Recent transactions"
        action={
          <Link className="text-link subtle-link" to="/transactions">
            View all <ArrowRight size={14} />
          </Link>
        }
      >
        {monthly.status === "LoadingFirstPage" ? (
          <Loading />
        ) : monthly.results.length ? (
          <div className="dashboard-transactions">
            {monthly.results.slice(0, 5).map((tx) => {
              const m = data.merchants.find((m) => m._id === tx.merchantId),
                c = data.categories.find((c) => c._id === tx.categoryId);
              return (
                <button
                  className="dashboard-tx-row"
                  key={tx._id}
                  onClick={() => {
                    void navigate(`/transactions?transaction=${tx._id}`);
                  }}
                >
                  <Avatar
                    name={m?.name ?? tx.originalName}
                    logo={m?.resolvedLogoUrl}
                    color={m?.color}
                  />
                  <span className="row-title">
                    <strong>{m?.name ?? tx.originalName}</strong>
                    <small>
                      {c?.name} ·{" "}
                      {dateLabel(tx.date, { month: "short", day: "numeric" })}
                    </small>
                  </span>
                  <span
                    className={`amount ${tx.amountCents < 0 ? "positive" : ""}`}
                  >
                    {tx.amountCents < 0 ? "+" : ""}
                    {money(Math.abs(tx.amountCents))}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Your transactions will appear here"
            description="Connect an account to bring in your spending."
          />
        )}
      </Panel>
    ),
    recurring: (
      <Panel
        title="Upcoming recurring"
        action={
          <Link className="text-link subtle-link" to="/recurring">
            View all <ArrowRight size={14} />
          </Link>
        }
      >
        <div className="panel-subtitle">Coming up this month</div>
        {upcoming.length ? (
          upcoming.map((r) => (
            <button
              className="recurring-mini-row"
              key={`${r._id}-${r.date}`}
              onClick={() => {
                void navigate("/recurring");
              }}
            >
              <span className="date-tile">
                <small>{dateLabel(r.date, { month: "short" })}</small>
                <strong>{Number(r.date.slice(8))}</strong>
              </span>
              <Avatar
                name={
                  r.kind === "statement"
                    ? r.name.replace(/ statement$/, "")
                    : r.name
                }
                color={r.color}
                logo={r.kind === "statement" ? r.logo : undefined}
              />
              <span className="row-title">
                <strong>{r.name}</strong>
                <small>{r.account}</small>
              </span>
              <strong className="amount">
                {money(Math.abs(r.amountCents))}
              </strong>
            </button>
          ))
        ) : (
          <Empty
            title="Nothing coming up"
            description="Add recurring bills and subscriptions to see what’s next."
            action={
              <Button
                tone="quiet"
                onClick={() => {
                  void navigate("/recurring");
                }}
              >
                Manage recurring
              </Button>
            }
          />
        )}
      </Panel>
    ),
    spending: (
      <Panel
        title="Spending this month"
        action={
          <span className="muted">{dateLabel(from, { month: "long" })}</span>
        }
      >
        {!complete ? (
          <Loading text="Calculating monthly spending…" />
        ) : summary.spending.length ? (
          <div className="spending-widget">
            <SpendingDonut
              data={summary.spending.filter((s) => s.value > 0)}
              total={summary.expense}
              small
            />
            <div className="spending-legend">
              {summary.spending.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    void navigate("/cash-flow");
                  }}
                >
                  <span className="color-dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <strong>{money(s.value, false)}</strong>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Empty
            title="A fresh start"
            description="Your monthly spending will take shape here."
          />
        )}
        <Link className="panel-footer-link" to="/cash-flow">
          View cash flow <ArrowRight size={14} />
        </Link>
      </Panel>
    ),
    cashFlow: (
      <Panel
        title="Cash flow"
        className="dashboard-cashflow"
        action={
          <Link className="text-link subtle-link" to="/cash-flow">
            View cash flow <ArrowRight size={14} />
          </Link>
        }
      >
        {historyTx.status !== "Exhausted" ? (
          <Loading text="Calculating cash flow…" />
        ) : (
          <>
            <div className="cashflow-summary compact">
              <div>
                <span>Income</span>
                <strong className="positive">
                  {money(flow.income, false)}
                </strong>
              </div>
              <div>
                <span>Expenses</span>
                <strong>{money(flow.expense, false)}</strong>
              </div>
              <div>
                <span>Cash flow</span>
                <strong>{money(flow.savings, false)}</strong>
              </div>
              <span className="muted flow-period">Last 6 months</span>
            </div>
            <FlowChart data={flow.months} />
          </>
        )}
      </Panel>
    ),
  };
  return (
    <>
      <PageHeader title="Dashboard">
        <Button
          icon={<Settings2 size={16} />}
          onClick={() => setCustomize(true)}
        >
          Customize
        </Button>
        <AddAccountButton onClick={onAddAccount} />
      </PageHeader>
      {!data.accounts.length && (
        <div className="welcome-banner">
          <div className="welcome-icon">
            <WalletCards size={25} />
          </div>
          <div>
            <h2>Everything starts with an account.</h2>
            <p>
              Connect Chase, American Express, or Schwab to see your finances
              together.
            </p>
          </div>
          <Button
            tone="primary"
            onClick={onAddAccount}
            icon={<Plus size={16} />}
          >
            Add your first account
          </Button>
        </div>
      )}
      <div className="dashboard-grid">
        {widgets.map((w) => (
          <div className={`dashboard-widget widget-${w}`} key={w}>
            {panels[w]}
          </div>
        ))}
      </div>
      <CustomizeDashboard
        open={customize}
        onClose={() => setCustomize(false)}
        initial={widgets}
      />
    </>
  );
}
function CustomizeDashboard({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: string[];
}) {
  const save = useMutation(api.workspace.saveProfile),
    { run, busy } = useTask();
  const [order, setOrder] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  function move(key: string, index: number) {
    const updated = order.filter((w) => w !== key);
    updated.splice(Math.max(0, Math.min(index, updated.length)), 0, key);
    setOrder(updated);
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize dashboard"
      description="Choose what you see and arrange it your way."
    >
      <div className="reorder-list">
        {Object.keys(widgetNames)
          .sort((a, b) => {
            const ai = order.indexOf(a),
              bi = order.indexOf(b);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          })
          .map((w) => (
            <div
              className="reorder-row"
              key={w}
              draggable={order.includes(w)}
              onDragStart={() => setDrag(w)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag) move(drag, order.indexOf(w));
                setDrag(null);
              }}
            >
              <GripVertical size={18} className="muted" />
              <label>
                <input
                  type="checkbox"
                  checked={order.includes(w)}
                  onChange={(e) =>
                    setOrder((s) =>
                      e.target.checked ? [...s, w] : s.filter((i) => i !== w),
                    )
                  }
                />
                {widgetNames[w]}
              </label>
              <IconButton
                label={`Move ${widgetNames[w]} up`}
                disabled={!order.includes(w) || order.indexOf(w) === 0}
                onClick={() => move(w, order.indexOf(w) - 1)}
              >
                <ArrowUp size={15} />
              </IconButton>
              <IconButton
                label={`Move ${widgetNames[w]} down`}
                disabled={
                  !order.includes(w) || order.indexOf(w) === order.length - 1
                }
                onClick={() => move(w, order.indexOf(w) + 1)}
              >
                <ArrowDown size={15} />
              </IconButton>
            </div>
          ))}
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={busy || !order.length}
          icon={<Check size={16} />}
          onClick={() =>
            void run(async () => {
              await save({ widgets: order });
              onClose();
            }, "Dashboard updated")
          }
        >
          Save changes
        </Button>
      </div>
    </Modal>
  );
}
