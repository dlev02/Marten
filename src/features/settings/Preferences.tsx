import { useAmountsHidden, setAmountsHidden } from "../../lib/amountVisibility";
import { useState } from "react";
import { useSidebarLabels, setSidebarLabels } from "../../lib/sidebarLabels";
import { useMutation, useQuery } from "convex/react";
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
  Loading,
  Modal,
  Panel,
  Toggle,
  useTask,
} from "../../components/folio/ui";
export function Preferences() {
  const hideAmounts = useAmountsHidden();
  const sidebarLabels = useSidebarLabels();
  const data = useData(),
    task = useTask(),
    save = useMutation(api.workspace.saveProfile),
    clearSample = useMutation(api.workspace.clearSample),
    deleteAccount = useMutation(api.accountDeletion.deleteAccount),
    deletion = useQuery(api.accountDeletion.status, {}),
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
    [deleteEmail, setDeleteEmail] = useState("");
  // Guests explore with an anonymous sign-in; only real accounts can be deleted.
  const guest = isDemoSession() || !!deletion?.anonymous || !deletion?.email;
  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const deleteReady =
    deleteWord === "DELETE" &&
    !!deletion?.email &&
    normalizeEmail(deleteEmail) === normalizeEmail(deletion.email);
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
      <div id="delete-account" tabIndex={-1}>
        <Panel title="Delete account" className="settings-preference-panel">
          <p className="settings-helper">
            {guest
              ? "You are exploring Marten as a guest, so there is no account to delete. Exit the demo to leave."
              : deletion?.requestedAt
                ? "Your account is being deleted. This finishes in the background and you will be signed out."
                : "Permanently deletes your accounts, transactions, receipts, bank connections, and the sign-in itself. Plaid connections are revoked. SimpleFIN access continues in the bridge until you revoke it there."}
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
            revoked; SimpleFIN access continues in the bridge until you revoke
            it there.
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
