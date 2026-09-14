import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChartNoAxesCombined,
  Gauge,
  Plus,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { groupCreditHistory } from "../../../convex/lib/creditScores";
import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { creditBand, creditScaleFraction } from "../../lib/creditBands";
import { dateLabel, localDate } from "../../lib/format";
import { Button, Empty, Loading, Panel } from "../../components/folio/ui";
import { NetWorthChart } from "../../components/folio/charts";
import {
  allocationColors,
  investmentMetrics,
  investmentRange,
  securityType,
} from "../investments/investmentView";

const HISTORY_PERIOD = "6M";
const ALLOCATION_ROWS = 4;

/** Portfolio value, its six-month path, and how the holdings split by type. */
export function InvestmentsWidget() {
  useAmountsHidden();
  const navigate = useNavigate();
  const today = localDate();
  const from = investmentRange(HISTORY_PERIOD, today);
  const overview = useQuery(api.investments.overview, {});
  const history = useQuery(api.investments.history, { from, to: today });
  const accounts = useMemo(
    () =>
      (overview?.accounts ?? []).filter(
        (account) => !account.hidden && !account.closed,
      ),
    [overview],
  );
  const value = accounts
    .filter((account) => account.currency === "USD")
    .reduce((sum, account) => sum + account.balanceCents, 0);
  const metrics = investmentMetrics(overview?.holdings ?? []);
  const points = useMemo(
    () =>
      (history?.points ?? []).map((point) => ({
        label: dateLabel(point.date, { month: "short", day: "numeric" }),
        value: point.value,
      })),
    [history],
  );
  // The change compares the two ends of the same series, so a partial history never inflates it.
  const change =
    points.length > 1
      ? points[points.length - 1].value - points[0].value
      : null;
  const allocation = useMemo(() => {
    const values = new Map<string, number>();
    for (const position of overview?.holdings ?? []) {
      if (position.currency !== "USD") continue;
      const label = securityType(
        position.security?.type,
        position.security?.isCashEquivalent,
      );
      values.set(label, (values.get(label) ?? 0) + position.valueCents);
    }
    const rows = [...values]
      .map(([name, value]) => ({ name, value: Math.abs(value) }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    const shown = rows.slice(0, ALLOCATION_ROWS);
    const rest = rows
      .slice(ALLOCATION_ROWS)
      .reduce((sum, r) => sum + r.value, 0);
    if (rest > 0) shown.push({ name: "Other", value: rest });
    const total = shown.reduce((sum, row) => sum + row.value, 0);
    return shown.map((row, index) => ({
      ...row,
      share: total ? row.value / total : 0,
      color: allocationColors[index % allocationColors.length],
    }));
  }, [overview]);
  return (
    <Panel
      title="Investments"
      className="dashboard-investments"
      action={
        <Link className="text-link subtle-link" to="/investments">
          View investments <ArrowRight size={14} />
        </Link>
      }
    >
      {!overview ? (
        <Loading text="Loading your portfolio…" />
      ) : !accounts.length ? (
        <Empty
          icon={<ChartNoAxesCombined size={24} strokeWidth={1.6} />}
          title="Your portfolio will appear here"
          description="Connect a brokerage or add a retirement account to follow its value and holdings."
          action={
            <Button
              onClick={() => {
                void navigate("/investments");
              }}
            >
              Open Investments
            </Button>
          }
        />
      ) : (
        <>
          <div className="portfolio-top">
            <div>
              <div className="hero-value">{money(value, false)}</div>
              {change === null ? (
                <div className="change muted-change">
                  <span>Value history builds with each update</span>
                </div>
              ) : (
                <div
                  className={`change ${change < 0 ? "negative" : "positive"}`}
                >
                  {change < 0 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                  <strong>{money(Math.abs(change), false)}</strong>
                  <span>in the last 6 months</span>
                </div>
              )}
            </div>
            <div className="portfolio-gain">
              <span>Unrealized gain</span>
              <strong
                className={
                  metrics.gain === null
                    ? ""
                    : metrics.gain < 0
                      ? "negative"
                      : "positive"
                }
              >
                {metrics.gain === null
                  ? "—"
                  : `${metrics.gain > 0 ? "+" : metrics.gain < 0 ? "−" : ""}${money(Math.abs(metrics.gain), false)}`}
              </strong>
              <small>
                {metrics.gainPercent === null
                  ? "Needs cost basis"
                  : `${metrics.gainPercent >= 0 ? "+" : ""}${metrics.gainPercent.toFixed(1)}% on known basis`}
              </small>
            </div>
          </div>
          <div className="portfolio-spark">
            {points.length > 1 ? (
              <NetWorthChart
                data={points}
                compact
                id="portfolio"
                color="#7b9890"
                valueLabel="Portfolio value"
              />
            ) : (
              <span className="portfolio-spark-empty" />
            )}
          </div>
          {allocation.length ? (
            <div className="portfolio-allocation">
              <div
                className="portfolio-allocation-bar"
                role="img"
                aria-label={`Holdings by type: ${allocation
                  .map((row) => `${row.name} ${Math.round(row.share * 100)}%`)
                  .join(", ")}`}
              >
                {allocation.map((row) => (
                  <span
                    key={row.name}
                    style={{ flex: row.share, background: row.color }}
                  />
                ))}
              </div>
              <div className="portfolio-allocation-legend">
                {allocation.map((row) => (
                  <div key={row.name}>
                    <i style={{ background: row.color }} />
                    <span>{row.name}</span>
                    <strong>{Math.round(row.share * 100)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="portfolio-note">
              Holdings appear here once your brokerage shares them.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

const GAUGE_RADIUS = 84;
const GAUGE_CENTER = { x: 100, y: 100 };
/** A point on the semicircle for a 0–1 fraction, sweeping left to right over the top. */
function gaugePoint(fraction: number) {
  const angle = Math.PI * (1 - fraction);
  return {
    x: GAUGE_CENTER.x + GAUGE_RADIUS * Math.cos(angle),
    y: GAUGE_CENTER.y - GAUGE_RADIUS * Math.sin(angle),
  };
}
const GAUGE_PATH = `M ${gaugePoint(0).x} ${gaugePoint(0).y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${gaugePoint(1).x} ${gaugePoint(1).y}`;

/** The most recently updated score history, with the others listed beneath. */
export function CreditScoreWidget() {
  useAmountsHidden();
  const navigate = useNavigate();
  const entries = useQuery(api.creditScores.list, {});
  const groups = useMemo(() => {
    const grouped = groupCreditHistory(entries ?? []);
    return [...grouped].sort(
      (a, b) =>
        b.history[0].date.localeCompare(a.history[0].date) ||
        a.key.localeCompare(b.key),
    );
  }, [entries]);
  const primary = groups[0];
  const latest = primary?.history[0];
  const previous = primary?.history[1];
  const change = latest && previous ? latest.score - previous.score : null;
  const fraction = latest ? creditScaleFraction(latest.score) : 0;
  const marker = gaugePoint(fraction);
  return (
    <Panel
      title="Credit score"
      className="dashboard-credit"
      action={
        <Link className="text-link subtle-link" to="/credit-scores">
          View scores <ArrowRight size={14} />
        </Link>
      }
    >
      {entries === undefined ? (
        <Loading text="Loading your scores…" />
      ) : !latest ? (
        <Empty
          icon={<Gauge size={24} strokeWidth={1.6} />}
          title="Track your credit score"
          description="Save a score from your bank or a credit report, then follow how it changes."
          action={
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                void navigate("/credit-scores?add=score");
              }}
            >
              Add a score
            </Button>
          }
        />
      ) : (
        <div className="credit-widget">
          <div className="credit-widget-gauge">
            <svg
              viewBox="0 0 200 112"
              role="img"
              aria-label={`${latest.score} of 850, ${creditBand(latest.score, latest.model)}`}
            >
              <path className="credit-gauge-track" d={GAUGE_PATH} />
              <path
                className="credit-gauge-fill"
                d={GAUGE_PATH}
                pathLength={100}
                strokeDasharray={`${fraction * 100} 100`}
              />
              <circle
                className="credit-gauge-marker"
                cx={marker.x}
                cy={marker.y}
                r={6}
              />
            </svg>
            <div className="credit-widget-reading">
              <strong>{latest.score}</strong>
              <span>{creditBand(latest.score, latest.model)}</span>
            </div>
            <div className="credit-widget-scale" aria-hidden="true">
              <span>300</span>
              <span>850</span>
            </div>
          </div>
          <div className="credit-widget-detail">
            <div className="credit-widget-model">
              <strong>{latest.bureau}</strong>
              <span>{latest.model}</span>
            </div>
            {change === null ? (
              <div className="change muted-change">
                <span>Add another score to see a change</span>
              </div>
            ) : (
              <div
                className={`change ${change < 0 ? "negative" : change > 0 ? "positive" : ""}`}
              >
                {change < 0 ? (
                  <ArrowDown size={14} />
                ) : change > 0 ? (
                  <ArrowUp size={14} />
                ) : null}
                <strong>
                  {change > 0 ? "+" : ""}
                  {change} {Math.abs(change) === 1 ? "point" : "points"}
                </strong>
                <span>
                  since{" "}
                  {dateLabel(previous.date, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
            <p className="credit-widget-date">
              As of {dateLabel(latest.date, { month: "short", day: "numeric" })}
              {latest.source ? ` · ${latest.source}` : ""}
            </p>
            {groups.length > 1 && (
              <div className="credit-widget-others">
                {groups.slice(1, 3).map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      void navigate("/credit-scores");
                    }}
                  >
                    <span>{group.key}</span>
                    <strong>{group.history[0].score}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
