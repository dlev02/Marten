import { AmountInput } from "../../components/folio/AmountInput";
import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Info, PiggyBank, Plane, Plus, Trash2 } from "lucide-react";
import type { ForecastInputs, TravelPlan } from "../../../convex/lib/forecast";
import { Button, IconButton, InfoTip } from "../../components/folio/ui";
import { dateLabel } from "../../lib/format";
import { Select } from "../../components/folio/Select";

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
  useAmountsHidden();
  const id = useId();
  const displayValue = dollars ? value / 100 : value;
  const [draft, setDraft] = useState(String(displayValue));
  useEffect(() => setDraft(String(displayValue)), [displayValue]);
  return (
    <div className="plan-number">
      <label htmlFor={id}>{label}</label>
      <div className="plan-number-input">
        {dollars && <span aria-hidden="true">$</span>}
        <AmountInput
          sensitive={dollars}
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
  useAmountsHidden();
  // The thumb follows the pointer immediately; the projection recomputes on a
  // short trailing delay so a drag does not re-run the model every pixel.
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setDraft(null);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const shown = draft ?? value;
  const fill = Math.max(
    0,
    Math.min(100, ((shown - min) / Math.max(1, max - min)) * 100),
  );
  function drag(next: number) {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onChange(next);
    }, 90);
  }
  return (
    <div className="plan-slider">
      <PlanNumber
        label={label}
        value={shown}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
      />
      <input
        type="range"
        aria-label={`${label} slider`}
        aria-valuetext={`${shown}${suffix === "%" ? "%" : ` ${suffix}`}`}
        min={min}
        max={max}
        step={step}
        value={shown}
        style={{ "--range-fill": `${fill}%` } as CSSProperties}
        onChange={(event) => drag(Number(event.target.value))}
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
  onReview,
}: {
  inputs: ForecastInputs;
  onChange: (inputs: ForecastInputs) => void;
  onReview: () => void;
}) {
  useAmountsHidden();
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
      value={(inputs[key] as number | undefined) ?? 0}
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
  const newTrip = (): TravelPlan => ({
    id: crypto.randomUUID(),
    name: "Annual trips",
    tripsPerYear: 2,
    costPerTripCents: 400000,
    startAge: inputs.retirementAge,
    endAge: inputs.endAge,
    month: 7,
  });
  const unspent =
    inputs.monthlyIncomeCents -
    inputs.monthlySpendingCents +
    inputs.extraMonthlySavingsCents;
  const startingFunds =
    inputs.cashCents + inputs.investmentCents + inputs.retirementCents;
  return (
    <aside className="forecast-assumptions panel" aria-label="Plan details">
      <div className="forecast-section-heading">
        <h2>Plan details</h2>
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
      {inputs.schemaVersion === 2 && (
        <section className="plan-group" aria-labelledby="plan-investing-title">
          <div className="plan-section-title">
            <h3 id="plan-investing-title">
              <PiggyBank size={19} />
              Investing
              <InfoTip
                label="About investing amounts"
                text="Both amounts continue until retirement and grow with your plan’s rates. Monthly investing moves money you did not spend into investments, where it earns the annual return. Retirement contributions come out of your pay before it reaches the bank, so they add to what your income already shows."
              />
            </h3>
          </div>
          <div className="plan-fields">
            {number("monthlyContributionCents", "Invest each month", true)}
            {number(
              "retirementContributionCents",
              "Retirement contributions each month",
              true,
            )}
          </div>
          <p className="plan-note">
            {unspent > 0
              ? `Income leaves about ${money(unspent, false)} unspent each month to invest from.`
              : "Spending currently uses all of the income entered below."}
          </p>
        </section>
      )}
      <section className="plan-travel" aria-labelledby="plan-travel-title">
        <div className="plan-section-title">
          <h3 id="plan-travel-title">
            <Plane size={19} />
            Travel
            <InfoTip
              label="About travel plans"
              text="Trips are added on top of living spending, so remove any travel already included there. Each plan is charged in full in its budget month, for every year in its age range."
            />
          </h3>
          {!!inputs.travelPlans.length && (
            <IconButton
              label="Add travel plan"
              disabled={inputs.travelPlans.length >= 20}
              onClick={() =>
                set("travelPlans", [...inputs.travelPlans, newTrip()])
              }
            >
              <Plus size={17} />
            </IconButton>
          )}
        </div>
        {!inputs.travelPlans.length && (
          <div className="plan-travel-empty">
            <p>Plan for a few trips each year, or a special getaway.</p>
            <Button
              icon={<Plus size={15} />}
              onClick={() => set("travelPlans", [newTrip()])}
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
              <span id={`travel-month-${trip.id}`}>Budget month</span>
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
              {money(trip.tripsPerYear * trip.costPerTripCents, false)} a year
              in today’s dollars, until age {trip.endAge}.
            </p>
          </div>
        ))}
      </section>
      <details className="plan-disclosure">
        <summary>
          <span>Income & spending</span>
          <span className="plan-summary-value">
            {money(inputs.monthlyIncomeCents, false)} in ·{" "}
            {money(inputs.monthlySpendingCents, false)} out
          </span>
        </summary>
        <div className="plan-disclosure-body">
          <p className="plan-note plan-note-tip">
            <InfoTip
              label="About income and spending"
              text="Monthly amounts after tax, in today’s dollars, estimated from the last twelve months of activity. Include loan payments and costs your transactions may be missing. “Spend less” trims living spending before retirement; it does not add income."
            />
            Monthly amounts after tax.
          </p>
          <div className="plan-fields">
            {number("monthlyIncomeCents", "Income now", true)}
            {number("monthlySpendingCents", "Spending now", true)}
            {number(
              "retirementMonthlyIncomeCents",
              "Income in retirement",
              true,
            )}
            {number(
              "retirementMonthlySpendingCents",
              "Spending in retirement",
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
        </div>
      </details>
      <details className="plan-disclosure">
        <summary>
          <span>Starting funds & target</span>
          <span className="plan-summary-value">
            {money(startingFunds, false)}
          </span>
        </summary>
        <div className="plan-disclosure-body">
          <p className="plan-note plan-note-tip">
            <InfoTip
              label="About starting funds"
              text="Balances as of the plan’s start date. Cash earns no interest; investments and retirement funds grow at the annual return. Retirement funds open at the access age; withdrawal taxes and penalties are not modeled."
            />
            Balances from {dateLabel(inputs.asOfDate)}.
          </p>
          <div className="plan-fields">
            {number("cashCents", "Cash", true)}
            {number("investmentCents", "Investments", true)}
            {number("retirementCents", "Retirement funds", true)}
            {number("retirementAccessAge", "Retirement access age", false, {
              max: 120,
              step: 0.5,
            })}
            {number("legacyTargetCents", "Leave at plan’s end", true)}
          </div>
          <Button tone="quiet" icon={<Info size={15} />} onClick={onReview}>
            Review starting data
          </Button>
        </div>
      </details>
    </aside>
  );
}
