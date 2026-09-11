import { useState } from "react";
import { useMutation } from "convex/react";
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
} from "../../lib/appearance";
import { ProfileSettings } from "./ProfileSettings";
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
  const data = useData(),
    task = useTask(),
    save = useMutation(api.workspace.saveProfile),
    clearSample = useMutation(api.workspace.clearSample),
    { theme, setTheme } = useTheme();
  const [font, setFont] = useState(readFont),
    [confirm, setConfirm] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [clearing, setClearing] = useState(false),
    [deleted, setDeleted] = useState(0);
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
