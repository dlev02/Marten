import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileUp,
  ExternalLink,
  Gauge,
  Plus,
  Trash2,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  creditBureaus,
  creditModels,
  groupCreditHistory,
  type CreditBureau,
  type CreditModel,
} from "../../convex/lib/creditScores";
import {
  Button,
  Empty,
  Field,
  InfoTip,
  Loading,
  Modal,
  Panel,
  useTask,
  useToast,
} from "../components/folio/ui";
import { PageHeader } from "../components/folio/PageHeader";
import { DatePicker } from "../components/folio/DatePicker";
import { Select } from "../components/folio/Select";
import { dateLabel, localDate, message } from "../lib/format";
import type {
  CreditScoreImport,
  CreditScoreSuggestion,
} from "../lib/creditScoreImport";
import "./credit-scores.css";

type Draft = { entry?: Doc<"creditScores">; suggestion?: CreditScoreImport };
const fullDate = (date: string) =>
  dateLabel(date, { month: "short", day: "numeric", year: "numeric" });
const pdfHelp =
  "PDFs stay on this device. Review the details before saving. Files can be up to 10 MB and 20 pages.";

export function CreditScores() {
  const entries = useQuery(api.creditScores.list, {});
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reading, setReading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const readVersion = useRef(0);
  const toast = useToast();
  useEffect(
    () => () => {
      readVersion.current++;
    },
    [],
  );
  const groups = useMemo(() => groupCreditHistory(entries ?? []), [entries]);
  const current = groups.find((group) => group.key === selected) ?? groups[0];
  const history = current?.history ?? [];
  const latest = history[0];
  const previous = history[1];
  const change = latest && previous ? latest.score - previous.score : null;

  async function importFile(file: File) {
    const version = ++readVersion.current;
    setReading(true);
    try {
      const { readCreditScorePdf } = await import("../lib/creditPdf");
      const suggestion = await readCreditScorePdf(file);
      if (version === readVersion.current) setDraft({ suggestion });
    } catch (error) {
      if (version === readVersion.current)
        setDraft({ suggestion: { fields: {}, message: message(error) } });
    } finally {
      if (version === readVersion.current) setReading(false);
    }
  }
  return (
    <div className="credit-scores-page">
      <PageHeader title="Credit scores">
        {!!groups.length && (
          <div className="credit-import-actions">
            <Button
              icon={<FileUp size={16} />}
              disabled={reading}
              onClick={() => fileInput.current?.click()}
            >
              {reading ? "Reading locally…" : "Import PDF"}
            </Button>
            <InfoTip disclosure label="About PDF imports" text={pdfHelp} />
          </div>
        )}
        {!!groups.length && (
          <Button
            tone="primary"
            icon={<Plus size={16} />}
            disabled={reading}
            onClick={() => setDraft({})}
          >
            Add score
          </Button>
        )}
      </PageHeader>
      <input
        ref={fileInput}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Import credit-score PDF"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <p className="credit-page-intro">
        Keep scores from your own reports. Each bureau and scoring model has its
        own history.
      </p>
      <button
        className="credit-guide-trigger"
        onClick={() => setGuideOpen(true)}
      >
        Where to find your score <ArrowUpRight size={14} />
      </button>
      {reading && (
        <p role="status" className="credit-read-status">
          Reading the text in your PDF…
        </p>
      )}
      <Modal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="Find your credit score"
        description="Start with a bank or credit service you already use."
      >
        <div className="credit-source-guide">
          {[
            {
              name: "Discover",
              format: "On statements, online and in the app",
              description:
                "Look for the FICO score section in a recent statement. A PDF that contains readable score text can be imported here.",
              url: "https://www.discover.com/credit-cards/card-smarts/check-your-fico-score-for-free/",
            },
            {
              name: "Capital One · CreditWise",
              format: "FICO Score 8 · TransUnion",
              description:
                "Open CreditWise to view your current score. Older CreditWise observations may use a different scoring model.",
              url: "https://www.capitalone.com/creditwise/",
            },
            {
              name: "Chase · Credit Journey",
              format: "VantageScore 3.0 · Experian",
              description:
                "In Chase, open Credit Journey and select See details. Save the score and the date shown there.",
              url: "https://www.chase.com/personal/financial-tools/monitor/free-credit-score",
            },
            {
              name: "American Express · MyCredit Guide",
              format: "FICO Score 8 · Experian",
              description:
                "Open MyCredit Guide to see your score. Use the model and bureau printed with the observation you are recording.",
              url: "https://www.americanexpress.com/us/credit-cards/features-benefits/free-credit-score/index.html",
            },
          ].map((source) => (
            <section key={source.name} className="credit-source-row">
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name} <ExternalLink size={14} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span>{source.format}</span>
              <p>{source.description}</p>
            </section>
          ))}
        </div>
        <p className="credit-editor-note">
          Record the score’s own date, bureau and model. Statement availability
          varies; a credit report alone may not include a score. Marten reads
          text PDFs, so enter a score manually if it is only shown in an app or
          screenshot.
        </p>
        <div className="modal-actions">
          <Button
            onClick={() => {
              setGuideOpen(false);
              fileInput.current?.click();
            }}
            icon={<FileUp size={15} />}
            disabled={reading}
          >
            Import PDF
          </Button>
          <Button
            tone="primary"
            onClick={() => {
              setGuideOpen(false);
              setDraft({});
            }}
            disabled={reading}
          >
            Add score
          </Button>
        </div>
      </Modal>
      {entries === undefined ? (
        <Loading />
      ) : !groups.length ? (
        <Panel className="credit-empty-panel">
          <Empty
            icon={<Gauge size={27} strokeWidth={1.5} />}
            title="Your score history starts here"
            description="Save a score from your bank or credit report, then follow how it changes over time."
            action={
              <div className="credit-empty-actions">
                <Button
                  tone="primary"
                  icon={<Plus size={16} />}
                  onClick={() => setDraft({})}
                  disabled={reading}
                >
                  Add your first score
                </Button>
                <div className="credit-import-actions">
                  <Button
                    icon={<FileUp size={16} />}
                    onClick={() => fileInput.current?.click()}
                    disabled={reading}
                  >
                    {reading ? "Reading locally…" : "Import PDF"}
                  </Button>
                  <InfoTip
                    disclosure
                    label="About PDF imports"
                    text={pdfHelp}
                  />
                </div>
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="credit-history-selector">
            <Select
              aria-label="Credit score history"
              value={current?.key ?? ""}
              onValueChange={setSelected}
              options={groups.map((group) => ({
                value: group.key,
                label: group.key,
              }))}
            />
            <span>
              {history.length}{" "}
              {history.length === 1 ? "observation" : "observations"}
            </span>
          </div>
          <Panel className="credit-history-panel">
            <div className="credit-history-heading">
              <div>
                <p>
                  {latest?.bureau} · {latest?.model}
                </p>
                <div className="credit-current-score">{latest?.score}</div>
                <p>
                  As of {latest ? fullDate(latest.date) : "—"} ·{" "}
                  {latest?.source}
                </p>
              </div>
              <div className="credit-score-change">
                {change === null ? (
                  <span>Add another score to see a change.</span>
                ) : (
                  <>
                    <strong>
                      {change > 0 ? (
                        <ArrowUpRight size={20} />
                      ) : change < 0 ? (
                        <ArrowDownRight size={20} />
                      ) : null}
                      {change > 0 ? "+" : ""}
                      {change} {Math.abs(change) === 1 ? "point" : "points"}
                    </strong>
                    <span>since {fullDate(previous.date)}</span>
                  </>
                )}
              </div>
            </div>
            {history.length > 1 ? (
              <div
                className="credit-score-chart"
                role="img"
                aria-label={`${current?.key} score history, from ${history[history.length - 1].score} to ${latest?.score}. Exact values are in the history table.`}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={[...history].reverse()}
                    margin={{ top: 15, right: 18, bottom: 4, left: -16 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string) =>
                        dateLabel(value, { month: "short", day: "numeric" })
                      }
                      minTickGap={45}
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[300, 850]}
                      ticks={[300, 550, 850]}
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={(label) => fullDate(String(label))}
                      formatter={(value) => [value, "Score"]}
                      contentStyle={{
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--text)",
                      }}
                    />
                    <Line
                      type="linear"
                      dataKey="score"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--accent)" }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="credit-chart-empty">
                Your next observation will add to this history.
              </p>
            )}
          </Panel>
          <Panel className="credit-table-panel">
            <div className="credit-table-heading">
              <h2>History</h2>
              <span>
                {latest?.bureau} · {latest?.model}
              </span>
            </div>
            <div className="credit-table-scroll">
              <table className="credit-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Score</th>
                    <th>Source</th>
                    <th>Entry</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry._id}>
                      <td>{fullDate(entry.date)}</td>
                      <td className="credit-table-score">{entry.score}</td>
                      <td>{entry.source}</td>
                      <td>
                        {entry.entryMethod === "pdf"
                          ? "Reviewed PDF"
                          : "Manual"}
                      </td>
                      <td>
                        <Button
                          onClick={() => setDraft({ entry })}
                          aria-label={`Edit score ${entry.score} from ${fullDate(entry.date)}`}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="credit-history-footnote">
            These are saved observations, not a live credit feed. Scores from
            different bureaus or model versions are shown separately.
          </p>
        </>
      )}
      {draft && (
        <ScoreEditor
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={(key) => {
            setSelected(key);
            toast("Credit score saved");
          }}
        />
      )}
    </div>
  );
}

function ScoreEditor({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: (key: string) => void;
}) {
  const initial: CreditScoreSuggestion =
    draft.entry ?? draft.suggestion?.fields ?? {};
  const [score, setScore] = useState(
    initial.score === undefined ? "" : String(initial.score),
  );
  const [date, setDate] = useState(
    initial.date ?? (draft.suggestion ? "" : localDate()),
  );
  const [bureau, setBureau] = useState<CreditBureau | "">(initial.bureau ?? "");
  const [model, setModel] = useState<CreditModel | "">(initial.model ?? "");
  const [source, setSource] = useState(initial.source ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation(api.creditScores.save);
  const remove = useMutation(api.creditScores.remove);
  const { busy, run } = useTask();
  const suggested = draft.suggestion?.fields.score !== undefined;
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={
        draft.entry
          ? "Edit credit score"
          : draft.suggestion
            ? "Review credit score"
            : "Add credit score"
      }
      description={
        draft.suggestion?.message ??
        "Use the score date, bureau and model shown in your report."
      }
    >
      <form
        className="credit-score-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            if (!bureau || !model || !date || !source.trim() || !score.trim())
              throw new Error(
                "Complete the score, date, bureau, model and source.",
              );
            if (
              !/^\d{3}$/.test(score) ||
              Number(score) < 300 ||
              Number(score) > 850
            )
              throw new Error("Enter a whole-number score from 300 to 850.");
            await save({
              ...(draft.entry ? { id: draft.entry._id } : {}),
              score: Number(score),
              date,
              bureau,
              model,
              source,
              entryMethod:
                draft.entry?.entryMethod ?? (suggested ? "pdf" : "manual"),
            });
            onSaved(`${bureau} / ${model}`);
            onClose();
          });
        }}
      >
        {draft.suggestion?.evidence && (
          <p className="credit-score-evidence">
            Found: <strong>{draft.suggestion.evidence}</strong>
          </p>
        )}
        <div className="credit-score-pair">
          <Field label="Score">
            <input
              className="f-input"
              aria-label="Credit score"
              inputMode="numeric"
              type="text"
              pattern="[0-9]{3}"
              maxLength={3}
              required
              value={score}
              onChange={(event) => setScore(event.target.value)}
              placeholder="300–850"
            />
          </Field>
          <Field label="Score date">
            <DatePicker
              label="Score date"
              value={date}
              onChange={setDate}
              min="1900-01-01"
              max={localDate()}
              required
            />
          </Field>
        </div>
        <Field label="Credit bureau">
          <Select
            aria-label="Credit bureau"
            value={bureau}
            onValueChange={(value) => setBureau(value as CreditBureau)}
            placeholder="Choose the bureau"
            options={creditBureaus.map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="Scoring model">
          <Select
            aria-label="Scoring model"
            value={model}
            onValueChange={(value) => setModel(value as CreditModel)}
            placeholder="Choose the model and version"
            options={creditModels.map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="Source">
          <input
            className="f-input"
            aria-label="Credit score source"
            placeholder="e.g. Discover or myFICO"
            maxLength={100}
            required
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </Field>
        <p className="credit-editor-note">
          Use the details printed with this score. A card issuer’s name alone
          doesn’t identify the bureau or model. Auto and Bankcard score variants
          aren’t supported here.
        </p>
        <div className="modal-actions">
          <div className="credit-delete-action">
            {draft.entry && (
              <Button
                type="button"
                tone="danger"
                icon={<Trash2 size={15} />}
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={busy}>
            {draft.suggestion ? "Save reviewed score" : "Save score"}
          </Button>
        </div>
      </form>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this score?"
        description="This removes this observation from its history."
      >
        <div className="modal-actions">
          <Button disabled={busy} onClick={() => setConfirmDelete(false)}>
            Keep score
          </Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await remove({ id: draft.entry!._id });
                onClose();
              }, "Credit score deleted")
            }
          >
            Delete score
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
