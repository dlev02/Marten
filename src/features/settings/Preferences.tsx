import { defaultCharts } from "../../../convex/lib/chartDefaults";
import type { Infer } from "convex/values";
import type { chartDefaults } from "../../../convex/lib/chartDefaults";
import { useAmountsHidden, setAmountsHidden } from "../../lib/amountVisibility";
import { useState } from "react";
import { useSidebarLabels, setSidebarLabels } from "../../lib/sidebarLabels";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTheme } from "next-themes";
import { AlertTriangle } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useData } from "../../lib/data";
import { isDemoSession } from "../../lib/demo";
import {
  applyFont,
  readFont,
  transitionAppearance,
  type AppFont,
  applyCategoryIconStyle,
  readCategoryIconStyle,
  type CategoryIconStyle,
} from "../../lib/appearance";
import { CategoryIcon } from "../../components/folio/CategoryIcon";
import { ProfileSettings } from "./ProfileSettings";
import { ReminderSettings } from "./ReminderSettings";
import { Select } from "../../components/folio/Select";
import {
  Button,
  Field,
  InfoTip,
  Loading,
  Modal,
  Panel,
  Toggle,
  useTask,
  useToast,
} from "../../components/folio/ui";
export function Preferences() {
  const hideAmounts = useAmountsHidden();
  const sidebarLabels = useSidebarLabels();
  const data = useData(),
    task = useTask(),
    save = useMutation(api.workspace.saveProfile),
    clearSample = useMutation(api.workspace.clearSample),
    clearWorkspace = useMutation(api.workspace.clearWorkspace),
    removeInvestmentActivity = useMutation(
      api.transactions.removeInvestmentActivity,
    ),
    importInvestmentActivity = useAction(api.simplefin.importAccounts),
    investment = useQuery(api.transactions.investmentActivity, {}),
    deleteAccount = useMutation(api.accountDeletion.deleteAccount),
    deletion = useQuery(api.accountDeletion.status, {}),
    toast = useToast(),
    navigate = useNavigate(),
    { signOut } = useAuthActions(),
    { theme, setTheme } = useTheme();
  const [font, setFont] = useState(readFont),
    [iconStyle, setIconStyle] = useState(readCategoryIconStyle),
    [confirm, setConfirm] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [clearing, setClearing] = useState(false),
    [deleted, setDeleted] = useState(0),
    [confirmDelete, setConfirmDelete] = useState(false),
    [deleteWord, setDeleteWord] = useState(""),
    [deleteEmail, setDeleteEmail] = useState(""),
    [confirmClear, setConfirmClear] = useState(false),
    [clearWord, setClearWord] = useState(""),
    [clearingAll, setClearingAll] = useState(false),
    [clearedCount, setClearedCount] = useState(0),
    [confirmRemove, setConfirmRemove] = useState(false),
    [removing, setRemoving] = useState(false),
    [removedCount, setRemovedCount] = useState(0);
  // Guests explore with an anonymous sign-in; only real accounts can be deleted.
  const guest = isDemoSession() || !!deletion?.anonymous || !deletion?.email;
  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const deleteReady =
    deleteWord === "DELETE" &&
    !!deletion?.email &&
    normalizeEmail(deleteEmail) === normalizeEmail(deletion.email);
  const investmentActivity = data.profile?.investmentActivity ?? false;
  // Investment accounts the bridge already serves; a backfill re-reads them
  // from their import start date once the preference is switched on.
  const bridgedInvestmentAccounts = data.accounts.filter(
    (account) =>
      account.kind === "investment" &&
      !!account.simplefinConnectionId &&
      !!account.simplefinAccountId &&
      !account.closed,
  );
  const importedInvestmentRows = investment?.count ?? 0;
  const importedInvestmentLabel = investment?.capped
    ? "More than 500"
    : importedInvestmentRows.toLocaleString();
  async function runInBatches(
    step: () => Promise<{ done: boolean; deleted?: number; removed?: number }>,
    onProgress: (total: number) => void,
  ) {
    let done = false,
      total = 0;
    while (!done) {
      const result = await step();
      done = result.done;
      total += result.deleted ?? result.removed ?? 0;
      onProgress(total);
    }
  }
  function backfillInvestmentActivity() {
    const fromDate = bridgedInvestmentAccounts
      .map((account) => account.simplefinImportFromDate ?? "")
      .filter(Boolean)
      .sort()[0];
    void task.run(async () => {
      let imported = 0;
      for (const provider of ["simplefin", "lunchflow"] as const) {
        const accounts = bridgedInvestmentAccounts.filter(
          (account) => (account.bankProvider ?? "simplefin") === provider,
        );
        if (!accounts.length) continue;
        const result = await importInvestmentActivity({
          provider,
          fromDate:
            fromDate ??
            new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
          accounts: accounts.map((account) => ({
            externalAccountId: account.simplefinAccountId!,
            targetAccountId: account._id,
            kind: account.kind,
          })),
        });
        imported += result.imported;
      }
      toast(
        imported
          ? `${imported.toLocaleString()} investment transactions imported.`
          : "Your connections had no new investment activity for those accounts.",
      );
    });
  }
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>Preferences</h2>
          <p>Make Marten feel like your own.</p>
        </div>
      </div>
      <div id="profile" tabIndex={-1}>
        <ProfileSettings />
      </div>
      <div id="appearance" tabIndex={-1}>
        <Panel title="Appearance" className="settings-preference-panel">
          <Toggle
            label="Collapsed sidebar labels"
            description="Show the page name on hover or keyboard focus when the sidebar is collapsed. Saved on this device."
            checked={sidebarLabels}
            onChange={setSidebarLabels}
          />
          <Field label="Theme">
            <Select
              aria-label="Appearance theme"
              value={theme ?? "system"}
              onValueChange={(value) =>
                transitionAppearance(() => setTheme(value), "theme")
              }
              options={[
                { value: "system", label: "Match system" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Field>
          <Field label="Font" hint="Saved on this device.">
            <Select
              aria-label="Interface font"
              value={font}
              onValueChange={(value) => {
                const selected = value as AppFont;
                setFont(selected);
                applyFont(selected);
              }}
              options={[
                { value: "folio", label: "Marten · DM Sans" },
                { value: "system", label: "System font" },
              ]}
            />
          </Field>
          <Field
            label="Category icons"
            hint="Saved on this device. Custom emoji keep their original appearance."
          >
            <Select
              aria-label="Category icon style"
              value={iconStyle}
              onValueChange={(value) => {
                const style = value as CategoryIconStyle;
                setIconStyle(style);
                applyCategoryIconStyle(style);
              }}
              options={[
                { value: "illustrated", label: "Illustrated · Marten" },
                { value: "system", label: "System emoji" },
              ]}
            />
            <div className="category-icon-preview" aria-hidden="true">
              {["🏡", "🥑", "☕", "🌱", "✈️", "🎁"].map((emoji) => (
                <CategoryIcon key={emoji} emoji={emoji} />
              ))}
            </div>
          </Field>
        </Panel>
      </div>
      <div id="privacy" tabIndex={-1}>
        <Panel title="Privacy" className="settings-preference-panel">
          <Toggle
            label="Hide amounts"
            description="Replace balances, transaction amounts, investment values and cost basis with ••••. Merchants and chart shapes stay visible. Saved on this device."
            checked={hideAmounts}
            onChange={setAmountsHidden}
          />
          <p className="settings-helper">
            Turn this off to edit amounts. Receipts, notes and statement text
            are not redacted. Exports and connected assistants keep the original
            information.
          </p>
        </Panel>
      </div>
      <div
        id="chart-defaults"
        tabIndex={-1}
        className="settings-preference-anchor"
      >
        <Panel
          title="Default charts"
          className="settings-preference-panel"
          action={
            <InfoTip
              disclosure
              label="About default charts"
              text="Choose how each view opens. You can still switch charts while exploring; saved reports keep their own chart."
            />
          }
        >
          {(["spending", "income", "cashflow"] as const).map((kind) => (
            <Field
              key={kind}
              label={
                kind === "cashflow"
                  ? "Cash flow"
                  : kind === "income"
                    ? "Income"
                    : "Spending"
              }
            >
              <Select
                aria-label={`Default ${kind === "cashflow" ? "cash flow" : kind} chart`}
                value={(data.profile?.chartDefaults ?? defaultCharts)[kind]}
                disabled={task.busy}
                onValueChange={(value) =>
                  void task.run(
                    () =>
                      save({
                        chartDefaults: {
                          ...(data.profile?.chartDefaults ?? defaultCharts),
                          [kind]: value,
                        } as Infer<typeof chartDefaults>,
                      }),
                    "Default chart saved",
                  )
                }
                options={[
                  { value: "bar", label: "Trend bars" },
                  { value: "donut", label: "Pie chart" },
                  { value: "treemap", label: "Treemap" },
                  ...(kind === "cashflow"
                    ? [{ value: "sankey", label: "Sankey" }]
                    : []),
                ]}
              />
            </Field>
          ))}
        </Panel>
      </div>
      <div id="transaction-preferences" tabIndex={-1}>
        <Panel title="Transactions" className="settings-preference-panel">
          <Toggle
            label="Review new transactions"
            description="New bank transactions arrive unreviewed so you can check their categories."
            checked={data.profile?.reviewNew ?? true}
            onChange={(reviewNew) => void task.run(() => save({ reviewNew }))}
          />
          <Toggle
            label="Edit pending transactions"
            description="Allow changes before transactions post. Pending amounts stay out of cash flow and reports."
            checked={data.profile?.allowPending ?? false}
            onChange={(allowPending) =>
              void task.run(() => save({ allowPending }))
            }
          />
          <Toggle
            label="Investment account activity"
            description="Bring trades, dividends and cash sweeps from brokerage and retirement accounts into Transactions. Off keeps those accounts to balances and holdings, so buying shares never counts as spending or clutters Merchants."
            checked={investmentActivity}
            disabled={task.busy}
            onChange={(value) =>
              void task.run(() => save({ investmentActivity: value }))
            }
          />
          {!investmentActivity && importedInvestmentRows > 0 && (
            <div className="settings-inline-note">
              <p>
                {importedInvestmentLabel} imported investment transactions are
                still in your history, reports and merchant list.
              </p>
              <Button
                type="button"
                disabled={task.busy}
                onClick={() => setConfirmRemove(true)}
              >
                Remove them
              </Button>
            </div>
          )}
          {investmentActivity && bridgedInvestmentAccounts.length > 0 && (
            <div className="settings-inline-note">
              <p>
                Daily imports include investment activity from now on. Fetch
                what your connections already hold for{" "}
                {bridgedInvestmentAccounts.length === 1
                  ? "your investment account"
                  : `${bridgedInvestmentAccounts.length} investment accounts`}
                , back to the import start date.
              </p>
              <Button
                type="button"
                disabled={task.busy}
                onClick={backfillInvestmentActivity}
              >
                {task.busy ? "Importing…" : "Import past activity"}
              </Button>
            </div>
          )}
        </Panel>
      </div>
      <ReminderSettings />
      {data.profile?.demo && (
        <div id="sample-workspace" tabIndex={-1}>
          <Panel title="Sample workspace" className="settings-preference-panel">
            <p className="settings-helper">
              {isDemoSession()
                ? "You are exploring fictional accounts and transactions. Exit demo and sign in to set up your own finances."
                : "You are exploring fictional accounts and transactions. Clear this workspace when you are ready to connect your own accounts."}
            </p>
            {!isDemoSession() && (
              <Button
                tone="danger"
                onClick={() => {
                  setAcknowledged(false);
                  setConfirm(true);
                }}
              >
                Clear sample workspace
              </Button>
            )}
          </Panel>
        </div>
      )}
      <div id="clear-data" tabIndex={-1}>
        <Panel title="Start fresh" className="settings-preference-panel">
          <p className="settings-helper">
            {guest
              ? "Exit the demo and sign in to manage your own data."
              : "Clears every account, transaction, receipt, category, merchant, rule, tag, recurring item, report, credit score, forecast and bank connection, then restores the default categories. Your sign-in, name, photo and preferences stay, so you can import again from a clean slate."}
          </p>
          {!guest && !deletion?.requestedAt && (
            <Button
              tone="danger"
              onClick={() => {
                setClearWord("");
                setClearedCount(0);
                setConfirmClear(true);
              }}
            >
              Clear all data
            </Button>
          )}
        </Panel>
      </div>
      <div id="delete-account" tabIndex={-1}>
        <Panel title="Delete account" className="settings-preference-panel">
          <p className="settings-helper">
            {guest
              ? "You are exploring Marten as a guest, so there is no account to delete. Exit the demo to leave."
              : deletion?.requestedAt
                ? "Your account is being deleted. This finishes in the background and you will be signed out."
                : "Permanently deletes your accounts, transactions, receipts, bank connections, and the sign-in itself. Plaid connections are revoked. Revoke SimpleFIN and Lunch Flow access in those services separately."}
          </p>
          {!guest && !deletion?.requestedAt && (
            <Button
              tone="danger"
              onClick={() => {
                setDeleteWord("");
                setDeleteEmail("");
                setConfirmDelete(true);
              }}
            >
              Delete account
            </Button>
          )}
        </Panel>
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => !task.busy && setConfirmDelete(false)}
        title="Delete your account?"
        description="Everything Marten stores for you is erased and cannot be restored. You will be signed out as soon as deletion starts."
      >
        <div className="settings-warning">
          <AlertTriangle size={18} />
          <p>
            Accounts, transactions, receipts, categories, rules, tags, recurring
            items, reports, credit scores, forecasts, reminders, assistant
            connections, and bank connections are all deleted. Plaid access is
            revoked; revoke SimpleFIN and Lunch Flow access in those services
            separately.
          </p>
        </div>
        <form
          className="settings-delete-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!deleteReady) return;
            void task.run(async () => {
              await deleteAccount({
                confirmation: deleteWord,
                email: deleteEmail,
              });
              await signOut();
              window.location.assign("/");
            });
          }}
        >
          <Field label="Type DELETE to confirm">
            <input
              aria-label="Type DELETE to confirm"
              autoComplete="off"
              spellCheck={false}
              placeholder="DELETE"
              value={deleteWord}
              onChange={(event) => setDeleteWord(event.target.value)}
            />
          </Field>
          <Field
            label="Your sign-in email"
            hint={
              deletion?.email
                ? `You are signed in as ${deletion.email}.`
                : undefined
            }
          >
            <input
              type="email"
              aria-label="Your sign-in email"
              autoComplete="email"
              value={deleteEmail}
              onChange={(event) => setDeleteEmail(event.target.value)}
            />
          </Field>
          <div className="settings-dialog-actions">
            <Button
              type="button"
              disabled={task.busy}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              tone="danger"
              disabled={!deleteReady || task.busy}
            >
              {task.busy ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={confirmClear}
        onClose={() => !clearingAll && setConfirmClear(false)}
        title={clearingAll ? "Clearing your data" : "Clear all data?"}
        description={
          clearingAll
            ? "Keep this tab open while Marten removes everything. Accounts opens when it finishes."
            : "Everything you entered or imported is removed and cannot be restored. You stay signed in with the default categories ready for a new import."
        }
      >
        {clearingAll ? (
          <Loading text={`${clearedCount.toLocaleString()} items removed…`} />
        ) : (
          <>
            <div className="settings-warning">
              <AlertTriangle size={18} />
              <p>
                Accounts, transactions, receipts, categories, merchants, rules,
                tags, recurring items, reports, credit scores, forecasts and
                bank connections are all deleted. Plaid access is revoked;
                revoke SimpleFIN and Lunch Flow access in those services
                separately. Reminder, appearance and assistant settings are
                kept.
              </p>
            </div>
            <form
              className="settings-delete-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (clearWord !== "CLEAR") return;
                void task.run(async () => {
                  setClearingAll(true);
                  try {
                    await runInBatches(
                      () => clearWorkspace({ confirmation: clearWord }),
                      setClearedCount,
                    );
                    setConfirmClear(false);
                    toast(
                      "Your data is cleared. Add or import accounts to begin again.",
                    );
                    void navigate("/accounts");
                  } finally {
                    setClearingAll(false);
                  }
                });
              }}
            >
              <Field label="Type CLEAR to confirm">
                <input
                  aria-label="Type CLEAR to confirm"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="CLEAR"
                  value={clearWord}
                  onChange={(event) => setClearWord(event.target.value)}
                />
              </Field>
              <div className="settings-dialog-actions">
                <Button
                  type="button"
                  disabled={task.busy}
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  tone="danger"
                  disabled={clearWord !== "CLEAR" || task.busy}
                >
                  Clear all data
                </Button>
              </div>
            </form>
          </>
        )}
      </Modal>
      <Modal
        open={confirmRemove}
        onClose={() => !removing && setConfirmRemove(false)}
        title={
          removing
            ? "Removing investment activity"
            : "Remove imported investment activity?"
        }
        description={
          removing
            ? "Keep this tab open while the imported rows are removed."
            : "Trades, dividends and sweeps that a bank import placed in your investment accounts are deleted, along with merchants that only existed for them. Manual and spreadsheet rows stay. Turning the preference back on and importing brings the activity back."
        }
      >
        {removing ? (
          <Loading
            text={`${removedCount.toLocaleString()} transactions removed…`}
          />
        ) : (
          <div className="settings-dialog-actions">
            <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  setRemoving(true);
                  setRemovedCount(0);
                  try {
                    await runInBatches(
                      () => removeInvestmentActivity({}),
                      setRemovedCount,
                    );
                    setConfirmRemove(false);
                  } finally {
                    setRemoving(false);
                  }
                }, "Investment activity removed")
              }
            >
              Remove activity
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        open={confirm}
        onClose={() => !clearing && setConfirm(false)}
        title={
          clearing
            ? "Clearing sample workspace"
            : "Clear this sample workspace?"
        }
        description={
          clearing
            ? "Keep this tab open while Marten removes the sample workspace. You will return to account setup when it finishes."
            : "This deletes all accounts, transactions, receipts, rules, categories, tags, recurring items, and reports in this sample workspace, including anything you added or edited while exploring."
        }
      >
        {clearing ? (
          <Loading text={`${deleted.toLocaleString()} items removed…`} />
        ) : (
          <>
            <div className="settings-warning">
              <AlertTriangle size={18} />
              <p>
                Your sign-in stays active. The workspace data cannot be restored
                automatically.
              </p>
            </div>
            <label className="settings-acknowledge">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              I understand that my additions to this sample workspace will also
              be deleted.
            </label>
            <div className="settings-dialog-actions">
              <Button onClick={() => setConfirm(false)}>Cancel</Button>
              <Button
                tone="danger"
                disabled={!acknowledged || task.busy}
                onClick={() =>
                  void task.run(async () => {
                    setClearing(true);
                    try {
                      let done = false,
                        total = 0;
                      while (!done) {
                        const result = await clearSample({});
                        done = result.done;
                        total += result.deleted;
                        setDeleted(total);
                      }
                      setConfirm(false);
                    } finally {
                      setClearing(false);
                    }
                  })
                }
              >
                Clear workspace
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
