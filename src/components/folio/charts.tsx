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
  XAxis,
  YAxis,
} from "recharts";
import { compactMoney, money } from "../../lib/format";
import { chartColors } from "../../lib/constants";
import { useReducedMotion } from "../../lib/useReducedMotion";
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
                tickFormatter={compactMoney}
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
  const reduced = useReducedMotion();
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
            tickFormatter={compactMoney}
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
}: {
  data: { name: string; value: number; color?: string }[];
  total: number;
  small?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={`donut ${small ? "small" : ""}`}>
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
            isAnimationActive={!reduced}
          >
            {data.map((d, i) => (
              <Cell
                key={d.name}
                fill={d.color ?? chartColors[i % chartColors.length]}
              />
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
      <div className="donut-center">
        <span>Total spending</span>
        <strong>{money(total, false)}</strong>
      </div>
    </div>
  );
}
