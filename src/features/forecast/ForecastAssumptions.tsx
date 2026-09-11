import { useEffect, useId, useState, type CSSProperties } from "react";
import { Plane, Plus, Trash2 } from "lucide-react";
import type { ForecastInputs, TravelPlan } from "../../../convex/lib/forecast";
import { Button, IconButton } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { money } from "../../lib/format";

/** Keep a blank/in-progress input local; commit only valid numeric values. */
export function PlanNumber({
  label,
  value,
  onChange,
  dollars = false,
  suffix,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  dollars?: boolean;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  const displayValue = dollars ? value / 100 : value;
  const [draft, setDraft] = useState(String(displayValue));
  useEffect(() => setDraft(String(displayValue)), [displayValue]);
  return (
    <div className="plan-number">
      <label htmlFor={id}>{label}</label>
      <div className="plan-number-input">
        {dollars && <span aria-hidden="true">$</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={dollars ? 0.01 : step}
          value={draft}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const number = Number(text);
            if (
              text !== "" &&
              Number.isFinite(number) &&
              number >= min &&
              (max === undefined || number <= max)
            )
              onChange(dollars ? Math.round(number * 100) : number);
          }}
          onBlur={() => setDraft(String(displayValue))}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
    </div>
  );
}

function PlanSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "years",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const fill = Math.max(
    0,
    Math.min(100, ((value - min) / Math.max(1, max - min)) * 100),
  );
  return (
    <div className="plan-slider">
      <PlanNumber
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
      />
      <input
        type="range"
        aria-label={`${label} slider`}
        aria-valuetext={`${value}${suffix === "%" ? "%" : ` ${suffix}`}`}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-fill": `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="plan-slider-bounds" aria-hidden="true">
        <span>
          {min}
          {suffix === "%" ? "%" : ""}
        </span>
        <span>
          {max}
          {suffix === "%" ? "%" : ""}
        </span>
      </div>
    </div>
  );
}

export function ForecastAssumptions({
  inputs,
  onChange,
}: {
  inputs: ForecastInputs;
  onChange: (inputs: ForecastInputs) => void;
}) {
  const set = <K extends keyof ForecastInputs>(
    key: K,
    value: ForecastInputs[K],
  ) => onChange({ ...inputs, [key]: value });
  const number = (
    key: keyof ForecastInputs,
    label: string,
    dollars = false,
    options: {
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
    } = {},
  ) => (
    <PlanNumber
      label={label}
      value={inputs[key] as number}
      onChange={(value) => set(key, value)}
      dollars={dollars}
      {...options}
    />
  );
  const updateTrip = (trip: TravelPlan) =>
    set(
      "travelPlans",
      inputs.travelPlans.map((item) => (item.id === trip.id ? trip : item)),
    );
  return (
    <aside className="forecast-assumptions panel" aria-label="Plan details">
      <div className="forecast-section-heading">
        <h2>Plan details</h2>
        <p>Adjust a value to see how your plan changes.</p>
      </div>
      <div className="plan-fields">
        {number("currentAge", "Current age", false, { min: 18, max: 119 })}
        <PlanSlider
          label="Retirement age"
          value={inputs.retirementAge}
          onChange={(value) => set("retirementAge", value)}
          min={inputs.currentAge}
          max={Math.max(inputs.currentAge, inputs.endAge)}
        />
        {number("endAge", "Plan through age", false, { min: 19, max: 120 })}
        <PlanSlider
          label="Annual investment return"
          value={inputs.annualReturnPct}
          onChange={(value) => set("annualReturnPct", value)}
          min={-50}
          max={30}
          step={0.25}
          suffix="%"
        />
        <PlanSlider
          label="Annual inflation"
          value={inputs.inflationPct}
          onChange={(value) => set("inflationPct", value)}
          min={0}
          max={30}
          step={0.25}
          suffix="%"
        />
      </div>
      <section className="plan-travel" aria-labelledby="plan-travel-title">
        <div className="plan-section-title">
          <h3 id="plan-travel-title">
            <Plane size={19} />
            Travel
          </h3>
          <IconButton
            label="Add travel plan"
            disabled={inputs.travelPlans.length >= 20}
            onClick={() =>
              set("travelPlans", [
                ...inputs.travelPlans,
                {
                  id: crypto.randomUUID(),
                  name: "Annual trips",
                  tripsPerYear: 2,
                  costPerTripCents: 400000,
                  startAge: inputs.retirementAge,
                  endAge: inputs.endAge,
                  month: 7,
                },
              ])
            }
          >
            <Plus size={17} />
          </IconButton>
        </div>
        {!inputs.travelPlans.length && (
          <div className="plan-travel-empty">
            <p>Plan for a few trips each year, or a special getaway.</p>
            <Button
              icon={<Plus size={15} />}
              onClick={() =>
                set("travelPlans", [
                  {
                    id: crypto.randomUUID(),
                    name: "Annual trips",
                    tripsPerYear: 2,
                    costPerTripCents: 400000,
                    startAge: inputs.retirementAge,
                    endAge: inputs.endAge,
                    month: 7,
                  },
                ])
              }
            >
              Add travel
            </Button>
          </div>
        )}
        {inputs.travelPlans.map((trip) => (
          <div className="travel-plan" key={trip.id}>
            <div className="travel-plan-heading">
              <input
                aria-label="Travel plan name"
                maxLength={120}
                value={trip.name}
                onChange={(event) =>
                  updateTrip({ ...trip, name: event.target.value })
                }
              />
              <IconButton
                label={`Remove ${trip.name || "travel plan"}`}
                onClick={() =>
                  set(
                    "travelPlans",
                    inputs.travelPlans.filter((item) => item.id !== trip.id),
                  )
                }
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
            <PlanNumber
              label="Trips per year"
              value={trip.tripsPerYear}
              max={100}
              onChange={(value) => updateTrip({ ...trip, tripsPerYear: value })}
            />
            <PlanNumber
              label="Cost per trip"
              value={trip.costPerTripCents}
              dollars
              onChange={(value) =>
                updateTrip({ ...trip, costPerTripCents: value })
              }
            />
            <div className="travel-age-fields">
              <PlanNumber
                label="From age"
                value={trip.startAge}
                max={120}
                onChange={(value) => updateTrip({ ...trip, startAge: value })}
              />
              <PlanNumber
                label="Until age"
                value={trip.endAge}
                max={120}
                onChange={(value) => updateTrip({ ...trip, endAge: value })}
              />
            </div>
            <div className="plan-choice">
              <span id={`travel-month-${trip.id}`}>Annual budget month</span>
              <Select
                aria-labelledby={`travel-month-${trip.id}`}
                value={String(trip.month)}
                onValueChange={(value) =>
                  updateTrip({ ...trip, month: Number(value) })
                }
                options={Array.from({ length: 12 }, (_, index) => ({
                  value: String(index + 1),
                  label: new Date(2026, index, 1).toLocaleDateString("en-US", {
                    month: "long",
                  }),
                }))}
              />
            </div>
            <p className="plan-note">
              {money(trip.tripsPerYear * trip.costPerTripCents, false)} per
              year, before inflation. Charged together in the selected month,
              until age {trip.endAge}.
            </p>
          </div>
        ))}
        {!!inputs.travelPlans.length && (
          <p className="plan-note">
            These trips are added to living spending. Remove any travel already
            included there.
          </p>
        )}
      </section>
      <details className="plan-disclosure">
        <summary>Income & spending</summary>
        <p className="plan-note">
          Monthly amounts after tax, in today’s dollars. Include loan payments
          and costs your transactions may be missing.
        </p>
        <div className="plan-fields">
          {number("monthlyIncomeCents", "Income before retirement", true)}
          {number("monthlySpendingCents", "Living spending now", true)}
          {number("retirementMonthlyIncomeCents", "Retirement income", true)}
          {number(
            "retirementMonthlySpendingCents",
            "Retirement spending",
            true,
          )}
          {number("extraMonthlySavingsCents", "Spend less each month", true)}
          {number("incomeGrowthPct", "Annual income growth", false, {
            min: -50,
            max: 30,
            step: 0.5,
            suffix: "%",
          })}
        </div>
        <p className="plan-note">
          Unspent income is invested automatically. “Spend less” reduces living
          spending before retirement; it does not add income.
        </p>
      </details>
      <details className="plan-disclosure">
        <summary>Starting funds & target</summary>
        <div className="plan-fields">
          {number("cashCents", "Cash", true)}
          {number("investmentCents", "Accessible investments", true)}
          {number("retirementCents", "Retirement investments", true)}
          {number("retirementAccessAge", "Retirement access age", false, {
            max: 120,
            step: 0.5,
          })}
          {number("legacyTargetCents", "Leave at plan’s end", true)}
        </div>
        <p className="plan-note">
          Cash earns no interest. Investment growth is a nominal annual
          assumption. Retirement funds are available from the access age;
          withdrawal taxes and penalties are not modeled.
        </p>
      </details>
    </aside>
  );
}
