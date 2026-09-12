import {
  useAmountsHidden,
  displayCompactMoney as compactMoney,
  displayMoney as money,
} from "../../lib/amountVisibility";
import {
  Bar,
  Cell,
  ComposedChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useReducedMotion } from "../../lib/useReducedMotion";

type Period = {
  label: string;
  income: number;
  expense: number;
  savings: number;
};
export function CashFlowTimeline({
  data,
  selectedIndex,
  onSelect,
}: {
  data: Period[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  useAmountsHidden();
  const reduced = useReducedMotion();
  const chart = data.map((period) => ({ ...period, outflow: -period.expense }));
  return (
    <>
      <div className="cashflow-timeline" aria-label="Cash flow history">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chart}
            margin={{ top: 16, right: 22, bottom: 18, left: 4 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 4"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              height={35}
              tick={({ x, y, payload }) => {
                const index = data.findIndex(
                  (item) => item.label === payload.value,
                );
                const selected = index === selectedIndex;
                return (
                  <g
                    transform={`translate(${x},${y})`}
                    role="button"
                    aria-label={`Show ${payload.value}`}
                    aria-pressed={selected}
                    tabIndex={0}
                    onClick={() => onSelect(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(index);
                      }
                    }}
                    className="cashflow-period-tick"
                  >
                    <rect
                      x={-27}
                      y={6}
                      width={54}
                      height={25}
                      rx={6}
                      fill={selected ? "var(--selected)" : "transparent"}
                    />
                    <text
                      y={23}
                      textAnchor="middle"
                      fill={selected ? "var(--text)" : "var(--muted)"}
                      fontSize={11}
                      fontWeight={selected ? 600 : 400}
                    >
                      {payload.value}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis
              tickFormatter={(value: number) => compactMoney(value)}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              width={58}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke="var(--strong-border)" />
            <Tooltip
              cursor={{ fill: "var(--hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tooltip">
                    <strong>{label}</strong>
                    {payload.map((item) => (
                      <div key={String(item.dataKey)}>
                        <span>{item.name}</span>
                        <b>
                          {money(
                            item.dataKey === "outflow"
                              ? -Number(item.value)
                              : Number(item.value),
                          )}
                        </b>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="income"
              name="Income"
              fill="#87bba7"
              maxBarSize={40}
              radius={[3, 3, 0, 0]}
              animationDuration={550}
              isAnimationActive={!reduced}
              onClick={(_, index) => onSelect(index)}
              cursor="pointer"
            >
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fillOpacity={index === selectedIndex ? 1 : 0.55}
                />
              ))}
            </Bar>
            <Bar
              dataKey="outflow"
              name="Expenses"
              fill="#e7a49a"
              maxBarSize={40}
              radius={[0, 0, 3, 3]}
              animationDuration={550}
              isAnimationActive={!reduced}
              onClick={(_, index) => onSelect(index)}
              cursor="pointer"
            >
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fillOpacity={index === selectedIndex ? 1 : 0.55}
                />
              ))}
            </Bar>
            <Line
              dataKey="savings"
              name="Net cash flow"
              stroke="var(--text)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              animationDuration={650}
              isAnimationActive={!reduced}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="cashflow-legend">
        <span>
          <i style={{ background: "#87bba7" }} />
          Income
        </span>
        <span>
          <i style={{ background: "#e7a49a" }} />
          Expenses
        </span>
        <span>
          <i className="line" />
          Net cash flow
        </span>
      </div>
    </>
  );
}
