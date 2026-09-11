import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import { dateLabel, localDate, message, money } from "../../lib/format";
import {
  Button,
  Field,
  Loading,
  Modal,
  Panel,
  Picker,
  useTask,
} from "../../components/folio/ui";
import { DatePicker } from "../../components/folio/DatePicker";
import "./sophtron.css";

type Status = FunctionReturnType<typeof api.sophtron.status>;
type Preview = FunctionReturnType<typeof api.sophtron.preview>;
type Result = FunctionReturnType<typeof api.sophtron.importAccounts>;
type Choice = {
  selected: boolean;
  target: string;
  usd: boolean;
  sign: "" | "positive" | "negative";
};

function SophtronSetup({ status }: { status: Status }) {
  const { profile } = useData();
  return (
    <details className="sophtron-setup" open={!status.availableToUser}>
      <summary>Personal deployment setup</summary>
      <p>
        Each operator uses their own Marten frontend and Convex deployment.
        Sophtron credentials are configured on that server and assigned to one
        Marten user.
      </p>
      <ol>
        <li>
          Create your own{" "}
          <a
            href="https://sophtron.com/Account/Register"
            target="_blank"
            rel="noreferrer"
          >
            Sophtron account <ExternalLink size={12} />
          </a>{" "}
          and review its{" "}
          <a
            href="https://sophtron.com/developerAgreement"
            target="_blank"
            rel="noreferrer"
          >
            personal use agreement
          </a>
          .
        </li>
        <li>
          Use Sophtron’s{" "}
          <a href="https://docs.sophtron.com/" target="_blank" rel="noreferrer">
            official setup and connection flow
          </a>{" "}
          to create a customer and link your bank. Bank login and MFA stay in
          Sophtron’s interface. Its{" "}
          <a
            href="https://sophtron.com/home/privacy"
            target="_blank"
            rel="noreferrer"
          >
            privacy policy
          </a>{" "}
          explains the credentials it may store.
        </li>
        <li>
          Get your API user ID and access key from{" "}
          <a
            href="https://sophtron.com/Manage/Developer"
            target="_blank"
            rel="noreferrer"
          >
            Sophtron developer settings
          </a>
          , and the customer ID from that customer’s V2 record.
        </li>
        <li>
          Set these environment variables in your personal Convex deployment.
          Keep the access key in server settings.
        </li>
      </ol>
      <dl className="sophtron-env">
        <div>
          <dt>SOPHTRON_USER_ID</dt>
          <dd>Your Sophtron API user ID</dd>
        </div>
        <div>
          <dt>SOPHTRON_ACCESS_KEY</dt>
          <dd>Your Sophtron access key</dd>
        </div>
        <div>
          <dt>SOPHTRON_CUSTOMER_ID</dt>
          <dd>The customer you linked</dd>
        </div>
        <div>
          <dt>SOPHTRON_OWNER_USER_ID</dt>
          <dd>
            {profile?.demo ? (
              "Sign in and start a personal workspace to get this ID."
            ) : (
              <>
                <code>{status.currentUserId}</code>
                <small>Your signed-in Marten user ID</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>SOPHTRON_ENV</dt>
          <dd>production</dd>
        </div>
      </dl>
      <p className="muted">
        Sophtron’s preview API also uses live bank data. This setup does not
        provide a test bank. Shared hosted use needs an arrangement permitted by
        Sophtron; Marten does not collect other users’ developer keys.
      </p>
    </details>
  );
}
export function SophtronImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: () => void;
}) {
  const status = useQuery(api.sophtron.status, {});
  const preview = useAction(api.sophtron.preview);
  const importAccounts = useAction(api.sophtron.importAccounts);
  const data = useData();
  const [loaded, setLoaded] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [fromDate, setFromDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    return localDate(start);
  });
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function load() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await preview({});
      setLoaded(next);
      setReviewed(false);
      setChoices(
        Object.fromEntries(
          next.accounts.map((account) => {
            const existing = data.accounts.find(
              (row) => row._id === account.martenAccountId,
            );
            return [
              account.externalId,
              {
                selected: false,
                target: account.martenAccountId ?? "choose",
                usd:
                  existing?.sophtronUsdConfirmed ??
                  !account.needsUsdConfirmation,
                sign: existing?.sophtronDebtSign ?? "",
              },
            ];
          }),
        ),
      );
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
    selected.length <= 20 &&
    selected.every((account) => {
      const choice = choices[account.externalId];
      return (
        !account.unsupportedReason &&
        choice.target !== "choose" &&
        (!account.needsUsdConfirmation || choice.usd) &&
        (!account.needsDebtSign || choice.sign !== "")
      );
    }) &&
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
          fromDate,
          accounts: selected.map((account) => {
            const choice = choices[account.externalId];
            return {
              externalAccountId: account.externalId,
              ...(choice.target !== "new"
                ? { targetAccountId: choice.target as Id<"accounts"> }
                : {}),
              confirmUsd: choice.usd,
              ...(choice.sign ? { debtSign: choice.sign } : {}),
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
      title="Import from Sophtron"
      wide={!!loaded && !result}
    >
      <div className="sophtron-import">
        {!status ? (
          <Loading text="Checking Sophtron setup…" />
        ) : result ? (
          <div className="sophtron-result" role="status">
            <span className="sophtron-result-icon">
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
            {result.skippedPending > 0 && (
              <p className="muted">
                {result.skippedPending} pending records were left out.
              </p>
            )}
            <Button tone="primary" onClick={onImported ?? onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p>
              Bring in accounts you already linked with Sophtron. You’ll review
              balances, currency, and the matching Marten account before
              importing.
            </p>
            {!status.availableToUser && (
              <div className="account-notice">{status.setupReason}</div>
            )}
            {status.environment === "preview" && (
              <div className="account-notice">
                Sophtron preview uses live bank data. Review only accounts you
                authorized.
              </div>
            )}
            {error && (
              <div className="institution-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {!loaded ? (
              <>
                <div className="sophtron-capabilities">
                  <span>Cached balances</span>
                  <span>Posted transactions</span>
                  <span>Available due dates</span>
                </div>
                <p className="muted">
                  Pending transactions, holdings, and statement minimums are not
                  included. Provider history may be incomplete; review your
                  first import against your bank.
                </p>
                <Button
                  tone="primary"
                  disabled={!status.availableToUser || busy}
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
                <SophtronSetup status={status} />
              </>
            ) : loaded.accounts.length === 0 ? (
              <>
                <div className="account-notice">
                  No linked accounts were returned for the configured Sophtron
                  customer. Finish the connection in Sophtron, then try again.
                </div>
                <Button onClick={() => void load()} disabled={busy}>
                  Check again
                </Button>
                <SophtronSetup status={status} />
              </>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <div className="account-notice">{loaded.notice}</div>
                <div className="sophtron-account-list">
                  {loaded.accounts.map((account) => {
                    const choice = choices[account.externalId];
                    const eligible = data.accounts.filter(
                      (row) =>
                        !row.closed &&
                        row.kind === account.kind &&
                        row.currency === "USD" &&
                        (!row.itemId ||
                          data.institutions.find(
                            (item) => item._id === row.itemId,
                          )?.status === "disconnected") &&
                        (!row.sophtronAccountId ||
                          row.sophtronAccountId === account.externalId),
                    );
                    const balance =
                      account.balanceCents === null
                        ? null
                        : account.balanceCents *
                          (account.needsDebtSign && choice.sign === "negative"
                            ? -1
                            : 1);
                    return (
                      <section
                        className={`sophtron-review-account ${choice.selected ? "selected" : ""}`}
                        key={account.externalId}
                      >
                        <label className="sophtron-account-check">
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
                              {account.mask && ` · ••${account.mask}`}
                            </strong>
                            <small>
                              {account.kind ?? "Unsupported type"} ·{" "}
                              {account.lastUpdated
                                ? `Provider updated ${new Date(account.lastUpdated).toLocaleDateString()}`
                                : "Provider update time unavailable"}
                            </small>
                          </span>
                          <span className="sophtron-reported-balance">
                            {account.balanceCents === null
                              ? "Unavailable"
                              : `${(account.balanceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${account.currency || "(currency not supplied)"}`}
                          </span>
                        </label>
                        {account.unsupportedReason && (
                          <p className="muted">{account.unsupportedReason}</p>
                        )}
                        {choice.selected && (
                          <div className="sophtron-account-options">
                            <Field
                              label="Marten account"
                              hint="Choose the same account when changing providers. A new account adds another balance to net worth."
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
                                    value: "choose",
                                    label: "Choose where to import…",
                                  },
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
                            {account.needsUsdConfirmation && (
                              <label className="sophtron-check">
                                <input
                                  type="checkbox"
                                  checked={choice.usd}
                                  disabled={busy}
                                  onChange={(event) =>
                                    update(account.externalId, {
                                      usd: event.target.checked,
                                    })
                                  }
                                />
                                <span>
                                  I confirm this account uses US dollars.
                                  Sophtron’s currency field does not identify
                                  USD.
                                </span>
                              </label>
                            )}
                            {account.needsDebtSign && (
                              <Field
                                label="How Sophtron shows amounts owed"
                                hint="Compare the reported balance above with your bank. This keeps debt and credit balances accurate in net worth."
                              >
                                <Picker
                                  label={`Debt sign for ${account.name}`}
                                  value={choice.sign || "choose"}
                                  disabled={busy}
                                  onChange={(sign) =>
                                    update(account.externalId, {
                                      sign:
                                        sign === "choose"
                                          ? ""
                                          : (sign as "positive" | "negative"),
                                    })
                                  }
                                  options={[
                                    {
                                      value: "choose",
                                      label: "Choose the provider’s sign…",
                                    },
                                    {
                                      value: "positive",
                                      label:
                                        "Debt is positive (for example, 100 owed)",
                                    },
                                    {
                                      value: "negative",
                                      label:
                                        "Debt is negative (for example, −100 owed)",
                                    },
                                  ]}
                                />
                              </Field>
                            )}
                            {balance !== null &&
                              (!account.needsDebtSign || choice.sign) &&
                              (!account.needsUsdConfirmation || choice.usd) && (
                                <p className="sophtron-imported-balance">
                                  {account.needsDebtSign
                                    ? balance < 0
                                      ? `Credit balance: ${money(Math.abs(balance))}`
                                      : `Amount owed: ${money(balance)}`
                                    : `Current balance: ${money(balance)}`}
                                </p>
                              )}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
                <Field
                  label="Import transactions from"
                  hint="When changing providers, start after the existing account’s most recent transaction. Older cached history stays in Marten."
                >
                  <DatePicker
                    label="Sophtron import start date"
                    value={fromDate}
                    onChange={(value) => {
                      setFromDate(value);
                      setReviewed(false);
                    }}
                    min="2000-01-01"
                    max={localDate()}
                    required
                    disabled={busy}
                  />
                </Field>
                <label className="sophtron-check sophtron-final-review">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={busy}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  <span>I reviewed these balances and account mappings.</span>
                </label>
                {selected.length > 20 && (
                  <p className="institution-error" role="alert">
                    Select at most 20 accounts at a time.
                  </p>
                )}
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
export function SophtronConnection() {
  const status = useQuery(api.sophtron.status, {});
  const sync = useAction(api.sophtron.sync);
  const disconnect = useMutation(api.sophtron.disconnect);
  const { busy, run } = useTask();
  const [open, setOpen] = useState(false);
  const data = useData();
  const connection = status?.connection;
  return (
    <div id="sophtron" tabIndex={-1}>
      <Panel className="institution-card sophtron-connection">
        <div className="institution-card-top">
          <span className="sophtron-provider-icon">
            <Landmark size={22} />
          </span>
          <div>
            <h3>Sophtron</h3>
            <span>
              Personal import ·{" "}
              {connection
                ? `${connection.accounts} ${connection.accounts === 1 ? "account" : "accounts"}`
                : "Optional provider"}
            </span>
          </div>
          {connection && (
            <span className={`institution-status ${connection.status}`}>
              {connection.status === "syncing"
                ? "Importing"
                : connection.status === "disconnected"
                  ? "Imports stopped"
                  : connection.status === "error"
                    ? "Needs attention"
                    : "Connected"}
            </span>
          )}
        </div>
        {!status ? (
          <Loading text="Checking Sophtron setup…" />
        ) : (
          <>
            <p className="muted">
              {status.availableToUser
                ? "Import the latest data Sophtron has collected for your linked accounts."
                : status.setupReason}
            </p>
            {connection?.syncedAt && (
              <p className="muted">
                Last imported {new Date(connection.syncedAt).toLocaleString()}
              </p>
            )}
            {connection?.error && (
              <div className="institution-error" role="alert">
                <AlertCircle size={16} />
                <span>{connection.error}</span>
              </div>
            )}
            {connection?.warning && (
              <p className="account-notice">{connection.warning}</p>
            )}
            {connection && (
              <div className="institution-accounts">
                {data.accounts
                  .filter(
                    (account) =>
                      account.sophtronConnectionId === connection._id,
                  )
                  .map((account) => (
                    <a
                      key={account._id}
                      href={`/accounts?account=${account._id}`}
                    >
                      <span>
                        {account.name}
                        {account.mask && ` · ••${account.mask}`}
                      </span>
                      <ArrowUpRight size={13} />
                    </a>
                  ))}
              </div>
            )}
            <div className="institution-actions">
              <Button
                onClick={() => setOpen(true)}
                disabled={busy || connection?.status === "syncing"}
                icon={<Download size={14} />}
              >
                {status.availableToUser
                  ? connection?.status === "disconnected"
                    ? "Review and reconnect"
                    : "Review linked accounts"
                  : "View setup"}
              </Button>
              {connection && connection.status !== "disconnected" && (
                <>
                  <Button
                    disabled={
                      busy ||
                      connection.status === "syncing" ||
                      !status.availableToUser
                    }
                    icon={<RefreshCw size={14} />}
                    onClick={() =>
                      void run(
                        () => sync({}),
                        "Sophtron import updated. Review its data coverage below.",
                      )
                    }
                  >
                    Import latest
                  </Button>
                  <Button
                    tone="quiet"
                    disabled={busy}
                    icon={<Unplug size={14} />}
                    onClick={() =>
                      void run(
                        () => disconnect({ connectionId: connection._id }),
                        "Sophtron imports stopped. Cached history is saved.",
                      )
                    }
                  >
                    Stop imports
                  </Button>
                </>
              )}
            </div>
            <p className="sophtron-stop-note">
              Stopping imports retains saved history. To revoke bank access,
              remove the connection in{" "}
              <a href="https://sophtron.com/" target="_blank" rel="noreferrer">
                Sophtron
              </a>
              . Removing the server access key disables this adapter.
            </p>
          </>
        )}
      </Panel>
      {open && <SophtronImport onClose={() => setOpen(false)} />}
    </div>
  );
}
