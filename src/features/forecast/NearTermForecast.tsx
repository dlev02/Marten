import { AmountInput } from "../../components/folio/AmountInput";
import {
  useAmountsHidden,
  displayCompactMoney as compactMoney,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { mergePaymentStatus } from "../../../convex/lib/recurringPayments";
import { useEffect, useId, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../../convex/_generated/api";
import { Button, Empty, Loading } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { useData } from "../../lib/data";
import { dateLabel, localDate } from "../../lib/format";
import { cashRunway, runwayDate, type RunwayHorizon } from "./cashRunway";
import { ForecastPreview } from "./ForecastPreview";
import "./nearTerm.css";

const tick = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-app)",
};
const shortDate = (date: string) =>
  dateLabel(date, { month: "short", day: "numeric" });

export function NearTermForecast({
  onAddAccount,
}: {
  onAddAccount: () => void;
}) {
  useAmountsHidden();
  const data = useData();
  const allowanceId = useId();
  const [days, setDays] = useState<RunwayHorizon>(90);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [allowance, setAllowance] = useState("0");
  const [dailySpendingCents, setDailySpendingCents] = useState(0);
  const [visibleEvents, setVisibleEvents] = useState(12);
  const today = localDate();
  const from = runwayDate(today, 1);
  const to = runwayDate(today, days);
  const accounts = useMemo(
    () =>
      data.accounts.filter(
        (account) =>
          account.kind === "cash" &&
          !account.closed &&
          account.currency === "USD",
      ),
    [data.accounts],
  );
  const accountId = accounts.some((account) => account._id === selectedAccount)
    ? selectedAccount
    : "";
  const {
    results: payments,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.recurring.payments,
    { from, to },
    { initialNumItems: 200 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(200);
  }, [status, loadMore]);
  const automatic = useQuery(api.recurring.automaticPayments, { from, to });
  const forecast = useMemo(() => {
    if (status !== "Exhausted" || automatic === undefined) return null;
    try {
      return {
        result: cashRunway({
          asOf: today,
          days,
          accounts: data.accounts,
          schedules: data.recurring,
          payments: mergePaymentStatus(automatic, payments),
          accountId: accountId || undefined,
          dailySpendingCents,
        }),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof Error
            ? error.message
            : "The forecast is unavailable.",
      };
    }
  }, [
    status,
    today,
    days,
    data.accounts,
    data.recurring,
    payments,
    automatic,
    accountId,
    dailySpendingCents,
  ]);
  const result = forecast?.result;
  const validAllowance =
    /^\d+(\.\d{0,2})?$/.test(allowance) &&
    Number.isSafeInteger(Math.round(Number(allowance) * 100));
  const merchantName = (id: string) =>
    data.merchants.find((merchant) => merchant._id === id)?.name ??
    "Recurring item";
  const accountName = (id: string) =>
    data.accounts.find((account) => account._id === id)?.name ?? "Account";

  if (!accounts.length) {
    return <ForecastPreview nearTerm onAddAccount={onAddAccount} />;
  }
  return (
    <div className="near-term">
      <div className="near-term-heading">
        <h2>Cash runway</h2>
        <p>
          See how scheduled payments and your spending allowance could change
          your cash.
        </p>
      </div>
      <section
        className="near-term-controls panel"
        aria-label="Cash runway assumptions"
      >
        <div className="near-term-choice">
          <span id={`${allowanceId}-account`}>Cash accounts</span>
          <Select
            aria-labelledby={`${allowanceId}-account`}
            value={accountId}
            onValueChange={(value) => {
              setSelectedAccount(value);
              setVisibleEvents(12);
            }}
            options={[
              { value: "", label: "All cash accounts · USD" },
              ...accounts.map((account) => ({
                value: account._id,
                label: account.name,
              })),
            ]}
          />
        </div>
        <div className="near-term-choice">
          <span id={`${allowanceId}-period`}>Look ahead</span>
          <Select
            aria-labelledby={`${allowanceId}-period`}
            value={String(days)}
            onValueChange={(value) => {
              setDays(Number(value) as RunwayHorizon);
              setVisibleEvents(12);
            }}
            options={[
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "365", label: "365 days" },
            ]}
          />
        </div>
        <div className="near-term-choice">
          <label htmlFor={allowanceId}>Extra spending per day</label>
          <div className="near-term-allowance">
            <span aria-hidden="true">$</span>
            <AmountInput
              id={allowanceId}
              inputMode="decimal"
              value={allowance}
              aria-invalid={!validAllowance}
              aria-describedby={`${allowanceId}-hint`}
              onChange={(event) => {
                const value = event.target.value;
                setAllowance(value);
                const cents = Math.round(Number(value) * 100);
                if (
                  /^\d+(\.\d{0,2})?$/.test(value) &&
                  Number.isSafeInteger(cents)
                )
                  setDailySpendingCents(cents);
              }}
              onBlur={() => setAllowance(String(dailySpendingCents / 100))}
            />
            <span aria-hidden="true">/ day</span>
          </div>
        </div>
        <p
          id={`${allowanceId}-hint`}
          className={`near-term-control-hint ${validAllowance ? "" : "invalid"}`}
        >
          {validAllowance
            ? "For costs outside your schedules. This allowance is subtracted once per day from the selected cash total."
            : "Enter an amount with up to two decimal places. The forecast keeps the last valid allowance."}
        </p>
      </section>
      {!forecast ? (
        <div className="near-term-loading panel">
          <Loading text="Checking all scheduled payment statuses…" />
        </div>
      ) : forecast.error ? (
        <div className="near-term-notice error" role="alert">
          <AlertCircle size={19} />
          <p>{forecast.error}</p>
        </div>
      ) : (
        result && (
          <>
            <div className="near-term-totals">
              <div className="panel">
                <span>Cash today</span>
                <strong>{money(result.startingCents)}</strong>
                <small>
                  {result.includedAccounts.length}{" "}
                  {result.includedAccounts.length === 1
                    ? "account"
                    : "accounts"}{" "}
                  · latest recorded balances
                </small>
              </div>
              <div className="panel">
                <span>Lowest balance</span>
                <strong
                  className={result.minimum.balanceCents < 0 ? "negative" : ""}
                >
                  {money(result.minimum.balanceCents)}
                </strong>
                <small>
                  {result.minimum.date === today
                    ? "Today"
                    : dateLabel(result.minimum.date)}
                </small>
              </div>
              <div className="panel">
                <span>Balance after {days} days</span>
                <strong className={result.endingCents < 0 ? "negative" : ""}>
                  {money(result.endingCents)}
                </strong>
                <small>{dateLabel(result.to)}</small>
              </div>
            </div>
            {result.firstShortfall && (
              <div className="near-term-notice error" role="status">
                <AlertCircle size={19} />
                <p>
                  {result.firstShortfall.date === today
                    ? "Your starting cash balance is below zero."
                    : `Cash first falls below zero on ${dateLabel(result.firstShortfall.date)} under these assumptions.`}{" "}
                  Review the timing of your deposits and payments.
                </p>
              </div>
            )}
            <section
              className="near-term-projection panel"
              aria-label="Projected cash balance"
            >
              <div className="near-term-section-heading">
                <h3>Cash over time</h3>
                <p>Today’s balance, then projected daily closing balances.</p>
              </div>
              <div
                className="near-term-chart"
                role="img"
                aria-label={`Cash starts at ${money(result.startingCents)}, reaches a low of ${money(result.minimum.balanceCents)} on ${dateLabel(result.minimum.date)}, and ends at ${money(result.endingCents)} on ${dateLabel(result.to)}.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={result.points}
                    margin={{ top: 15, right: 4, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 4"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      tick={tick}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={45}
                    />
                    <YAxis
                      tickFormatter={(value: number) => compactMoney(value)}
                      orientation="right"
                      width={63}
                      tick={tick}
                      axisLine={false}
                      tickLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0]
                          .payload as (typeof result.points)[number];
                        return (
                          <div className="chart-tooltip">
                            <strong>{dateLabel(point.date)}</strong>
                            <div>
                              <span>
                                {point.date === today
                                  ? "Current balance"
                                  : "Closing balance"}
                              </span>
                              <b>{money(point.balanceCents)}</b>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {result.minimum.balanceCents < 0 && (
                      <ReferenceLine
                        y={0}
                        stroke="var(--negative, #b13e35)"
                        strokeDasharray="4 4"
                      />
                    )}
                    <Line
                      type="stepAfter"
                      dataKey="balanceCents"
                      stroke="var(--blue)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="near-term-chart-note">
                <Info size={16} />
                <p>
                  {dailySpendingCents === 0
                    ? "Variable spending is not included. Add a daily allowance for costs outside your schedules."
                    : `${money(result.variableSpendingCents)} in extra spending is included across ${days} days, in addition to your schedules.`}
                </p>
              </div>
              {!!result.excludedSchedules.length && (
                <p className="near-term-exclusions">
                  {result.excludedSchedules.length} active schedules use
                  accounts outside this cash view and are excluded. Details
                  below.
                </p>
              )}
            </section>
            <section
              className="near-term-events panel"
              aria-label="Scheduled cash activity"
            >
              <div className="near-term-section-heading">
                <div>
                  <h3>Scheduled cash activity</h3>
                  <p>
                    {result.events.length} unpaid{" "}
                    {result.events.length === 1 ? "occurrence" : "occurrences"}{" "}
                    · {shortDate(result.from)}–{shortDate(result.to)}
                  </p>
                </div>
                <Link to="/recurring">Manage schedules</Link>
              </div>
              {result.events.length ? (
                <>
                  <ol>
                    {result.events.slice(0, visibleEvents).map((event) => (
                      <li key={event.id}>
                        <time dateTime={event.date}>
                          {shortDate(event.date)}
                        </time>
                        <span
                          className={`near-term-event-icon ${event.amountCents < 0 ? "incoming" : ""}`}
                          aria-hidden="true"
                        >
                          {event.amountCents < 0 ? (
                            <ArrowDownLeft size={17} />
                          ) : (
                            <ArrowUpRight size={17} />
                          )}
                        </span>
                        <span className="near-term-event-name">
                          <strong>
                            {event.name || merchantName(event.merchantId)}
                          </strong>
                          <small>{accountName(event.accountId)}</small>
                        </span>
                        <span
                          className={`near-term-event-amount ${event.amountCents < 0 ? "incoming" : ""}`}
                        >
                          {event.amountCents < 0 ? "+" : "−"}
                          {money(Math.abs(event.amountCents))}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {result.events.length > visibleEvents && (
                    <div className="near-term-more">
                      <Button
                        onClick={() => setVisibleEvents((count) => count + 50)}
                      >
                        Show more activity
                      </Button>
                      <span>
                        {Math.min(visibleEvents, result.events.length)} of{" "}
                        {result.events.length}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <Empty
                  title="No scheduled cash activity in this period"
                  description="The projection includes only your starting cash and daily spending allowance. Add recurring deposits and bills to build out the schedule."
                />
              )}
            </section>
            <details className="near-term-assumptions">
              <summary>What this forecast includes</summary>
              <ul>
                <li>
                  Latest recorded USD cash balances. Today is the starting
                  point; scheduled occurrences dated today are not added again.
                </li>
                <li>
                  Active recurring schedules attached to the selected cash
                  accounts. Occurrences marked paid are excluded after every
                  payment-status page is loaded.
                </li>
                <li>
                  Credit-card purchases are excluded. A card payment affects
                  cash only if you schedule it from a cash account.
                </li>
                <li>
                  Transfers between included cash accounts need matching
                  outgoing and incoming schedules. Daily closing totals do not
                  establish the order of payments within a day.
                </li>
                <li>
                  No interest, investment growth, unscheduled income, or other
                  spending is assumed. The daily allowance is separate from
                  scheduled costs.
                </li>
              </ul>
              {!!result.excludedSchedules.length && (
                <p>
                  {result.excludedSchedules.length} active{" "}
                  {result.excludedSchedules.length === 1
                    ? "schedule is"
                    : "schedules are"}{" "}
                  excluded because the account is a card, investment, closed,
                  missing, or outside USD:{" "}
                  {result.excludedSchedules
                    .map(
                      (schedule) =>
                        schedule.name || merchantName(schedule.merchantId),
                    )
                    .join(", ")}
                  .
                </p>
              )}
              {!!result.otherCurrencyAccounts.length && (
                <p>
                  {result.otherCurrencyAccounts.length} cash{" "}
                  {result.otherCurrencyAccounts.length === 1
                    ? "account uses"
                    : "accounts use"}{" "}
                  another currency and{" "}
                  {result.otherCurrencyAccounts.length === 1 ? "is" : "are"} not
                  combined with USD balances.
                </p>
              )}
            </details>
          </>
        )
      )}
    </div>
  );
}
