import {
  useAmountsHidden,
  displayCompactMoney as compactMoney,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  type TreemapNode,
  XAxis,
  YAxis,
} from "recharts";

import { chartColors } from "../../lib/constants";
import { useReducedMotion } from "../../lib/useReducedMotion";
import "./charts.css";
const tick = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-app)",
};
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly {
    value?: number | string;
    name?: string;
    color?: string;
    payload?: { label?: string };
  }[];
  label?: string | number;
}) {
  useAmountsHidden();
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{payload[0]?.payload?.label ?? label}</strong>
      {payload.map((p, i) => (
        <div key={i}>
          <span style={{ color: p.color }}>{p.name}</span>
          <b>{money(Number(p.value ?? 0))}</b>
        </div>
      ))}
    </div>
  );
}
/**
 * The path sweeps in from the left once on mount and again when the caller
 * changes `revealKey` (a range choice). A clip rectangle grows over the plot,
 * so axes stay put and live data updates or resizes never replay it. Reduced
 * motion and compact sparklines render the full path immediately.
 */
function useReveal(revealKey: string | undefined, enabled: boolean) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"start" | "done">("start");
  // Runs on mount and on an explicit key change only; data is not a dependency.
  useEffect(() => {
    if (!enabled || reduced) return;
    setPhase("start");
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase("done"));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [revealKey, enabled, reduced]);
  return enabled && !reduced ? phase : "done";
}
export function NetWorthChart({
  data,
  compact = false,
  id = "networth",
  color = "#00a3bd",
  valueLabel = "Net worth",
  revealKey,
}: {
  data: { label: string; value: number }[];
  compact?: boolean;
  id?: string;
  color?: string;
  valueLabel?: string;
  /** Change this (for example to the selected range) to replay the reveal. */
  revealKey?: string;
}) {
  useAmountsHidden();
  const safeId = id.replace(/[^a-zA-Z0-9]/g, "");
  const gradient = `gradient-${safeId}`;
  const clip = `reveal-${safeId}`;
  const reveal = useReveal(revealKey, !compact);
  return (
    <div
      className={`${compact ? "sparkline" : "networth-chart"} ${reveal === "start" ? "chart-reveal-start" : "chart-reveal-done"}`}
      style={{ "--chart-clip": `url(#${clip})` } as React.CSSProperties}
      role="img"
      aria-label={`Balance history: ${data.length ? money(data[0].value) + " to " + money(data[data.length - 1].value) : "no history"}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={
            compact
              ? { top: 4, right: 0, bottom: 4, left: 0 }
              : { top: 15, right: 8, bottom: 0, left: 0 }
          }
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.17} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
            {!compact && (
              <clipPath id={clip}>
                <rect
                  className="chart-reveal-rect"
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                />
              </clipPath>
            )}
          </defs>
          {!compact && (
            <>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={tick}
                minTickGap={36}
                dy={7}
              />
              <YAxis
                orientation="right"
                tickFormatter={(value: number) => compactMoney(value)}
                axisLine={false}
                tickLine={false}
                tick={tick}
                width={58}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltip />} />
            </>
          )}
          {/* Keep the path and axes in the same resize frame. */}
          <Area
            name={valueLabel}
            className="chart-revealed"
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={compact ? 1.6 : 2.5}
            fill={`url(#${gradient})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function FlowChart({
  data,
  stacked = false,
  report = "cashflow",
  selectedIndex,
  onSelect,
}: {
  data: { label: string; income: number; expense: number; savings: number }[];
  stacked?: boolean;
  report?: string;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}) {
  useAmountsHidden();
  return (
    <div
      className="flow-chart"
      role="img"
      aria-label="Income and spending over time"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          barGap={3}
          margin={{ top: 10, right: 5, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="label"
            tick={tick}
            axisLine={false}
            tickLine={false}
            dy={5}
          />
          <YAxis
            tickFormatter={(value: number) => compactMoney(value)}
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--hover)" }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          />
          {report !== "spending" && (
            <Bar
              name="Income"
              dataKey="income"
              fill="#71b9a0"
              radius={[4, 4, 0, 0]}
              stackId={stacked ? "all" : undefined}
              maxBarSize={40}
              animationDuration={500}
              isAnimationActive={false}
              onClick={onSelect ? (_, index) => onSelect(index) : undefined}
              cursor={onSelect ? "pointer" : undefined}
            >
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fillOpacity={
                    selectedIndex === undefined || selectedIndex === index
                      ? 1
                      : 0.55
                  }
                />
              ))}
            </Bar>
          )}{" "}
          {report !== "income" && (
            <Bar
              name="Expenses"
              dataKey="expense"
              fill="#f39a77"
              radius={[4, 4, 0, 0]}
              stackId={stacked ? "all" : undefined}
              maxBarSize={40}
              animationDuration={500}
              isAnimationActive={false}
              onClick={onSelect ? (_, index) => onSelect(index) : undefined}
              cursor={onSelect ? "pointer" : undefined}
            >
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fillOpacity={
                    selectedIndex === undefined || selectedIndex === index
                      ? 1
                      : 0.55
                  }
                />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function SpendingDonut({
  data,
  total,
  small = false,
  active = null,
  onHover,
}: {
  data: { name: string; value: number; color?: string }[];
  total: number;
  small?: boolean;
  active?: string | null;
  onHover?: (name: string | null) => void;
}) {
  useAmountsHidden();
  return (
    <div
      className={`donut ${small ? "small" : ""}`}
      onMouseLeave={() => onHover?.(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={small ? 56 : 83}
            outerRadius={small ? 76 : 108}
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
            animationDuration={500}
            isAnimationActive={false}
            onMouseEnter={(_, index) => onHover?.(data[index]?.name ?? null)}
          >
            {data.map((d, i) => (
              <Cell
                key={d.name}
                fill={d.color ?? chartColors[i % chartColors.length]}
                className={`dashboard-donut-slice ${active && active !== d.name ? "dimmed" : ""}`}
                tabIndex={0}
                role="img"
                aria-label={`${d.name}: ${money(d.value)}`}
                onFocus={() => onHover?.(d.name)}
                onBlur={() => onHover?.(null)}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <span>
          {data.some((row) => row.name === active) ? active : "Total spending"}
        </span>
        <strong>
          {money(
            data.find((row) => row.name === active)?.value ?? total,
            false,
          )}
        </strong>
      </div>
    </div>
  );
}

type BreakdownDatum = { name: string; value: number; color?: string };
/**
 * Hover highlights a shape and its legend row; an optional click selects one
 * shape (by name) so the page can drill into it. Both stay name-keyed because a
 * chart shows one report kind at a time.
 */
type CellHover = {
  active: string | null;
  onHover: (name: string | null) => void;
  selected?: string | null;
  onSelect?: (name: string) => void;
};
function pressKey(event: { key: string; preventDefault: () => void }) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    return true;
  }
  return false;
}
function TreemapCell({
  depth,
  x,
  y,
  width,
  height,
  name,
  value,
  color,
  index,
  hover,
}: TreemapNode & { hover: CellHover }) {
  useAmountsHidden();
  if (depth !== 1) return <g />;
  const labelFits = width >= 90 && height >= 54;
  const maxCharacters = Math.max(1, Math.floor((width - 20) / 7));
  const label =
    name.length > maxCharacters ? `${name.slice(0, maxCharacters - 1)}…` : name;
  const state =
    hover.active === null ? "" : hover.active === name ? "active" : "dimmed";
  const selectable = !!hover.onSelect;
  const selected = hover.selected === name;
  return (
    <g
      className={`report-treemap-cell ${state} ${selected ? "selected" : ""}`}
      tabIndex={0}
      role={selectable ? "button" : "img"}
      aria-pressed={selectable ? selected : undefined}
      aria-label={`${name}: ${money(value)}`}
      onMouseEnter={() => hover.onHover(name)}
      onFocus={() => hover.onHover(name)}
      onBlur={() => hover.onHover(null)}
      onClick={() => hover.onSelect?.(name)}
      onKeyDown={(event) => {
        if (selectable && pressKey(event)) hover.onSelect?.(name);
      }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={
          typeof color === "string"
            ? color
            : chartColors[index % chartColors.length]
        }
      />
      {labelFits && (
        <text x={x + 10} y={y + 23} fill="var(--report-chart-ink)">
          <tspan fontSize={12} fontWeight={500}>
            {label}
          </tspan>
          <tspan x={x + 10} dy={18} fontSize={11}>
            {money(value)}
          </tspan>
        </text>
      )}
    </g>
  );
}
/** Legend rows and chart shapes highlight each other, so a hover on either side reads clearly. */
export function BreakdownLegend({
  rows,
  active,
  onHover,
  selected = null,
  onSelect,
  note,
  children,
}: {
  rows: { name: string; value: number; color: string }[];
  active: string | null;
  onHover: (name: string | null) => void;
  /** Name of the selected row; clicking a row toggles it when `onSelect` is given. */
  selected?: string | null;
  onSelect?: (name: string) => void;
  note?: string;
  children?: ReactNode;
}) {
  useAmountsHidden();
  return (
    <div
      className={`report-legend ${active ? "has-active" : ""} ${selected ? "has-selected" : ""}`}
      onMouseLeave={() => onHover(null)}
    >
      {rows.map((row) =>
        onSelect ? (
          <button
            key={row.name}
            type="button"
            className={`interactive ${active === row.name ? "active" : ""} ${selected === row.name ? "selected" : ""}`}
            aria-pressed={selected === row.name}
            onMouseEnter={() => onHover(row.name)}
            onFocus={() => onHover(row.name)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(row.name)}
          >
            <span className="report-dot" style={{ background: row.color }} />
            <span>{row.name}</span>
            <strong>{money(row.value)}</strong>
          </button>
        ) : (
          <div
            key={row.name}
            className={`interactive ${active === row.name ? "active" : ""}`}
            tabIndex={0}
            onMouseEnter={() => onHover(row.name)}
            onFocus={() => onHover(row.name)}
            onBlur={() => onHover(null)}
          >
            <span className="report-dot" style={{ background: row.color }} />
            <span>{row.name}</span>
            <strong>{money(row.value)}</strong>
          </div>
        ),
      )}
      {children}
      {note && <p className="muted">{note}</p>}
    </div>
  );
}
export function BreakdownTreemap({
  data,
  label,
  selected = null,
  onSelect,
}: {
  data: BreakdownDatum[];
  label: string;
  selected?: string | null;
  onSelect?: (name: string) => void;
}) {
  useAmountsHidden();
  const [active, setActive] = useState<string | null>(null);
  const positive = data
    .filter((row) => row.value > 0)
    .map((row, index) => ({
      ...row,
      color: row.color ?? chartColors[index % chartColors.length],
    }));
  if (!positive.length)
    return (
      <div className="money-flow-empty">
        <strong>No positive {label.toLowerCase()} to chart</strong>
        <p>Refunds and reversals remain in the breakdown below.</p>
      </div>
    );
  const hover: CellHover = { active, onHover: setActive, selected, onSelect };
  return (
    <div className="report-treemap-layout">
      <div
        onMouseLeave={() => setActive(null)}
        className="report-treemap"
        role="group"
        aria-label={`${label} treemap by selected grouping`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={positive}
            dataKey="value"
            nameKey="name"
            nodeGap={3}
            content={(props: TreemapNode) => (
              <TreemapCell {...props} hover={hover} />
            )}
            isAnimationActive={false}
            isUpdateAnimationActive={false}
          >
            <Tooltip
              content={({ active: shown, payload }) =>
                shown && payload?.length ? (
                  <div className="chart-tooltip">
                    <strong>{payload[0].payload.name}</strong>
                    <div>
                      <b>{money(Number(payload[0].value))}</b>
                    </div>
                  </div>
                ) : null
              }
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <BreakdownLegend
        rows={positive}
        active={active}
        onHover={setActive}
        selected={selected}
        onSelect={onSelect}
        note={
          data.some((row) => row.value < 0)
            ? "Areas show positive amounts. Refunds and reversals reduce the total in the breakdown below."
            : undefined
        }
      />
    </div>
  );
}
