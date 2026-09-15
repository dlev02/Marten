import { AmountInput } from "../../components/folio/AmountInput";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "../../lib/convex";
import {
  ArrowLeft,
  ArrowRight,
  Landmark,
  Link2,
  Loader2,
  Plus,
  WalletCards,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import { parseMoney, localDate } from "../../lib/format";
import { startPlaidFlow } from "../../lib/plaidLinkState";
import { isDemoSession } from "../../lib/demo";
import type { BankProvider } from "../../../convex/lib/bankProviders";
import { SimpleFinFlow } from "./SimpleFin";
import { BankHistoryChoice } from "./BankHistoryChoice";
import {
  Button,
  Field,
  Modal,
  Picker,
  Tabs,
  Toggle,
  useTask,
} from "../../components/folio/ui";
import "./accounts.css";

export function AddAccount({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const publicDemo = isDemoSession();
  const [bridge, setBridge] = useState<BankProvider | null>(null);
  const [plaidOpen, setPlaidOpen] = useState(false);
  const [importFromDate, setImportFromDate] = useState<
    string | null | undefined
  >();
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const requestVerification = useAction(
    api.reminderDelivery.requestVerification,
  );
  const verifyEmail = useAction(api.reminderDelivery.verifyEmail);
  const [tab, setTab] = useState("connect"),
    [mode, setMode] = useState<"transactions" | "investments">("transactions");
  const data = useData(),
    status = useQuery(api.plaid.status, open ? {} : "skip"),
    createToken = useAction(api.plaid.createLinkToken),
    { busy, run } = useTask();
  const importedHistory = useQuery(
    api.transactions.importedHistory,
    open ? {} : "skip",
  );
  const dayAfter = (date: string) =>
    new Date(Date.parse(date + "T00:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  const historyChoices = (importedHistory ?? [])
    .filter((row) => row.lastDate <= localDate())
    .map((row) => ({ ...row, fromDate: dayAfter(row.lastDate) }));
  const suggestedDate =
    importedHistory?.length === 1 && historyChoices.length === 1
      ? historyChoices[0].fromDate
      : undefined;
  const effectiveImportDate =
    importFromDate === undefined
      ? suggestedDate
      : (importFromDate ?? undefined);
  // A public deployment can limit Plaid to listed emails; everyone else uses SimpleFIN.
  const plaidRestricted = status?.restricted === true;
  const plaidVisible =
    !!status && (status.configured || status.verificationRequired);
  async function begin() {
    await run(async () => {
      if (!data.profile) return;
      const result = await createToken({ mode });
      startPlaidFlow({
        ...result,
        kind: "connect",
        userId: data.profile.userId,
        ...(mode === "transactions" && effectiveImportDate
          ? { importFromDate: effectiveImportDate }
          : {}),
      });
      onClose();
    });
  }
  return (
    <>
      <Modal open={open && !bridge} onClose={onClose} title="Add an account">
        {!plaidOpen && (
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              {
                value: "connect",
                label: "Connect a bank",
                icon: <Landmark size={16} />,
              },
              {
                value: "manual",
                label: "Add manually",
                icon: <Plus size={16} />,
              },
            ]}
          />
        )}
        {tab === "connect" ? (
          <div className="connect-account">
            <div className="connect-intro">
              {plaidOpen && (
                <Button
                  tone="quiet"
                  disabled={busy}
                  onClick={() => setPlaidOpen(false)}
                >
                  Back to connections
                </Button>
              )}
              <h2>
                {plaidOpen ? "Connect with Plaid" : "Choose your connection"}
              </h2>
              <p>
                {plaidOpen
                  ? "Choose your accounts and how much history to bring in."
                  : "Bring balances and transactions into Marten with a service you control."}
              </p>
            </div>
            {publicDemo ? (
              <div className="account-notice">
                This demo uses fictional finances. Exit demo and sign in to
                connect your own bank.
              </div>
            ) : data.profile?.demo ? (
              <div className="account-notice">
                You’re exploring sample data. Start a fresh workspace in
                Preferences before connecting a bank.
              </div>
            ) : plaidRestricted && !status?.verificationRequired ? (
              <div className="account-notice">
                Use your own SimpleFIN or Lunch Flow subscription. Plaid is
                available when you{" "}
                <a
                  className="text-link"
                  href="https://github.com/dlev02/marten/blob/main/docs/self-hosting.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  run your own copy of Marten
                </a>
                .
              </div>
            ) : status?.environment === "sandbox" ? (
              <div className="account-notice">
                Test connections are enabled. This connects fictional bank
                accounts, not live financial accounts.
              </div>
            ) : null}
            {!plaidOpen && (
              <div className="connect-providers">
                {plaidVisible && (
                  <ProviderChoice
                    icon={<Link2 size={18} />}
                    title="Continue with Plaid"
                    description={
                      status?.verificationRequired
                        ? "Available for your account · verify your email to continue"
                        : "Connect your bank securely through Plaid"
                    }
                    disabled={busy || data.profile?.demo || publicDemo}
                    onClick={() => setPlaidOpen(!plaidOpen)}
                  />
                )}
                <ProviderChoice
                  icon={<Link2 size={18} />}
                  title="Continue with SimpleFIN"
                  description="Your SimpleFIN Bridge token · US and Canadian banks"
                  disabled={busy || data.profile?.demo || publicDemo}
                  onClick={() => setBridge("simplefin")}
                />
                <ProviderChoice
                  icon={<Link2 size={18} />}
                  title="Continue with Lunch Flow"
                  description="Your Lunch Flow API key · more bank connections worldwide"
                  disabled={busy || data.profile?.demo || publicDemo}
                  onClick={() => setBridge("lunchflow")}
                />
              </div>
            )}
            {plaidOpen && status?.verificationRequired && (
              <div className="plaid-product-choice">
                <p>
                  Verify your sign-in email to unlock Plaid. This does not turn
                  on email reminders.
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await requestVerification({ purpose: "plaid" });
                      setVerificationSent(true);
                    }, "Verification code sent to your sign-in email.")
                  }
                >
                  {verificationSent
                    ? "Send a new code"
                    : "Send verification code"}
                </Button>
                {verificationSent && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await verifyEmail({
                          code: verificationCode,
                          purpose: "plaid",
                        });
                        setVerificationCode("");
                      }, "Email verified. You can connect with Plaid.");
                    }}
                  >
                    <Field
                      label="Verification code"
                      hint="Enter the eight-digit code from your email. It expires in 15 minutes."
                    >
                      <input
                        aria-label="Plaid email verification code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{8}"
                        maxLength={8}
                        required
                        value={verificationCode}
                        onChange={(event) =>
                          setVerificationCode(
                            event.target.value.replace(/\D/g, ""),
                          )
                        }
                      />
                    </Field>
                    <Button type="submit" tone="primary" disabled={busy}>
                      Verify email
                    </Button>
                  </form>
                )}
              </div>
            )}
            {plaidOpen && !plaidRestricted && status?.configured && (
              <div className="plaid-product-choice">
                <Field label="What would you like to connect?">
                  <Picker
                    label="Plaid account connection"
                    value={mode}
                    onChange={(value) => setMode(value as typeof mode)}
                    options={[
                      {
                        value: "transactions",
                        label: "Checking, savings and credit cards",
                      },
                      {
                        value: "investments",
                        label: "Retirement and brokerage",
                      },
                    ]}
                  />
                </Field>
                {mode === "transactions" && importedHistory !== undefined && (
                  <BankHistoryChoice
                    value={effectiveImportDate}
                    onChange={(value) => setImportFromDate(value ?? null)}
                    importedHistory={historyChoices}
                    maxDate={dayAfter(localDate())}
                    disabled={busy}
                  />
                )}
                <Button
                  tone="primary"
                  disabled={
                    busy ||
                    !!data.profile?.demo ||
                    publicDemo ||
                    (mode === "transactions" && importedHistory === undefined)
                  }
                  icon={
                    busy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <ArrowRight size={16} />
                    )
                  }
                  onClick={() => void begin()}
                >
                  {busy ? "Connecting…" : "Open Plaid"}
                </Button>
              </div>
            )}
            <p className="connect-scope">
              Read-only access. Choose the accounts to import before saving.
              Marten currently supports USD accounts.
            </p>
            {!plaidOpen && (
              <button className="text-button" onClick={() => setTab("manual")}>
                Prefer to enter your balance? Add manually
              </button>
            )}
          </div>
        ) : (
          <AccountForm onSaved={onClose} />
        )}
      </Modal>
      {open && bridge && (
        <SimpleFinFlow
          provider={bridge}
          onClose={() => setBridge(null)}
          onImported={() => {
            setBridge(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** Providers read as equal, parallel choices: icon, label with a one-line note, arrow. */
function ProviderChoice({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="connect-provider"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="connect-provider-icon">{icon}</span>
      <span className="connect-provider-text">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight size={17} className="connect-provider-arrow" />
    </button>
  );
}

const kinds = [
  { value: "cash", label: "Cash · checking & savings" },
  { value: "credit", label: "Credit card" },
  { value: "investment", label: "Retirement & brokerage" },
  { value: "loan", label: "Loan or mortgage" },
  { value: "asset", label: "Property or other asset" },
];
export function AccountForm({
  account,
  onSaved,
}: {
  account?: Doc<"accounts">;
  onSaved: () => void;
}) {
  const save = useMutation(api.workspace.saveAccount),
    { busy, run } = useTask();
  const [name, setName] = useState(account?.name ?? ""),
    [institution, setInstitution] = useState(account?.institution ?? ""),
    [kind, setKind] = useState<Doc<"accounts">["kind"]>(
      account?.kind ?? "cash",
    ),
    [subtype, setSubtype] = useState(account?.subtype ?? "checking"),
    [balance, setBalance] = useState(
      account ? (account.balanceCents / 100).toFixed(2) : "",
    ),
    [mask, setMask] = useState(account?.mask ?? ""),
    [apy, setApy] = useState(account?.apy?.toString() ?? ""),
    [hidden, setHidden] = useState(account?.hidden ?? false),
    [excluded, setExcluded] = useState(account?.excludeNetWorth ?? false),
    [closed, setClosed] = useState(account?.closed ?? false),
    [paymentPlan, setPaymentPlan] = useState<"statement" | "minimum">(
      account?.paymentPlan ?? "statement",
    );
  const bankManaged = !!account && !account.manual;
  // SimpleFIN never says what kind of account it sent, so the owner can correct it.
  const editableSimplefinType =
    !!account?.simplefinConnectionId && account.kind !== "asset";
  const isDebt = (value: Doc<"accounts">["kind"]) =>
    value === "credit" || value === "loan";
  // Debt is stored as the amount owed, so a corrected type mirrors the balance.
  const mirroredBalance =
    !!account && editableSimplefinType && isDebt(kind) !== isDebt(account.kind);
  const shownBalance = mirroredBalance
    ? (-account.balanceCents / 100).toFixed(2)
    : balance;
  const subtypeOptions =
    kind === "cash"
      ? [
          { value: "checking", label: "Checking" },
          { value: "savings", label: "Savings" },
          { value: "cash", label: "Cash" },
        ]
      : kind === "investment"
        ? [
            { value: "ira", label: "IRA" },
            { value: "401k", label: "401(k)" },
            { value: "brokerage", label: "Brokerage" },
            { value: "other", label: "Other" },
          ]
        : kind === "credit"
          ? [
              { value: "credit card", label: "Credit card" },
              { value: "charge card", label: "Charge card" },
            ]
          : kind === "loan"
            ? [
                { value: "mortgage", label: "Mortgage" },
                { value: "student", label: "Student loan" },
                { value: "auto", label: "Auto loan" },
                { value: "personal", label: "Personal loan" },
              ]
            : [
                { value: "property", label: "Real estate" },
                { value: "vehicle", label: "Vehicle" },
                { value: "other", label: "Other asset" },
              ];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(
      async () => {
        await save({
          ...(account ? { id: account._id } : {}),
          name,
          institution: institution.trim() || "Manual",
          mask,
          kind,
          subtype,
          // A bank-managed balance is sent back unchanged; the server mirrors it for a type correction.
          balanceCents: bankManaged
            ? account.balanceCents
            : parseMoney(balance),
          currency: "USD",
          hidden,
          excludeNetWorth: excluded,
          closed,
          ...(apy ? { apy: Number(apy) } : {}),
          ...(kind === "credit" || kind === "loan" ? { paymentPlan } : {}),
          ...(account?.availableCents !== undefined
            ? { availableCents: account.availableCents }
            : {}),
          ...(account?.limitCents !== undefined
            ? { limitCents: account.limitCents }
            : {}),
          ...(account?.statementCents !== undefined
            ? { statementCents: account.statementCents }
            : {}),
          ...(account?.minimumCents !== undefined
            ? { minimumCents: account.minimumCents }
            : {}),
          ...(account?.dueDate ? { dueDate: account.dueDate } : {}),
          ...(account?.statementDate
            ? { statementDate: account.statementDate }
            : {}),
        });
      },
      account ? "Account updated" : "Account added",
    );
    if (ok) onSaved();
  }
  return (
    <form className="account-form" onSubmit={(event) => void submit(event)}>
      {!account && (
        <p className="muted">
          Track cash, property, or an account you update yourself.
        </p>
      )}
      <Field label="Account name">
        <input
          aria-label="Account name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Everyday checking"
          autoFocus
        />
      </Field>
      <div className="account-form-grid">
        <Field label="Institution">
          <input
            aria-label="Institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="e.g. Chase"
            disabled={bankManaged}
          />
        </Field>
        <Field label="Last digits (optional)">
          <input
            aria-label="Last digits"
            value={mask}
            onChange={(e) => setMask(e.target.value)}
            placeholder="1234"
            maxLength={8}
          />
        </Field>
      </div>
      {(!bankManaged || editableSimplefinType) && (
        <div className="account-form-grid">
          <Field label="Account type">
            <Picker
              label="Account type"
              value={kind}
              onChange={(v) => {
                const next = v as Doc<"accounts">["kind"];
                setKind(next);
                setSubtype(
                  next === "cash"
                    ? "checking"
                    : next === "credit"
                      ? "credit card"
                      : next === "investment"
                        ? "brokerage"
                        : next === "loan"
                          ? "personal"
                          : "other",
                );
              }}
              options={
                editableSimplefinType
                  ? kinds.filter((option) => option.value !== "asset")
                  : kinds
              }
            />
          </Field>
          <Field label="Subtype">
            <Picker
              label="Subtype"
              value={subtype}
              onChange={setSubtype}
              options={subtypeOptions}
            />
          </Field>
        </div>
      )}
      <div className="account-form-grid">
        <Field
          label={
            kind === "credit" || kind === "loan"
              ? "Amount owed"
              : "Current balance"
          }
          hint={
            kind === "credit" || kind === "loan"
              ? "Enter debt as a positive amount."
              : undefined
          }
        >
          <div className="money-input">
            <span>$</span>
            <AmountInput
              aria-label="Current balance"
              required
              inputMode="decimal"
              value={shownBalance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              disabled={bankManaged}
            />
            <small>USD</small>
          </div>
        </Field>
        {kind === "cash" && (
          <Field label="APY (optional)">
            <input
              aria-label="APY"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={apy}
              disabled={bankManaged}
              onChange={(e) => setApy(e.target.value)}
              placeholder="0.00%"
            />
          </Field>
        )}
      </div>
      {bankManaged && (
        <p className="account-notice">
          {mirroredBalance
            ? isDebt(kind)
              ? "Your connection supplies the balance. Saving shows it as an amount owed and updates its balance history to match."
              : "Your connection supplies the balance. Saving shows it as money you hold and updates its balance history to match."
            : editableSimplefinType
              ? "Your connection supplies the balance. You can correct the account type here."
              : "Your bank keeps the balance and account type up to date."}
        </p>
      )}
      {(kind === "credit" || kind === "loan") && (
        <Field
          label="Planned payment"
          hint="Shown as an upcoming payment on the dashboard when a statement is due."
        >
          <Picker
            label="Planned payment"
            value={paymentPlan}
            onChange={(value) =>
              setPaymentPlan(value as "statement" | "minimum")
            }
            options={[
              { value: "statement", label: "Pay the statement balance" },
              { value: "minimum", label: "Pay the minimum" },
            ]}
          />
        </Field>
      )}
      {account && (
        <div className="account-preferences">
          <Toggle
            checked={hidden}
            onChange={setHidden}
            label="Hide from account list"
            description="The balance still contributes to net worth."
          />
          <Toggle
            checked={excluded}
            onChange={setExcluded}
            label="Exclude from net worth"
            description="Keep the account without including its balance."
          />
          <Toggle
            checked={closed}
            onChange={setClosed}
            label="Account is closed"
            description="Keep its history and remove it from current totals."
          />
        </div>
      )}
      <div className="account-form-footer">
        <Button type="button" onClick={onSaved}>
          Cancel
        </Button>
        <Button
          type="submit"
          tone="primary"
          disabled={busy}
          icon={
            busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <WalletCards size={16} />
            )
          }
        >
          {busy ? "Saving…" : account ? "Save changes" : "Add account"}
        </Button>
      </div>
    </form>
  );
}
