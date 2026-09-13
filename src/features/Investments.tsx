import {
  displayFinancialValue,
  useAmountsHidden,
  displayMoney as money,
} from "../lib/amountVisibility";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Landmark,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useData } from "../lib/data";
import { DatePicker } from "../components/folio/DatePicker";
import { dateLabel, localDate, message } from "../lib/format";
import {
  Button,
  Empty,
  Loading,
  Modal,
  Panel,
  Tabs,
  useTask,
} from "../components/folio/ui";
import { Select } from "../components/folio/Select";
import { PageHeader } from "../components/folio/PageHeader";
import { NetWorthChart } from "../components/folio/charts";
import {
  investmentMetrics,
  investmentRange,
  securityType,
  unitPrice,
  units,
} from "./investments/investmentView";
import "./investments/investments.css";
import {
  InvestmentPreview,
  InvestmentPreviewChart,
} from "./investments/InvestmentPreview";

type Overview = FunctionReturnType<typeof api.investments.overview>;
type Holding = Overview["holdings"][number];
const ranges = [
  { value: "1M", label: "Past month" },
  { value: "3M", label: "Past 3 months" },
  { value: "6M", label: "Past 6 months" },
  { value: "YTD", label: "Year to date" },
  { value: "1Y", label: "Past year" },
  { value: "ALL", label: "All history" },
  { value: "custom", label: "Custom dates" },
];
const allocationColors = [
  "#7b9890",
  "#8195ae",
  "#baa17c",
  "#9c91a8",
  "#849b74",
];

function valueLabel(value: number, currency: string) {
  return currency === "USD"
    ? money(value)
    : displayFinancialValue(
        `${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`,
      );
}
function valuedDate(value: string | null) {
  return value
    ? dateLabel(value.slice(0, 10), {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not provided";
}

export function Investments({ onAddAccount }: { onAddAccount?: () => void }) {
  useAmountsHidden();
  const workspace = useData();
  const [params, setParams] = useSearchParams();
  const requestedAccount = params.get("account") ?? "";
  const accountId = workspace.accounts.find(
    (account) =>
      account._id === requestedAccount && account.kind === "investment",
  )?._id;
  const [period, setPeriod] = useState("6M");
  const today = workspace.profile?.demo ? "2026-09-10" : localDate();
  const [customFrom, setCustomFrom] = useState(investmentRange("6M", today));
  const [customTo, setCustomTo] = useState(today);
  const from =
    period === "custom" ? customFrom : investmentRange(period, today);
  const to = period === "custom" ? customTo : today;
  const validRange = !!from && !!to && from <= to;
  const overview = useQuery(api.investments.overview, { accountId });
  const history = useQuery(
    api.investments.history,
    validRange ? { accountId, from, to } : "skip",
  );
  const activity = usePaginatedQuery(
    api.investments.activity,
    validRange ? { accountId, from, to } : "skip",
    { initialNumItems: 10 },
  );
  const sync = useMutation(api.investments.sync);
  const prepareSample = useMutation(api.investments.prepareSample);
  const { busy, run } = useTask();
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [tab, setTab] = useState("holdings");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("value");
  const [allocation, setAllocation] = useState("type");
  const [selectedId, setSelectedId] = useState<Id<"investmentHoldings"> | null>(
    null,
  );
  const holdingTrigger = useRef<HTMLButtonElement | null>(null);
  function openHolding(
    id: Id<"investmentHoldings">,
    trigger: HTMLButtonElement,
  ) {
    holdingTrigger.current = trigger;
    setSelectedId(id);
  }
  useEffect(() => {
    if (!workspace.profile?.demo) return;
    setSampleLoading(true);
    void prepareSample()
      .catch((error) => setSampleError(message(error)))
      .finally(() => setSampleLoading(false));
  }, [workspace.profile?.demo, prepareSample]);

  const holdings = useMemo(() => {
    const matching = (overview?.holdings ?? []).filter((row) =>
      `${row.security?.name ?? ""} ${row.security?.ticker ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
    return [...matching].sort((a, b) => {
      if (sort === "name")
        return (a.security?.name ?? "").localeCompare(b.security?.name ?? "");
      if (sort === "gain") {
        const gainA =
          a.basisCents === null || a.currency !== "USD"
            ? -Infinity
            : a.valueCents - a.basisCents;
        const gainB =
          b.basisCents === null || b.currency !== "USD"
            ? -Infinity
            : b.valueCents - b.basisCents;
        return (
          gainB - gainA ||
          (a.security?.name ?? "").localeCompare(b.security?.name ?? "")
        );
      }
      // Keep currencies separate; values in unlike currencies cannot be ranked as dollars.
      return (
        (a.currency === "USD" ? 0 : 1) - (b.currency === "USD" ? 0 : 1) ||
        a.currency.localeCompare(b.currency) ||
        b.valueCents - a.valueCents
      );
    });
  }, [overview, search, sort]);
  const metrics = investmentMetrics(overview?.holdings ?? []);
  const selectedAccounts = (overview?.accounts ?? []).filter((account) =>
    accountId ? account._id === accountId : !account.hidden && !account.closed,
  );
  const accountValue = selectedAccounts
    .filter((account) => account.currency === "USD")
    .reduce((sum, account) => sum + account.balanceCents, 0);
  const unsupportedAccounts = selectedAccounts.filter(
    (account) => account.currency !== "USD",
  ).length;
  const selectedHolding = overview?.holdings.find(
    (row) => row._id === selectedId,
  );
  const syncing =
    overview?.connections.some(
      (connection) => connection.status === "syncing",
    ) ?? false;
  const canSync =
    overview?.connections.some(
      (connection) => connection.status !== "disconnected",
    ) ?? false;
  const allocationRows = useMemo(() => {
    const values = new Map<string, number>();
    for (const position of overview?.holdings ?? []) {
      if (position.currency !== "USD") continue;
      const label =
        allocation === "account"
          ? (overview?.accounts.find(
              (account) => account._id === position.accountId,
            )?.name ?? "Account")
          : securityType(
              position.security?.type,
              position.security?.isCashEquivalent,
            );
      values.set(label, (values.get(label) ?? 0) + position.valueCents);
    }
    return [...values]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [overview, allocation]);
  const grossAllocation = allocationRows.reduce(
    (sum, row) => sum + Math.abs(row.value),
    0,
  );
  const negativeAllocation = allocationRows.some((row) => row.value < 0);
  const chart = useMemo(
    () =>
      history?.points.map((point) => ({
        label: dateLabel(point.date, { month: "short", day: "numeric" }),
        value: point.value,
      })) ?? [],
    [history],
  );
  const connect = onAddAccount ? (
    <Button icon={<Plus size={16} />} onClick={onAddAccount}>
      Add account
    </Button>
  ) : (
    <Link className="f-button" to="/settings/institutions">
      <Plus size={16} /> Add account
    </Link>
  );

  if (overview && !overview.demo && !overview.accounts.length) {
    return (
      <>
        <PageHeader title="Investments" />
        <InvestmentPreview
          action={
            onAddAccount ? (
              <Button
                tone="primary"
                icon={<Plus size={16} />}
                onClick={onAddAccount}
              >
                Add account
              </Button>
            ) : (
              connect
            )
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Investments">
        <Button
          icon={
            <RefreshCw size={15} className={busy || syncing ? "spin" : ""} />
          }
          disabled={busy || syncing || !canSync || !!overview?.demo}
          onClick={() =>
            void run(() => sync({ accountId }), "Investment sync requested")
          }
        >
          {busy || syncing ? "Syncing…" : "Sync"}
        </Button>
        {connect}
      </PageHeader>
      <div className="investments-page">
        <div className="investment-controls">
          <Select
            aria-label="Investment account"
            value={accountId ?? ""}
            onValueChange={(id) => {
              const next = new URLSearchParams(params);
              if (id) next.set("account", id);
              else next.delete("account");
              setParams(next);
              setSelectedId(null);
            }}
            options={[
              { value: "", label: "All active accounts" },
              ...(overview?.accounts ?? []).map((account) => ({
                value: account._id,
                label: `${account.name}${account.closed ? " · closed" : account.hidden ? " · hidden" : ""}`,
              })),
            ]}
          />
          <div className="investment-date-controls">
            <Select
              aria-label="Investment date range"
              value={period}
              onValueChange={setPeriod}
              options={ranges}
            />
            {period === "custom" && (
              <>
                <DatePicker
                  label="Investment start date"
                  value={customFrom}
                  onChange={setCustomFrom}
                  max={customTo || undefined}
                />
                <span className="muted">to</span>
                <DatePicker
                  label="Investment end date"
                  value={customTo}
                  onChange={setCustomTo}
                  min={customFrom || undefined}
                  max={today}
                />
              </>
            )}
          </div>
        </div>
        {!validRange && (
          <p className="investment-notice" role="alert">
            Choose an end date on or after the start date.
          </p>
        )}
        {overview?.demo && (
          <div className="investment-note">
            <Landmark size={15} /> Sample portfolio · fictional funds, prices,
            and activity
          </div>
        )}
        {overview?.accounts.some(
          (account) =>
            account.simplefinConnectionId &&
            (!accountId || account._id === accountId),
        ) && (
          <p className="investment-note investment-note-text">
            SimpleFIN positions update with your bank connection. Unit prices
            are calculated from position value and quantity. Cost basis, gains
            and security price history are unavailable here because their
            meaning or coverage has not been verified. Sync from{" "}
            <Link to="/settings/institutions#simplefin">Bank connections</Link>.
          </p>
        )}
        {sampleError && (
          <p className="investment-notice" role="alert">
            {sampleError}
          </p>
        )}
        {overview?.connections.map((connection) =>
          connection.error || connection.status === "disconnected" ? (
            <div
              className="investment-notice"
              role="status"
              key={connection.itemId}
            >
              <span>
                <b>{connection.institution}</b> ·{" "}
                {connection.status === "disconnected"
                  ? "Disconnected. Showing the last saved holdings."
                  : connection.error}
              </span>
              <Link to="/settings/institutions">
                Manage connection <ArrowUpRight size={14} />
              </Link>
            </div>
          ) : null,
        )}
        {(metrics.unsupportedCount > 0 || unsupportedAccounts > 0) && (
          <p className="investment-notice">
            USD totals exclude {metrics.unsupportedCount} non-USD or
            unknown-currency holdings and {unsupportedAccounts} accounts. No
            exchange rate was applied.
          </p>
        )}
        {!overview ? (
          <Loading />
        ) : (
          <>
            <div className="investment-summary">
              <div>
                <span>Account value</span>
                <strong>{money(accountValue)}</strong>
                <small>
                  {selectedAccounts.length}{" "}
                  {selectedAccounts.length === 1 ? "account" : "accounts"} ·
                  cached balances
                </small>
              </div>
              <div>
                <span>Unrealized gain / loss</span>
                <strong
                  className={
                    metrics.gain === null
                      ? ""
                      : metrics.gain >= 0
                        ? "positive"
                        : "negative"
                  }
                >
                  {metrics.gain === null
                    ? "—"
                    : `${metrics.gain > 0 ? "+" : ""}${money(metrics.gain)}`}
                </strong>
                <small>
                  {metrics.gainPercent === null
                    ? "Based on available cost basis"
                    : `${metrics.gainPercent >= 0 ? "+" : ""}${metrics.gainPercent.toFixed(1)}% on known cost basis`}
                </small>
              </div>
              <div>
                <span>Cost basis coverage</span>
                <strong>
                  {metrics.coverage === null
                    ? "—"
                    : `${Math.round(metrics.coverage)}%`}
                </strong>
                <small>
                  {metrics.knownCount} of {metrics.totalCount} USD holdings · by
                  absolute value
                </small>
              </div>
            </div>
            <div className="investment-overview-grid">
              <Panel
                title="Account value over time"
                className="investment-value-panel"
              >
                <p className="investment-panel-note">
                  Includes deposits and withdrawals. This chart shows account
                  value, not investment return.
                </p>
                {!validRange ? (
                  <div className="investment-chart-empty">
                    Choose a valid date range.
                  </div>
                ) : !history ? (
                  <Loading />
                ) : !history.complete ? (
                  <div className="investment-chart-empty">
                    Choose a shorter range to load complete balance history.
                  </div>
                ) : chart.length > 1 ? (
                  <NetWorthChart
                    data={chart}
                    id="investments-value"
                    color="#78978d"
                    valueLabel="Account value"
                  />
                ) : (
                  <div className="investment-chart-empty investment-history-preview">
                    <InvestmentPreviewChart />
                    <p>
                      {chart.length === 1
                        ? "One valuation saved"
                        : "Start building your investment history"}
                    </p>
                    <small>
                      At least two complete account snapshots are needed to show
                      a trend.
                    </small>
                  </div>
                )}
                <div className="investment-value-footnote">
                  <CircleHelp size={14} />
                  <span>
                    History starts when all selected USD accounts have a saved
                    balance.
                  </span>
                </div>
              </Panel>
              <Panel
                title="Holdings allocation"
                className="investment-allocation-panel"
                action={
                  <Select
                    aria-label="Allocation grouping"
                    value={allocation}
                    onValueChange={setAllocation}
                    options={[
                      { value: "type", label: "Security type" },
                      { value: "account", label: "Account" },
                    ]}
                  />
                }
              >
                {allocationRows.length ? (
                  <div className="investment-allocation-list">
                    {allocationRows.map((row, index) => (
                      <div className="investment-allocation-row" key={row.name}>
                        <div>
                          <span>
                            <i
                              style={{
                                background:
                                  allocationColors[
                                    index % allocationColors.length
                                  ],
                              }}
                            />
                            {row.name}
                          </span>
                          <span>{money(row.value)}</span>
                        </div>
                        <div className="investment-allocation-track">
                          <span
                            style={{
                              width: `${grossAllocation ? (Math.abs(row.value) / grossAllocation) * 100 : 0}%`,
                              background:
                                allocationColors[
                                  index % allocationColors.length
                                ],
                            }}
                          />
                        </div>
                        <small>
                          {grossAllocation
                            ? (
                                (Math.abs(row.value) / grossAllocation) *
                                100
                              ).toFixed(1)
                            : "0.0"}
                          %
                          {negativeAllocation
                            ? " of absolute position value"
                            : " of holdings"}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="investment-allocation-empty">
                    {allocation === "type"
                      ? "A breakdown by security type appears once your brokerage shares its holdings."
                      : "A breakdown by account appears once your brokerage shares its holdings."}
                  </p>
                )}
                {allocationRows.length > 0 && (
                  <p className="investment-panel-note">
                    {allocation === "type"
                      ? "By reported security type; fund holdings are not broken down."
                      : "By account; account balances may include amounts outside these holdings."}
                  </p>
                )}
                {!!overview.holdings.length &&
                  Math.abs(accountValue - metrics.value) > 1 && (
                    <p className="investment-panel-note">
                      {money(accountValue - metrics.value)} difference from
                      account value. Cash, unsettled activity, or valuation
                      timing may explain it; it is not classified as cash
                      automatically.
                    </p>
                  )}
              </Panel>
            </div>
            <Panel className="investment-detail-panel">
              <div className="investment-detail-heading">
                <Tabs
                  value={tab}
                  onChange={setTab}
                  items={[
                    {
                      value: "holdings",
                      label: `Holdings${overview.holdings.length ? ` · ${overview.holdings.length}` : ""}`,
                    },
                    { value: "activity", label: "Activity" },
                  ]}
                />
                {tab === "holdings" && (
                  <div className="investment-table-controls">
                    <label className="investment-search">
                      <Search size={15} />
                      <input
                        aria-label="Search holdings"
                        placeholder="Find a holding…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <Select
                      aria-label="Sort holdings"
                      value={sort}
                      onValueChange={setSort}
                      options={[
                        { value: "value", label: "Largest value" },
                        { value: "name", label: "Name A–Z" },
                        { value: "gain", label: "Unrealized gain" },
                      ]}
                    />
                  </div>
                )}
              </div>
              {tab === "holdings" ? (
                sampleLoading && !holdings.length ? (
                  <Loading />
                ) : holdings.length ? (
                  <>
                    <div className="investment-table-scroll">
                      <table className="investment-table investment-holdings-table">
                        <thead>
                          <tr>
                            <th>Holding</th>
                            <th>Account</th>
                            <th className="numeric">Units</th>
                            <th className="numeric">Price</th>
                            <th className="numeric">Value</th>
                            <th className="numeric">Unrealized gain</th>
                            <th>
                              <span className="sr-only">Details</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdings.map((holding) => (
                            <tr key={holding._id}>
                              <td>
                                <button
                                  className="investment-holding-button"
                                  onClick={(event) =>
                                    openHolding(
                                      holding._id,
                                      event.currentTarget,
                                    )
                                  }
                                >
                                  <span className="investment-security-mark">
                                    {holding.security?.isCashEquivalent
                                      ? "$"
                                      : (
                                          holding.security?.ticker ??
                                          holding.security?.name ??
                                          "?"
                                        ).slice(0, 2)}
                                  </span>
                                  <span>
                                    {holding.security?.name ??
                                      "Security details unavailable"}
                                    <small>
                                      {holding.security?.ticker
                                        ? `${holding.security.ticker} · `
                                        : ""}
                                      {securityType(
                                        holding.security?.type,
                                        holding.security?.isCashEquivalent,
                                      )}
                                    </small>
                                    <small className="investment-mobile-account">
                                      {overview.accounts.find(
                                        (account) =>
                                          account._id === holding.accountId,
                                      )?.name ?? "Account"}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td className="investment-account-cell">
                                {overview.accounts.find(
                                  (account) =>
                                    account._id === holding.accountId,
                                )?.name ?? "Account"}
                              </td>
                              <td className="numeric">
                                {displayFinancialValue(units(holding.quantity))}
                              </td>
                              <td className="numeric">
                                {holding.price === null
                                  ? "—"
                                  : displayFinancialValue(
                                      unitPrice(
                                        holding.price,
                                        holding.currency,
                                      ),
                                    )}
                                <small>{valuedDate(holding.priceDate)}</small>
                              </td>
                              <td className="numeric">
                                {valueLabel(
                                  holding.valueCents,
                                  holding.currency,
                                )}
                              </td>
                              <td
                                className={`numeric ${holding.basisCents === null ? "muted" : holding.valueCents >= holding.basisCents ? "positive" : "negative"}`}
                              >
                                {holding.simplefinConnectionId
                                  ? "This SimpleFIN unit price is position value divided by quantity. Its quote date and total cost basis have not been verified, so unrealized gain is unavailable. "
                                  : holding.basisCents === null
                                    ? "Unavailable"
                                    : valueLabel(
                                        holding.valueCents - holding.basisCents,
                                        holding.currency,
                                      )}
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`View ${holding.security?.name ?? "holding"} details`}
                                  onClick={(event) =>
                                    openHolding(
                                      holding._id,
                                      event.currentTarget,
                                    )
                                  }
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="investment-table-footnote">
                      Current positions · prices are supplied by the institution
                      and may update after market close. The date range applies
                      to history and activity.
                    </div>
                  </>
                ) : (
                  <Empty
                    icon={<Landmark size={26} />}
                    title={
                      search
                        ? "No matching holdings"
                        : "Your investments, in one place"
                    }
                    description={
                      search
                        ? "Try a name or ticker symbol."
                        : selectedAccounts.length
                          ? "Account balances are available. Connect a supported brokerage or sync its holdings to see the securities you own."
                          : "Add a retirement or brokerage account to see its balance, holdings, and activity."
                    }
                  />
                )
              ) : (
                <>
                  <p className="investment-panel-note investment-activity-note">
                    Investment activity is separate from spending. Negative cash
                    movement is money out; positive is money in. Canceled events
                    remain visible for reference.
                  </p>
                  {!validRange ? (
                    <p className="investment-allocation-empty">
                      Choose a valid date range.
                    </p>
                  ) : activity.status === "LoadingFirstPage" ? (
                    <Loading />
                  ) : activity.results.length ? (
                    <div className="investment-table-scroll">
                      <table className="investment-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Activity</th>
                            <th>Account</th>
                            <th className="numeric">Cash movement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activity.results.map((event) => (
                            <tr
                              className={
                                event.canceled ? "investment-canceled" : ""
                              }
                              key={event._id}
                            >
                              <td>
                                {dateLabel(event.date, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </td>
                              <td>
                                {event.name}
                                <small>
                                  {event.canceled
                                    ? "Canceled"
                                    : event.cancelTransactionId
                                      ? "Reversal"
                                      : securityType(event.subtype)}
                                  {event.quantity !== null &&
                                  event.quantity !== 0
                                    ? ` · ${displayFinancialValue(units(event.quantity))} units`
                                    : ""}
                                  {event.feesCents
                                    ? ` · ${valueLabel(event.feesCents, event.currency)} fees`
                                    : ""}
                                </small>
                              </td>
                              <td>
                                {overview.accounts.find(
                                  (account) => account._id === event.accountId,
                                )?.name ?? "Account"}
                              </td>
                              <td className="numeric">
                                {event.amountCents < 0
                                  ? "+"
                                  : event.amountCents > 0
                                    ? "−"
                                    : ""}
                                {valueLabel(
                                  Math.abs(event.amountCents),
                                  event.currency,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon={<Landmark size={25} />}
                      title="No activity in this range"
                      description="Try a longer date range. Banks may provide less than two years of history."
                    />
                  )}
                  {validRange &&
                    activity.status !== "Exhausted" &&
                    activity.status !== "LoadingFirstPage" && (
                      <div className="investment-load-more">
                        <Button
                          disabled={activity.status === "LoadingMore"}
                          onClick={() => activity.loadMore(25)}
                        >
                          {activity.status === "LoadingMore"
                            ? "Loading…"
                            : "Load more activity"}
                        </Button>
                      </div>
                    )}
                </>
              )}
            </Panel>
            <div className="investment-source-note">
              <Link to="/accounts">
                View accounts <ArrowUpRight size={14} />
              </Link>
            </div>
          </>
        )}
        <HoldingDetail
          holding={selectedHolding}
          accounts={overview?.accounts ?? []}
          onClose={() => setSelectedId(null)}
          restoreFocus={() => holdingTrigger.current?.focus()}
        />
      </div>
    </>
  );
}

function HoldingDetail({
  holding,
  accounts,
  onClose,
  restoreFocus,
}: {
  holding?: Holding;
  accounts: Overview["accounts"];
  onClose: () => void;
  restoreFocus: () => void;
}) {
  useAmountsHidden();
  const detailRef = useRef<HTMLDivElement | null>(null);
  const account = accounts.find((row) => row._id === holding?.accountId);
  return (
    <Modal
      open={!!holding}
      onClose={onClose}
      title={holding?.security?.name ?? "Holding details"}
      drawer
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        detailRef.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }}
    >
      {holding && (
        <div
          className="investment-holding-detail"
          ref={detailRef}
          tabIndex={-1}
        >
          <div className="investment-detail-value">
            <span>Holding value</span>
            <strong>{valueLabel(holding.valueCents, holding.currency)}</strong>
            <small>
              {account?.name} · {account?.institution}
            </small>
          </div>
          <dl>
            <div>
              <dt>Ticker</dt>
              <dd>{holding.security?.ticker ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Security type</dt>
              <dd>
                {securityType(
                  holding.security?.type,
                  holding.security?.isCashEquivalent,
                )}
              </dd>
            </div>
            <div>
              <dt>Units held</dt>
              <dd>{displayFinancialValue(units(holding.quantity))}</dd>
            </div>
            <div>
              <dt>Institution price</dt>
              <dd>
                {holding.price === null
                  ? "Not provided"
                  : displayFinancialValue(
                      unitPrice(holding.price, holding.currency),
                    )}
              </dd>
            </div>
            <div>
              <dt>Valuation date</dt>
              <dd>{valuedDate(holding.priceDate)}</dd>
            </div>
            <div>
              <dt>Total cost basis</dt>
              <dd>
                {holding.simplefinConnectionId
                  ? "This SimpleFIN unit price is position value divided by quantity. Its quote date and total cost basis have not been verified, so unrealized gain is unavailable. "
                  : holding.basisCents === null
                    ? "Not provided"
                    : valueLabel(holding.basisCents, holding.currency)}
              </dd>
            </div>
            <div>
              <dt>Unrealized gain / loss</dt>
              <dd>
                {holding.simplefinConnectionId
                  ? "This SimpleFIN unit price is position value divided by quantity. Its quote date and total cost basis have not been verified, so unrealized gain is unavailable. "
                  : holding.basisCents === null
                    ? "Unavailable"
                    : valueLabel(
                        holding.valueCents - holding.basisCents,
                        holding.currency,
                      )}
              </dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>
                {new Date(holding.syncedAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            {holding.security?.cusip && (
              <div>
                <dt>CUSIP</dt>
                <dd>{holding.security.cusip}</dd>
              </div>
            )}
            {holding.security?.isin && (
              <div>
                <dt>ISIN</dt>
                <dd>{holding.security.isin}</dd>
              </div>
            )}
          </dl>
          <p className="investment-detail-explanation">
            {holding.simplefinConnectionId
              ? "This SimpleFIN unit price is position value divided by quantity. Its quote date and total cost basis have not been verified, so unrealized gain is unavailable. "
              : holding.basisCents === null
                ? "The institution did not supply cost basis for this position, so its unrealized gain is unavailable. "
                : "Unrealized gain compares the current position value with its reported total cost basis. "}
            This is not a time-period return or a tax calculation.
          </p>
          {holding.currency !== "USD" && (
            <p className="investment-notice">
              This holding is excluded from USD totals. No currency conversion
              has been applied.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
