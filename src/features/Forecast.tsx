import {
  useAmountsHidden,
  displayMoney as money,
} from "../lib/amountVisibility";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { Copy, Info, RefreshCw, Save, Trash2 } from "lucide-react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import {
  runForecast,
  solveRequiredSavings,
  type ForecastInputs,
} from "../../convex/lib/forecast";
import { PageHeader } from "../components/folio/PageHeader";
import { Button, Loading, Modal, Tabs, useTask } from "../components/folio/ui";
import { Select } from "../components/folio/Select";
import { dateLabel, localDate, message } from "../lib/format";
import { ForecastAssumptions } from "./forecast/ForecastAssumptions";
import { ForecastResults } from "./forecast/ForecastResults";
import { NearTermForecast } from "./forecast/NearTermForecast";
import { ForecastPreview } from "./forecast/ForecastPreview";
import "./forecast/forecast.css";

type SavedScenario = Doc<"forecastScenarios">;
type PendingChange = { type: "load"; id: string } | { type: "fresh" };

export function Forecast({ onAddAccount }: { onAddAccount: () => void }) {
  useAmountsHidden();
  const [params, setParams] = useSearchParams();
  const mode = params.get("view") === "near-term" ? "near-term" : "long-term";
  return (
    <div className="forecast-page">
      <PageHeader title="Forecast" />
      <Tabs
        value={mode}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("view", value);
          setParams(next, { replace: true });
        }}
        items={[
          { value: "long-term", label: "Long term" },
          { value: "near-term", label: "Near term" },
        ]}
      />
      {mode === "near-term" ? (
        <NearTermForecast onAddAccount={onAddAccount} />
      ) : (
        <LongTermForecast onAddAccount={onAddAccount} />
      )}
    </div>
  );
}

function LongTermForecast({ onAddAccount }: { onAddAccount: () => void }) {
  useAmountsHidden();
  const [today] = useState(localDate);
  const baseline = useQuery(api.forecasting.baseline, { asOfDate: today });
  const scenarios = useQuery(api.forecasting.list, {});
  const save = useMutation(api.forecasting.save);
  const remove = useMutation(api.forecasting.remove);
  const { busy, run } = useTask();
  const [inputs, setInputs] = useState<ForecastInputs | null>(null);
  const [loaded, setLoaded] = useState<Pick<
    SavedScenario,
    "_id" | "revision" | "name" | "inputs"
  > | null>(null);
  const [name, setName] = useState("My retirement plan");
  const [compareId, setCompareId] = useState("");
  const [real, setReal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [review, setReview] = useState(false);
  useEffect(() => {
    if (!baseline || !scenarios || inputs) return;
    const recent = scenarios[0];
    if (recent) {
      setInputs(recent.inputs);
      setLoaded(recent);
      setName(recent.name);
    } else setInputs(baseline.inputs);
  }, [baseline, scenarios, inputs]);
  const deferredInputs = useDeferredValue(inputs);
  const projection = useMemo(() => {
    if (!deferredInputs) return null;
    try {
      return {
        result: runForecast(deferredInputs),
        solution: solveRequiredSavings(deferredInputs),
        error: null,
      };
    } catch (error) {
      return { result: null, solution: null, error: message(error) };
    }
  }, [deferredInputs]);
  const comparison = useMemo(() => {
    const other = scenarios?.find((scenario) => scenario._id === compareId);
    if (
      !other ||
      !inputs ||
      other.inputs.asOfDate !== inputs.asOfDate ||
      other.inputs.currentAge !== inputs.currentAge
    )
      return undefined;
    try {
      return { name: other.name, result: runForecast(other.inputs) };
    } catch {
      return undefined;
    }
  }, [scenarios, compareId, inputs]);
  const dirty =
    !!inputs &&
    (!loaded || JSON.stringify(inputs) !== JSON.stringify(loaded.inputs));
  const changedElsewhere =
    loaded &&
    scenarios?.find((scenario) => scenario._id === loaded._id)?.revision !==
      loaded.revision;
  const loadPlan = (change: PendingChange) => {
    if (!baseline || !scenarios) return;
    const scenario =
      change.type === "load"
        ? scenarios.find((item) => item._id === change.id)
        : undefined;
    setLoaded(scenario ?? null);
    setInputs(scenario?.inputs ?? baseline.inputs);
    setName(scenario?.name ?? "My retirement plan");
    setCompareId("");
    setPending(null);
  };
  const requestLoad = (change: PendingChange) => {
    if (dirty) setPending(change);
    else loadPlan(change);
  };
  const savePlan = async (asCopy = false, submittedName = name) => {
    if (!inputs) return false;
    const snapshot = inputs;
    return run(async () => {
      const result = await save({
        id: asCopy ? undefined : loaded?._id,
        expectedRevision: asCopy ? undefined : loaded?.revision,
        name: submittedName.trim(),
        inputs: snapshot,
      });
      setLoaded({ ...result, name: submittedName.trim(), inputs: snapshot });
      setName(submittedName.trim());
      setSaving(false);
      setCopying(false);
    }, "Scenario saved");
  };
  if (!inputs || !baseline || !scenarios || !projection)
    return <Loading text="Preparing your forecast…" />;
  const compatible = scenarios.filter(
    (scenario) =>
      scenario._id !== loaded?._id &&
      scenario.inputs.asOfDate === inputs.asOfDate &&
      scenario.inputs.currentAge === inputs.currentAge,
  );
  return (
    <>
      {!baseline.accounts.length && !scenarios.length && (
        <ForecastPreview onAddAccount={onAddAccount} />
      )}
      <div className="forecast-toolbar">
        <div className="forecast-scenario-controls">
          <Select
            aria-label="Forecast scenario"
            value={loaded?._id ?? ""}
            onValueChange={(id) => requestLoad({ type: "load", id })}
            options={[
              {
                value: "",
                label: loaded
                  ? "New from current accounts"
                  : `${name} · unsaved`,
              },
              ...scenarios.map((scenario) => ({
                value: scenario._id,
                label: scenario.name,
              })),
            ]}
          />
          <Select
            aria-label="Compare with scenario"
            value={comparison ? compareId : ""}
            onValueChange={setCompareId}
            options={[
              { value: "", label: "Compare scenario" },
              ...compatible.map((scenario) => ({
                value: scenario._id,
                label: scenario.name,
              })),
            ]}
          />
          <Select
            aria-label="Forecast dollar basis"
            value={real ? "real" : "nominal"}
            onValueChange={(value) => setReal(value === "real")}
            options={[
              { value: "real", label: "Today’s dollars" },
              { value: "nominal", label: "Future dollars" },
            ]}
          />
        </div>
        <div className="forecast-actions">
          <Button
            icon={<Copy size={15} />}
            disabled={busy || !!projection.error}
            onClick={() => {
              setSaveName(`${name} copy`);
              setCopying(true);
              setSaving(true);
            }}
          >
            Save a copy
          </Button>
          <Button
            tone="primary"
            icon={<Save size={15} />}
            disabled={
              busy || !dirty || !!projection.error || inputs !== deferredInputs
            }
            onClick={() => {
              if (loaded) void savePlan();
              else {
                setSaveName(name);
                setCopying(false);
                setSaving(true);
              }
            }}
          >
            Save scenario
          </Button>
        </div>
      </div>
      <div className="forecast-source-line">
        <span>
          Starting funds from {dateLabel(inputs.asOfDate)}
          {loaded
            ? ` · ${dirty ? "Unsaved changes" : "Saved scenario"}`
            : " · Review the example ages and assumptions"}
        </span>
        <button type="button" onClick={() => setReview(true)}>
          <Info size={14} />
          Review starting data
        </button>
      </div>
      {changedElsewhere && (
        <div className="forecast-warning" role="alert">
          This scenario changed in another session. Save a copy to keep your
          edits, or reload the saved version.
          <Button
            disabled={busy}
            onClick={() => requestLoad({ type: "load", id: loaded._id })}
          >
            Reload saved version
          </Button>
        </div>
      )}
      {projection.error && (
        <div className="forecast-warning" role="alert">
          {projection.error}
        </div>
      )}
      <div className="forecast-workspace" aria-busy={inputs !== deferredInputs}>
        <ForecastAssumptions inputs={inputs} onChange={setInputs} />
        {projection.result && projection.solution && deferredInputs ? (
          <ForecastResults
            inputs={deferredInputs}
            result={projection.result}
            solution={projection.solution}
            comparison={comparison}
            name={name}
            real={real}
            onApplySavings={(amount) =>
              setInputs({ ...inputs, extraMonthlySavingsCents: amount })
            }
          />
        ) : (
          <section className="panel forecast-invalid">
            <h2>Review your plan details</h2>
            <p>
              The projection will return once the age ranges and amounts form a
              valid plan.
            </p>
          </section>
        )}
      </div>
      <div className="forecast-footer-actions">
        <Button
          icon={<RefreshCw size={15} />}
          onClick={() => requestLoad({ type: "fresh" })}
        >
          New from current accounts
        </Button>
        {loaded && (
          <Button
            tone="quiet"
            icon={<Trash2 size={15} />}
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            Delete scenario
          </Button>
        )}
      </div>
      <Modal
        open={saving}
        onClose={() => {
          if (!busy) setSaving(false);
        }}
        title={copying ? "Save a new scenario" : "Name this scenario"}
      >
        <form
          className="forecast-modal-content"
          onSubmit={(event) => {
            event.preventDefault();
            void savePlan(copying, saveName);
          }}
        >
          <label htmlFor="forecast-name">Scenario name</label>
          <input
            id="forecast-name"
            className="input"
            autoFocus
            maxLength={80}
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder="Retire at 65, with two trips each year"
          />
          <p className="plan-note">
            Saves the starting funds and every assumption so you can return to
            the same plan.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setSaving(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              tone="primary"
              type="submit"
              disabled={busy || !saveName.trim()}
            >
              Save scenario
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Keep these changes?"
      >
        <div className="forecast-modal-content">
          <p>
            This plan has unsaved changes. Save it before opening another
            scenario, or continue without them.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setPending(null)} disabled={busy}>
              Keep editing
            </Button>
            <Button
              disabled={busy}
              onClick={() => pending && loadPlan(pending)}
            >
              Discard changes
            </Button>
            <Button
              tone="primary"
              disabled={busy || !!projection.error}
              onClick={() => {
                const next = pending;
                void savePlan(false, name).then((saved) => {
                  if (saved && next) loadPlan(next);
                });
              }}
            >
              Save & continue
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this scenario?"
      >
        <div className="forecast-modal-content">
          <p>
            Delete “{loaded?.name}”? Your accounts, transactions, and other
            scenarios will remain.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setDeleting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              tone="danger"
              disabled={busy}
              onClick={() => {
                if (!loaded) return;
                void run(async () => {
                  await remove({
                    id: loaded._id as Id<"forecastScenarios">,
                    expectedRevision: loaded.revision,
                  });
                  setDeleting(false);
                  loadPlan({ type: "fresh" });
                }, "Scenario deleted");
              }}
            >
              Delete scenario
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={review}
        onClose={() => setReview(false)}
        title="Starting data & assumptions"
        wide
      >
        <div className="forecast-modal-content forecast-baseline">
          <p>
            {loaded
              ? "Your saved scenario keeps its original amounts. The table below shows today’s account data for comparison."
              : "Starting funds come from the accounts below. Age, retirement, inflation, and growth are example assumptions until you review them."}
          </p>
          <div className="forecast-history-summary">
            <h3>Income and spending estimate</h3>
            <p>
              {baseline.history.observedMonths} months with activity between{" "}
              {dateLabel(baseline.history.from)} and{" "}
              {dateLabel(baseline.history.to)}.{" "}
              {baseline.history.complete
                ? "The recorded entries in this date range were fully read; this does not prove complete bank coverage."
                : "The date range exceeds the supported read limit. Enter income and spending manually."}
            </p>
            <p>
              Monthly income {money(baseline.inputs.monthlyIncomeCents, false)}{" "}
              · living spending{" "}
              {money(baseline.inputs.monthlySpendingCents, false)}. Review
              sparse history, refunds, and one-time expenses.
            </p>
          </div>
          <div className="forecast-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Included as</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {baseline.accounts.map((account) => (
                  <tr key={account.id}>
                    <th>
                      {account.name}
                      <small>{account.excludedReason ?? account.subtype}</small>
                    </th>
                    <td>
                      {account.included
                        ? account.bucket === "cash"
                          ? "Cash"
                          : account.bucket === "retirement"
                            ? "Retirement"
                            : "Investments"
                        : "Excluded"}
                    </td>
                    <td>{money(account.balanceCents, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul>
            {baseline.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <div className="modal-actions">
            <Button
              onClick={() => {
                setReview(false);
                requestLoad({ type: "fresh" });
              }}
              icon={<RefreshCw size={15} />}
            >
              New from current accounts
            </Button>
            <Button tone="primary" onClick={() => setReview(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
