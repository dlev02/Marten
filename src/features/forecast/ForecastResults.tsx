import {
  useAmountsHidden,
  displayCompactMoney as compactMoney,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Lightbulb } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ForecastInputs,
  ForecastResult,
  SavingsSolution,
} from "../../../convex/lib/forecast";
import { Button } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { csv, dateLabel, download } from "../../lib/format";

const ageLabel = (age: number) =>
  Number.isInteger(age) ? String(age) : age.toFixed(1);
const tick = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-app)",
};

export function ForecastResults({
  inputs,
  result,
  solution,
  comparison,
  name,
  real,
  onApplySavings,
}: {
  inputs: ForecastInputs;
  result: ForecastResult;
  solution: SavingsSolution;
  comparison?: { name: string; result: ForecastResult };
  name: string;
  real: boolean;
  onApplySavings: (amount: number) => void;
}) {
  useAmountsHidden();
  const gradient = `forecast-${useId().replace(/:/g, "")}`;
  const [selectedYear, setSelectedYear] = useState("");
  const chartData = useMemo(() => {
    const other = new Map(
      comparison?.result.months.map((row) => [row.date, row]),
    );
    return result.months.map((row) => ({
      ...row,
      value: real ? row.realAssetsCents : row.assetsCents,
      comparison: other.has(row.date)
        ? real
          ? other.get(row.date)!.realAssetsCents
          : other.get(row.date)!.assetsCents
        : undefined,
    }));
  }, [result, comparison, real]);
  const row =
    result.years.find((year) => year.date === selectedYear) ??
    result.years[Math.min(1, result.years.length - 1)];
  const ending = real ? result.endRealAssetsCents : result.endAssetsCents;
  const retirement = real
    ? result.retirementRealAssetsCents
    : result.retirementAssetsCents;
  const additionalSavings = Math.max(
    0,
    (solution.requiredMonthlySavingsCents ?? 0) -
      inputs.extraMonthlySavingsCents,
  );
  const funded = result.depletionAge === null;
  const unit = real ? "today’s dollars" : "future dollars";
  const exportYears = () =>
    download(
      "marten-forecast.csv",
      csv([
        [
          "Scenario",
          name,
          "Dollar basis",
          unit,
          "Starting date",
          inputs.asOfDate,
        ],
        [
          "Age",
          "Period ending",
          "Income",
          "Living spending",
          "Travel",
          "Investment growth",
          "Unfunded spending",
          "Ending funds",
        ],
        ...result.years.map((year) => [
          ageLabel(year.age),
          year.date,
          ((real ? year.realIncomeCents : year.incomeCents) / 100).toFixed(2),
          ((real ? year.realSpendingCents : year.spendingCents) / 100).toFixed(
            2,
          ),
          ((real ? year.realTravelCents : year.travelCents) / 100).toFixed(2),
          ((real ? year.realGrowthCents : year.growthCents) / 100).toFixed(2),
          (
            (real ? year.realShortfallCents : year.shortfallCents) / 100
          ).toFixed(2),
          ((real ? year.realAssetsCents : year.assetsCents) / 100).toFixed(2),
        ]),
      ]),
    );
  return (
    <>
      <section
        className="forecast-projection panel"
        aria-label="Forecast results"
      >
        <div
          className={`forecast-status ${funded ? "funded" : "shortfall"}`}
          role="status"
        >
          {funded ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <div>
            <strong>
              {funded
                ? `The plan stays funded through age ${inputs.endAge}.`
                : `Spending first exceeds available funds at age ${ageLabel(result.depletionAge!)}.`}
            </strong>
            <p>
              {funded
                ? "Under the assumptions in this scenario."
                : `From ${dateLabel(result.depletionDate!)}. Restricted retirement money may still remain.`}
            </p>
          </div>
        </div>
        <div className="forecast-section-heading">
          <h2>Funds over time</h2>
          <p>Cash and investments, including retirement funds.</p>
        </div>
        <div className="forecast-legend">
          <span>
            <i />
            {name}
          </span>
          {comparison && (
            <span>
              <i className="comparison" />
              {comparison.name}
            </span>
          )}
        </div>
        <div
          className="forecast-chart"
          role="img"
          aria-label={`Projected funds from ${money(inputs.cashCents + inputs.investmentCents + inputs.retirementCents)} to ${money(ending)} in ${unit}. ${funded ? "No unfunded periods." : "Unfunded spending begins at age " + ageLabel(result.depletionAge!) + "."}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 26, right: 0, bottom: 8, left: 8 }}
            >
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--blue)"
                    stopOpacity={0.13}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--blue)"
                    stopOpacity={0.015}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="age"
                type="number"
                domain={[inputs.currentAge, inputs.endAge]}
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(age: number) => `${Math.round(age)}`}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(value: number) => compactMoney(value)}
                orientation="right"
                width={60}
                tick={tick}
                axisLine={false}
                tickLine={false}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]
                    .payload as (typeof chartData)[number];
                  return (
                    <div className="chart-tooltip">
                      <strong>
                        Age {ageLabel(point.age)} · {dateLabel(point.date)}
                      </strong>
                      <div>
                        <span>{name}</span>
                        <b>{money(point.value, false)}</b>
                      </div>
                      {point.comparison !== undefined && (
                        <div>
                          <span>{comparison?.name}</span>
                          <b>{money(point.comparison, false)}</b>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                x={inputs.retirementAge}
                stroke="var(--muted)"
                strokeDasharray="3 4"
                label={{
                  value: `Retire at ${inputs.retirementAge}`,
                  fill: "var(--muted)",
                  fontSize: 11,
                  position: "insideTopLeft",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--blue)"
                strokeWidth={2.5}
                fill={`url(#${gradient})`}
                dot={false}
                isAnimationActive={false}
              />
              {comparison && (
                <Line
                  type="monotone"
                  dataKey="comparison"
                  stroke="var(--muted)"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="forecast-results-summary">
          <div>
            <span>At retirement · age {inputs.retirementAge}</span>
            <strong>{money(retirement, false)}</strong>
          </div>
          <div>
            <span>At plan’s end · age {inputs.endAge}</span>
            <strong>{money(ending, false)}</strong>
          </div>
        </div>
        <div className="forecast-savings">
          <Lightbulb size={22} />
          <div>
            <h3>
              {result.meetsTarget
                ? "Your savings cover this plan."
                : solution.status === "solved" && additionalSavings > 0
                  ? `Save ${money(additionalSavings, false)} more each month.`
                  : "Try a different retirement age or spending plan."}
            </h3>
            <p>
              {result.meetsTarget
                ? `Projected funds meet your ${money(inputs.legacyTargetCents, false)} ending target in today’s dollars.`
                : solution.status === "solved"
                  ? `Reduce living spending by ${money(solution.requiredMonthlySavingsCents, false)} per month in total before retirement to cover every period and your ending target.`
                  : "Spending reductions before retirement alone cannot fund every period and the ending target under these assumptions."}
            </p>
          </div>
          {solution.status === "solved" && additionalSavings > 0 && (
            <Button
              onClick={() =>
                onApplySavings(solution.requiredMonthlySavingsCents)
              }
            >
              Apply savings
            </Button>
          )}
        </div>
        <p className="plan-note forecast-model-note">
          One modeled path in {unit}. Taxes and market volatility are not
          simulated. The annual ledger shows any unmet spending separately.
        </p>
      </section>
      <section
        className="forecast-ledger panel"
        aria-labelledby="forecast-ledger-title"
      >
        <div className="forecast-ledger-heading">
          <div>
            <h2 id="forecast-ledger-title">Year by year</h2>
            <p>
              Each row covers a planning year from{" "}
              {dateLabel(inputs.asOfDate, { month: "short", day: "numeric" })}.
            </p>
          </div>
          <Button icon={<Download size={15} />} onClick={exportYears}>
            Export
          </Button>
        </div>
        <div className="forecast-year-inspector">
          <Select
            aria-label="Inspect forecast year"
            value={row.date}
            onValueChange={setSelectedYear}
            options={result.years.map((year) => ({
              value: year.date,
              label:
                year.month === 0
                  ? `Starting funds · age ${ageLabel(year.age)}`
                  : `Year ending ${dateLabel(year.date)} · age ${ageLabel(year.age)}`,
            }))}
          />
          <dl>
            <div>
              <dt>Cash</dt>
              <dd>
                {money(
                  real
                    ? Math.round(
                        row.cashCents /
                          Math.pow(
                            1 + inputs.inflationPct / 100,
                            row.month / 12,
                          ),
                      )
                    : row.cashCents,
                  false,
                )}
              </dd>
            </div>
            <div>
              <dt>Investments</dt>
              <dd>
                {money(
                  real
                    ? Math.round(
                        row.investmentCents /
                          Math.pow(
                            1 + inputs.inflationPct / 100,
                            row.month / 12,
                          ),
                      )
                    : row.investmentCents,
                  false,
                )}
              </dd>
            </div>
            <div>
              <dt>Retirement funds</dt>
              <dd>
                {money(
                  real
                    ? Math.round(
                        row.retirementCents /
                          Math.pow(
                            1 + inputs.inflationPct / 100,
                            row.month / 12,
                          ),
                      )
                    : row.retirementCents,
                  false,
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="forecast-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Age</th>
                <th scope="col">Income</th>
                <th scope="col">Living spending</th>
                <th scope="col">Travel</th>
                <th scope="col">Growth</th>
                <th scope="col">Unfunded</th>
                <th scope="col">Ending funds</th>
              </tr>
            </thead>
            <tbody>
              {result.years.map((year) => (
                <tr
                  key={year.month}
                  className={year.date === row.date ? "selected" : ""}
                >
                  <th scope="row">
                    <button
                      onClick={() => setSelectedYear(year.date)}
                      aria-label={`Inspect age ${ageLabel(year.age)}, ${dateLabel(year.date)}`}
                    >
                      {ageLabel(year.age)}
                      <small>
                        {year.month === 0
                          ? "Starting funds"
                          : dateLabel(year.date, {
                              year: "numeric",
                              month: "short",
                            })}
                      </small>
                    </button>
                  </th>
                  <td>
                    {money(
                      real ? year.realIncomeCents : year.incomeCents,
                      false,
                    )}
                  </td>
                  <td>
                    {money(
                      real ? year.realSpendingCents : year.spendingCents,
                      false,
                    )}
                  </td>
                  <td>
                    {money(
                      real ? year.realTravelCents : year.travelCents,
                      false,
                    )}
                  </td>
                  <td>
                    {money(
                      real ? year.realGrowthCents : year.growthCents,
                      false,
                    )}
                  </td>
                  <td className={year.shortfallCents ? "negative" : "muted"}>
                    {year.shortfallCents
                      ? money(
                          real ? year.realShortfallCents : year.shortfallCents,
                          false,
                        )
                      : "—"}
                  </td>
                  <td>
                    <strong>
                      {money(
                        real ? year.realAssetsCents : year.assetsCents,
                        false,
                      )}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="plan-note forecast-ledger-note">
          Income less living spending and travel is invested or withdrawn. Cash
          is used first, then accessible investments, then retirement funds
          after the access age. Unfunded spending is not covered by an assumed
          loan. Real-dollar flows are adjusted for inflation when they occur;
          real balances are adjusted at each year’s end.
        </p>
      </section>
    </>
  );
}
