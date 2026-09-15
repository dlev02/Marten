import { useLocation } from "react-router-dom";
import {
  providerName,
  type BankProvider,
} from "../../../convex/lib/bankProviders";
import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "../../lib/convex";
import type { FunctionReturnType } from "convex/server";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import { dateLabel, localDate, message } from "../../lib/format";
import {
  Avatar,
  Button,
  Field,
  InfoTip,
  Loading,
  Modal,
  Panel,
  Picker,
  useTask,
} from "../../components/folio/ui";
import { BankHistoryChoice } from "./BankHistoryChoice";
import "./simplefin.css";

type Status = FunctionReturnType<typeof api.simplefin.status>;
type Preview = FunctionReturnType<typeof api.simplefin.preview>;
type Result = FunctionReturnType<typeof api.simplefin.importAccounts>;
type Kind = Preview["accounts"][number]["kind"];
type Choice = { selected: boolean; target: string; kind: Kind };

const BRIDGE_URL = "https://beta-bridge.simplefin.org/";
function connectionProviderLabel(provider: string) {
  const labels: Record<string, string> = {
    mx: "MX",
    finicity: "Finicity",
    gocardless: "GoCardless",
    finverse: "Finverse",
    pluggy: "Pluggy",
    akahu: "Akahu",
    snaptrade: "SnapTrade",
  };
  return labels[provider.toLowerCase()] ?? provider;
}
const kindOptions = [
  { value: "cash", label: "Cash · checking & savings" },
  { value: "credit", label: "Credit card" },
  { value: "investment", label: "Retirement & brokerage" },
  { value: "loan", label: "Loan or mortgage" },
];
function statusLabel(status: NonNullable<Status["connection"]>["status"]) {
  return {
    connected: "Connected",
    syncing: "Importing",
    error: "Needs attention",
    disconnected: "Imports stopped",
  }[status];
}
function ProviderErrors({ errors }: { errors: string[] }) {
  useAmountsHidden();
  if (!errors.length) return null;
  return (
    <div className="account-notice simplefin-provider-errors" role="status">
      <strong>Connection reported:</strong>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
/** Step one: paste a setup token. The claim happens once, server-side. */
export function SimpleFinConnect({
  provider = "simplefin",
  onClose,
  onConnected,
}: {
  provider?: BankProvider;
  onClose: () => void;
  onConnected: (preview: Preview | null, warning: string | null) => void;
}) {
  const name = providerName(provider);
  const lunchflow = provider === "lunchflow";
  const providerUrl = lunchflow
    ? "https://lunchflow.app/destinations"
    : BRIDGE_URL;
  useAmountsHidden();
  const status = useQuery(api.simplefin.status, { provider });
  const connect = useAction(api.simplefin.connect);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const replacing = !!status?.connection;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !token.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await connect({ setupToken: token, provider });
      setToken("");
      onConnected(result.preview, result.warning);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`${replacing ? "Reconnect" : "Connect"} ${name}`}
    >
      <form
        className="simplefin-connect"
        onSubmit={(event) => void submit(event)}
      >
        <p>
          {name} links your banks and shares balances and transactions with apps
          you approve. Marten never sees your bank passwords.
        </p>
        <ol className="simplefin-steps">
          <li>
            Sign in to{" "}
            <a href={providerUrl} target="_blank" rel="noreferrer">
              {name} <ExternalLink size={12} />
            </a>{" "}
            and link the banks you want in Marten.
          </li>
          <li>
            {lunchflow ? (
              <>
                Open <strong>Destinations → Add Destination → API</strong> and
                copy your API key. Enable the accounts you want to share in
                Account Access.
              </>
            ) : (
              <>
                Choose <strong>New App</strong> and copy the setup token.
              </>
            )}
          </li>
          <li>
            {lunchflow
              ? "Paste your key below, then review the accounts to import."
              : "Paste it below. The token works once and expires quickly."}
          </li>
        </ol>
        {status && !status.availableToUser && (
          <div className="account-notice">{status.setupReason}</div>
        )}
        {replacing && (
          <div className="account-notice">
            A new token replaces the saved one. Imported accounts keep their
            history and stay mapped.
          </div>
        )}
        {error && (
          <div className="institution-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        <Field
          label={lunchflow ? "API key" : "Setup token"}
          hint={
            lunchflow
              ? "From your Lunch Flow API destination. Stored on the server and never returned to the browser."
              : "A long block of letters and numbers from SimpleFIN Bridge."
          }
        >
          <input
            type="password"
            aria-label={`${name} ${lunchflow ? "API key" : "setup token"}`}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            disabled={busy || !status?.availableToUser}
            placeholder={
              lunchflow ? "Paste your API key" : "Paste your setup token"
            }
            required
          />
        </Field>
        <p className="muted simplefin-price">
          {lunchflow ? (
            <>
              Lunch Flow is a separate subscription.{" "}
              <a href="https://lunchflow.app" target="_blank" rel="noreferrer">
                Check coverage and pricing
              </a>
              . Choose or repair bank connections in Lunch Flow; Marten imports
              the accounts shared with this key.
            </>
          ) : (
            "SimpleFIN Bridge sets its own subscription price, currently about $1.50 a month or $15 a year for up to 25 institutions."
          )}
        </p>
        <div className="account-form-footer">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={busy || !token.trim() || !status?.availableToUser}
            icon={
              busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <KeyRound size={16} />
              )
            }
          >
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
/** Step two: choose which linked accounts to import and how to map them. */
export function SimpleFinImport({
  provider = "simplefin",
  initial,
  initialError,
  onClose,
  onImported,
}: {
  provider?: BankProvider;
  initial?: Preview | null;
  initialError?: string | null;
  onClose: () => void;
  onImported?: () => void;
}) {
  const name = providerName(provider);
  useAmountsHidden();
  const status = useQuery(api.simplefin.status, { provider });
  const preview = useAction(api.simplefin.preview);
  const importAccounts = useAction(api.simplefin.importAccounts);
  const data = useData();
  const [loaded, setLoaded] = useState<Preview | null>(initial ?? null);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    initial ? initialChoices(initial) : {},
  );
  const [fromDate, setFromDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    return localDate(start);
  });
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [result, setResult] = useState<Result | null>(null);
  function initialChoices(next: Preview): Record<string, Choice> {
    return Object.fromEntries(
      next.accounts.map((account) => [
        account.externalId,
        {
          selected: false,
          target: account.martenAccountId ?? "new",
          kind: account.kind,
        },
      ]),
    );
  }
  async function load() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await preview({ provider });
      setLoaded(next);
      setReviewed(false);
      setChoices(initialChoices(next));
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  const selected =
    loaded?.accounts.filter(
      (account) => choices[account.externalId]?.selected,
    ) ?? [];
  const ready =
    selected.length > 0 &&
    selected.length <= 25 &&
    selected.every((account) => !account.unsupportedReason) &&
    reviewed &&
    !!fromDate &&
    fromDate <= localDate();
  function update(id: string, patch: Partial<Choice>) {
    setChoices((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
    setReviewed(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await importAccounts({
          provider,
          fromDate,
          accounts: selected.map((account) => {
            const choice = choices[account.externalId];
            return {
              externalAccountId: account.externalId,
              kind: choice.kind,
              ...(choice.target !== "new"
                ? { targetAccountId: choice.target as Id<"accounts"> }
                : {}),
            };
          }),
        }),
      );
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Import from ${name}`}
      wide={!!loaded && !result}
    >
      <div className="simplefin-import">
        {!status ? (
          <Loading text={`Checking ${name}…`} />
        ) : result ? (
          <div className="simplefin-result" role="status">
            <span className="simplefin-result-icon">
              <Check size={25} />
            </span>
            <h2>Import saved</h2>
            <p>
              {result.accounts} {result.accounts === 1 ? "account" : "accounts"}{" "}
              · {result.imported} new transactions · {result.updated} existing
              records updated
            </p>
            <p>
              {dateLabel(result.fromDate)}–{dateLabel(result.toDate)}
            </p>
            <div className="account-notice">{result.warning}</div>
            <ProviderErrors errors={result.providerErrors} />
            {result.skippedPending > 0 && (
              <p className="muted">
                {result.skippedPending} pending records were left out until they
                post.
              </p>
            )}
            <Button tone="primary" onClick={onImported ?? onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="institution-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {!loaded ? (
              <>
                <p>
                  Bring in the accounts you linked in {name}. You’ll choose the
                  account type and where each one lands before anything is
                  saved.
                </p>
                <div className="simplefin-capabilities">
                  <span>Daily balances</span>
                  <span>Posted transactions</span>
                  <span>Review before importing</span>
                </div>
                <Button
                  tone="primary"
                  disabled={!status.connection || busy}
                  onClick={() => void load()}
                  icon={
                    busy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Download size={16} />
                    )
                  }
                >
                  {busy ? "Loading linked accounts…" : "Review linked accounts"}
                </Button>
              </>
            ) : loaded.accounts.length === 0 ? (
              <>
                <div className="account-notice">
                  {name} returned no accounts. Link a bank and enable account
                  access in {name}, wait for its first refresh, then check
                  again.
                </div>
                <ProviderErrors errors={loaded.providerErrors} />
                <Button onClick={() => void load()} disabled={busy}>
                  Check again
                </Button>
              </>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <div className="account-notice">{loaded.notice}</div>
                <ProviderErrors errors={loaded.providerErrors} />
                <div className="simplefin-account-list">
                  {loaded.accounts.map((account) => {
                    const choice = choices[account.externalId];
                    const eligible = data.accounts.filter(
                      (row) =>
                        !row.closed &&
                        row.kind === choice.kind &&
                        row.currency === "USD" &&
                        (!row.itemId ||
                          data.institutions.find(
                            (item) => item._id === row.itemId,
                          )?.status === "disconnected") &&
                        (!row.simplefinAccountId ||
                          (row.simplefinConnectionId ===
                            status.connection?._id &&
                            row.simplefinAccountId === account.externalId)),
                    );
                    const debt =
                      choice.kind === "credit" || choice.kind === "loan";
                    const balance =
                      account.balanceCents === null
                        ? null
                        : debt
                          ? -account.balanceCents
                          : account.balanceCents;
                    return (
                      <section
                        className={`simplefin-review-account ${choice.selected ? "selected" : ""}`}
                        key={account.externalId}
                      >
                        <label className="simplefin-account-check">
                          <input
                            type="checkbox"
                            checked={choice.selected}
                            disabled={busy || !!account.unsupportedReason}
                            onChange={(event) =>
                              update(account.externalId, {
                                selected: event.target.checked,
                              })
                            }
                          />
                          <span>
                            <strong>
                              {account.name}
                              {account.alreadyImported && " · imported"}
                            </strong>
                            <small>
                              {account.institution}
                              {account.lastUpdated
                                ? ` · Updated ${new Date(account.lastUpdated).toLocaleDateString()}`
                                : ""}
                            </small>
                          </span>
                          <span className="simplefin-reported-balance">
                            {balance === null
                              ? "Unavailable"
                              : debt
                                ? balance < 0
                                  ? `Credit ${money(Math.abs(balance))}`
                                  : `Owes ${money(balance)}`
                                : money(balance)}
                          </span>
                        </label>
                        {account.unsupportedReason && (
                          <p className="muted">{account.unsupportedReason}</p>
                        )}
                        {choice.selected && (
                          <div className="simplefin-account-options">
                            <Field
                              label="Account type"
                              hint={
                                account.alreadyImported
                                  ? "Already imported. To correct its type, open the account on the Accounts page and choose Edit."
                                  : "Confirm the account type. Marten suggests one from the name; debt accounts show the amount owed."
                              }
                            >
                              <Picker
                                label={`Account type for ${account.name}`}
                                value={choice.kind}
                                disabled={busy || account.alreadyImported}
                                onChange={(kind) =>
                                  update(account.externalId, {
                                    kind: kind as Kind,
                                    target: "new",
                                  })
                                }
                                options={kindOptions}
                              />
                            </Field>
                            <Field
                              label="Marten account"
                              hint="Choose an existing account when switching providers; a new account adds another balance to net worth."
                            >
                              <Picker
                                label={`Marten account for ${account.name}`}
                                value={choice.target}
                                disabled={busy || account.alreadyImported}
                                onChange={(target) =>
                                  update(account.externalId, { target })
                                }
                                options={[
                                  {
                                    value: "new",
                                    label: "Create a new Marten account",
                                  },
                                  ...eligible.map((row) => ({
                                    value: row._id,
                                    label: row.name,
                                  })),
                                ]}
                              />
                            </Field>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
                <BankHistoryChoice
                  value={fromDate}
                  disabled={busy}
                  availableFrom={localDate(
                    new Date(Date.now() - 5 * 365 * 86400000),
                  )}
                  onChange={(value) => {
                    setFromDate(value ?? localDate());
                    setReviewed(false);
                  }}
                />
                <label className="simplefin-check simplefin-final-review">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={busy}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  <span>I reviewed these balances, types, and mappings.</span>
                </label>
                <div className="account-form-footer">
                  <Button onClick={onClose} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    tone="primary"
                    disabled={busy || !ready}
                    icon={
                      busy ? (
                        <Loader2 size={16} className="spin" />
                      ) : (
                        <Download size={16} />
                      )
                    }
                  >
                    {busy
                      ? "Importing…"
                      : `Import ${selected.length || "selected"} ${selected.length === 1 ? "account" : "accounts"}`}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
/** Connect → review flow used from Add account and from Bank connections. */
export function SimpleFinFlow({
  provider = "simplefin",
  onClose,
  onImported,
}: {
  provider?: BankProvider;
  onClose: () => void;
  onImported?: () => void;
}) {
  useAmountsHidden();
  const status = useQuery(api.simplefin.status, { provider });
  // The step is decided once from the first status result, so the reactive
  // status update during a claim cannot skip ahead before the preview arrives.
  const [step, setStep] = useState<"connect" | "import" | null>(null);
  const [handoff, setHandoff] = useState<{
    preview: Preview | null;
    warning: string | null;
  }>({ preview: null, warning: null });
  useEffect(() => {
    if (status && step === null)
      setStep(status.connection ? "import" : "connect");
  }, [status, step]);
  if (!status || step === null) return null;
  if (step === "connect")
    return (
      <SimpleFinConnect
        provider={provider}
        onClose={onClose}
        onConnected={(preview, warning) => {
          setHandoff({ preview, warning });
          setStep("import");
        }}
      />
    );
  return (
    <SimpleFinImport
      provider={provider}
      initial={handoff.preview}
      initialError={handoff.warning}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
/** Bank connections card. Mirrors the Plaid institution cards. */
export function SimpleFinConnection({
  provider = "simplefin",
}: {
  provider?: BankProvider;
}) {
  const name = providerName(provider);
  const lunchflow = provider === "lunchflow";
  const providerUrl = lunchflow
    ? "https://lunchflow.app/destinations"
    : BRIDGE_URL;
  useAmountsHidden();
  const status = useQuery(api.simplefin.status, { provider });
  const sync = useAction(api.simplefin.sync);
  const disconnect = useMutation(api.simplefin.disconnect);
  const remove = useMutation(api.simplefin.remove);
  const { busy, run } = useTask();
  const [open, setOpen] = useState<"flow" | "connect" | "remove" | null>(null);
  const location = useLocation();
  useEffect(() => {
    if (location.hash === `#${provider}` && status?.availableToUser)
      setOpen("flow");
  }, [location.hash, provider, status?.availableToUser]);
  const data = useData();
  const connection = status?.connection;
  const accounts = connection
    ? data.accounts.filter(
        (account) => account.simplefinConnectionId === connection._id,
      )
    : [];
  return (
    <div id={provider} tabIndex={-1} className="simplefin-section">
      {connection && (
        <Panel className="institution-card">
          <div className="institution-card-top">
            <Avatar name={name} />
            <div>
              <h3>{name}</h3>
              <span>
                {accounts.length}{" "}
                {accounts.length === 1 ? "account" : "accounts"} ·{" "}
                {connection.syncedAt
                  ? `Updated ${new Date(connection.syncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                  : "Waiting for first import"}
              </span>
            </div>
            <span className={`institution-status ${connection.status}`}>
              {connection.status === "syncing" && (
                <Loader2 size={12} className="spin" />
              )}
              {connection.status === "error" && <AlertCircle size={12} />}
              {statusLabel(connection.status)}
            </span>
          </div>
          {connection.error && (
            <div className="institution-error" role="alert">
              <AlertCircle size={16} />
              <span>{connection.error}</span>
            </div>
          )}
          <ProviderErrors errors={connection.providerErrors} />
          {accounts.length > 0 && (
            <div className="institution-accounts">
              {[...new Set(accounts.map((account) => account.institution))].map(
                (institution) => (
                  <section
                    className="institution-account-group"
                    key={institution}
                  >
                    <h4>
                      <Avatar
                        name={institution}
                        logo={
                          accounts.find(
                            (account) => account.institution === institution,
                          )?.logoUrl
                        }
                      />
                      {institution}
                    </h4>
                    {accounts
                      .filter((account) => account.institution === institution)
                      .map((account) => (
                        <a
                          key={account._id}
                          href={`/accounts?account=${account._id}`}
                        >
                          <span>
                            {account.name}
                            {account.mask &&
                              !account.name.includes(account.mask) &&
                              ` · ••${account.mask}`}
                            <small>
                              {account.connectionProvider
                                ? `Via ${connectionProviderLabel(account.connectionProvider)}`
                                : ""}
                            </small>
                          </span>
                          <ArrowUpRight size={13} />
                        </a>
                      ))}
                  </section>
                ),
              )}
            </div>
          )}
          <div className="institution-actions">
            <Button
              onClick={() => setOpen("flow")}
              disabled={busy || connection.status === "syncing"}
              icon={<Download size={14} />}
            >
              {connection.status === "disconnected"
                ? "Review and resume"
                : accounts.length
                  ? "Review accounts"
                  : "Choose accounts"}
            </Button>
            {connection.status !== "disconnected" && accounts.length > 0 && (
              <Button
                disabled={busy || connection.status === "syncing"}
                icon={<RefreshCw size={14} />}
                onClick={() =>
                  void run(() => sync({ provider }), `${name} import finished.`)
                }
              >
                Import latest
              </Button>
            )}
            <Button
              disabled={busy}
              icon={<KeyRound size={14} />}
              onClick={() => setOpen("connect")}
            >
              {lunchflow ? "Replace key" : "New token"}
            </Button>
            <InfoTip
              disclosure
              label={`About ${name} imports`}
              text={
                <>
                  When imports are on, Marten reads once a day. Revoke access in{" "}
                  <a href={providerUrl} target="_blank" rel="noreferrer">
                    {name}
                  </a>
                  . Removing the connection here forgets its credential and
                  keeps your history.
                </>
              }
            />
            {connection.status !== "disconnected" ? (
              <Button
                tone="quiet"
                disabled={busy}
                icon={<Unplug size={14} />}
                onClick={() =>
                  void run(
                    () => disconnect({ connectionId: connection._id }),
                    `${name} imports stopped. Saved history stays.`,
                  )
                }
              >
                Stop imports
              </Button>
            ) : (
              <Button
                tone="quiet"
                disabled={busy}
                icon={<Trash2 size={14} />}
                onClick={() => setOpen("remove")}
              >
                Remove
              </Button>
            )}
          </div>
        </Panel>
      )}
      {open === "flow" && (
        <SimpleFinFlow
          provider={provider}
          onClose={() => setOpen(null)}
          onImported={() => setOpen(null)}
        />
      )}
      {open === "connect" && (
        <SimpleFinConnect
          provider={provider}
          onClose={() => setOpen(null)}
          onConnected={() => setOpen(null)}
        />
      )}
      {open === "remove" && connection && (
        <Modal open onClose={() => setOpen(null)} title={`Remove ${name}?`}>
          <div className="disconnect-confirm">
            <p>
              Marten forgets the access token. Imported accounts stay as manual
              accounts with their balances and history.
            </p>
            <div className="account-form-footer">
              <Button onClick={() => setOpen(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                tone="danger"
                disabled={busy}
                icon={<Trash2 size={16} />}
                onClick={() =>
                  void run(async () => {
                    await remove({ provider });
                    setOpen(null);
                  }, `${name} connection removed.`)
                }
              >
                Remove
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
