import { useAction, useMutation, useQuery } from "../../lib/convex";
import { useEffect, useState, type FormEvent } from "react";
import {
  Copy,
  ExternalLink,
  KeyRound,
  ShieldAlert,
  Trash2,
  Unplug,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Button,
  Empty,
  Field,
  InfoTip,
  Loading,
  Modal,
  Panel,
  Toggle,
  useTask,
} from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { useSiteToolStatus } from "../../lib/siteToolStatus";
import "../agents/agent-access.css";

/** Browsers can refuse clipboard access; say what to do instead of the raw error. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error("Couldn’t copy. Select the text and copy it yourself.");
  }
}

type Lifetime = "idle" | "fixed" | "untilRevoked";
type KeyLifetime = "30d" | "90d" | "1y" | "never";

const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});
/** Coarse "last used" wording; the server records use at most once an hour. */
function lastUsedLabel(lastUsedAt: number | undefined, now: number) {
  if (!lastUsedAt) return "Not used yet";
  const minutes = Math.round((now - lastUsedAt) / 60_000);
  if (minutes < 60) return "Used within the last hour";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last used ${relativeFormat.format(-hours, "hour")}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Last used ${relativeFormat.format(-days, "day")}`;
  return `Last used ${new Date(lastUsedAt).toLocaleDateString()}`;
}
function expiryLabel(lifetime: Lifetime, expiresAt: number) {
  const date = new Date(expiresAt).toLocaleDateString();
  if (lifetime === "untilRevoked") return "Until you disconnect it";
  if (lifetime === "idle")
    return `Stays connected while in use · ends ${date} if unused`;
  return `Expires ${date}`;
}
/** "update_transactions" → "Update transactions". */
function toolLabel(tool: string) {
  const words = tool.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function accessLabel(scopes: string[]) {
  return scopes.includes("finance:write") ? "Read and edit" : "Read only";
}

export function AgentSettings() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // `now` changes every minute, which starts a new subscription. Keep showing
  // the previous result meanwhile so the page does not flash to a loading
  // state and jump back to the top.
  const liveStatus = useQuery(api.agentAccess.status, { now });
  const [shownStatus, setShownStatus] = useState(liveStatus);
  if (liveStatus !== undefined && liveStatus !== shownStatus)
    setShownStatus(liveStatus);
  const status = liveStatus ?? shownStatus;
  const browser = useQuery(api.agentAccess.browserStatus, {});
  const setAccess = useMutation(api.agentAccess.setBrowserAccess);
  const revoke = useMutation(api.agentAccess.revoke);
  const siteTools = useSiteToolStatus();
  const task = useTask();
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{
    name: string;
    key: string;
  } | null>(null);
  const [revoking, setRevoking] = useState<{
    id: Id<"agentGrants">;
    name: string;
  } | null>(null);
  if (!status || !browser) return <Loading />;
  const live = <T extends { revokedAt?: number; expiresAt: number }>(
    rows: T[],
  ) => rows.filter((row) => !row.revokedAt && row.expiresAt > now);
  const grants = live(status.grants);
  const keys = live(status.keys);
  const createKeyButton = (
    <Button
      icon={<KeyRound size={14} />}
      disabled={!status.canEnable || task.busy}
      onClick={() => setCreating(true)}
    >
      Create key
    </Button>
  );
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>AI connections</h2>
          <p>Use an assistant you already have with your Marten workspace.</p>
        </div>
      </div>
      {!status.canEnable && (
        <p className="inline-notice agent-notice">
          Sign in to a personal workspace to enable agent access. Demo and
          sample data cannot be shared through these connections.
        </p>
      )}
      <Panel title="In your browser" className="agent-settings-panel">
        <p className="settings-helper">
          Let a compatible browser assistant read accounts, transactions,
          recurring items, reports, forecasts and credit scores while Marten is
          open.
        </p>
        <Toggle
          label="Browser agent access"
          description="Makes Marten’s tools available to assistants in a browser that supports WebMCP. Your assistant’s usual permissions still apply."
          checked={browser.enabled}
          disabled={!status.canEnable || task.busy}
          onChange={(enabled) =>
            void task.run(() =>
              setAccess({ enabled, allowEdits: enabled && browser.allowEdits }),
            )
          }
        />
        <Toggle
          label="Allow edits from your browser assistant"
          description="Allow transaction annotations, bulk recategorizing, merchant names and logos, categories, tags, rules, review and pending preferences, account display, manual account balances and statement dates, credit scores, recurring schedules and saved forecasts. Ask your assistant to review changes with you."
          checked={browser.allowEdits}
          disabled={!browser.enabled || task.busy}
          onChange={(allowEdits) =>
            void task.run(() => setAccess({ enabled: true, allowEdits }))
          }
        />
        <p
          className={`agent-support-status ${siteTools.error ? "warning" : ""}`}
          role="status"
        >
          {siteTools.error ??
            (!siteTools.supported
              ? "This browser does not expose WebMCP. The regular interface remains available to browser assistants."
              : siteTools.count
                ? `${siteTools.count} site tools are available in this tab.`
                : browser.enabled
                  ? "Registering site tools…"
                  : "This browser supports WebMCP. Turn on access when you are ready.")}
        </p>
      </Panel>
      <div id="remote-mcp" tabIndex={-1} className="settings-preference-anchor">
        <Panel title="In your AI app" className="agent-settings-panel">
          <p className="settings-helper">
            Connect an MCP-compatible assistant to use Marten without keeping a
            browser tab open, including scheduled tasks. You approve each
            connection here; read access is the default. No model API key is
            needed in Marten.
          </p>
          <div className="agent-server-address">
            <code>{status.mcpUrl}</code>
            <Button
              icon={<Copy size={14} />}
              onClick={() =>
                void task.run(
                  () => copyText(status.mcpUrl),
                  "MCP address copied",
                )
              }
            >
              Copy
            </Button>
          </div>
          {!status.remoteReady && (
            <p className="inline-notice agent-notice">
              Remote setup needs Marten hosted at an HTTPS address. The
              deployment’s app address must point to that site before a
              connection from ChatGPT, Claude or another assistant can finish.
            </p>
          )}
          <ol className="agent-setup-steps">
            <li>
              Open your assistant’s app or connector settings and add a custom
              MCP connection.
            </li>
            <li>
              Paste the server address above and choose OAuth. If asked for a
              client ID, use <code>marten-chatgpt</code> for ChatGPT or{" "}
              <code>marten-claude</code> for Claude. Other assistants, such as
              Grok, register themselves. No client secret is used.
            </li>
            <li>
              Sign in to Marten and review the request. Start with read access,
              and choose how long access lasts.
            </li>
          </ol>
          <p className="agent-client-note">
            Custom connections depend on your assistant’s plan and client
            support.{" "}
            <a
              href="https://help.openai.com/en/articles/11487775-connectors-in-chatgpt"
              target="_blank"
              rel="noreferrer"
            >
              ChatGPT setup <ExternalLink size={12} />
            </a>{" "}
            <a
              href="https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp"
              target="_blank"
              rel="noreferrer"
            >
              Claude setup <ExternalLink size={12} />
            </a>
          </p>
          <div className="agent-grants">
            <h3>Connected assistants</h3>
            {!grants.length ? (
              <p>No assistants connected yet.</p>
            ) : (
              grants.map((grant) => (
                <div className="agent-grant" key={grant._id}>
                  <div>
                    <strong>
                      {grant.clientName}
                      {grant.trust === "unverified" && (
                        <span className="agent-trust-badge">
                          <ShieldAlert size={12} aria-hidden="true" />
                          Unverified app
                        </span>
                      )}
                    </strong>
                    <span>
                      {accessLabel(grant.scopes)} ·{" "}
                      {lastUsedLabel(grant.lastUsedAt, now)}
                    </span>
                    <span>{expiryLabel(grant.lifetime, grant.expiresAt)}</span>
                  </div>
                  <Button
                    icon={<Unplug size={14} />}
                    disabled={task.busy}
                    onClick={() =>
                      void task.run(
                        () => revoke({ id: grant._id }),
                        "Assistant disconnected",
                      )
                    }
                  >
                    Disconnect
                  </Button>
                </div>
              ))
            )}
          </div>
          {!status.grantsComplete && (
            <p className="settings-helper">
              Only the 100 most recent connections are shown.
            </p>
          )}
        </Panel>
      </div>
      <div
        id="access-keys"
        tabIndex={-1}
        className="settings-preference-anchor"
      >
        <Panel
          title={
            <>
              Access keys{" "}
              <InfoTip
                disclosure
                label="About access keys"
                text="For assistants that call Marten with a saved key instead of signing in, such as Meta Muse custom connectors. Use the MCP address above as the server and send the key as a bearer token. A key gets the same checks, limits and activity record as a connected assistant. Marten keeps only a fingerprint of the key, so it is shown once."
              />
            </>
          }
          action={keys.length ? createKeyButton : undefined}
          className="agent-settings-panel"
        >
          {!keys.length ? (
            <Empty
              icon={<KeyRound size={20} />}
              title="No access keys"
              description="Create a key for an assistant that can’t sign in to Marten. You’ll see the key once, then only its name here."
              action={createKeyButton}
            />
          ) : (
            <div className="agent-keys">
              {keys.map((key) => (
                <div className="agent-grant" key={key._id}>
                  <div>
                    <strong>{key.clientName}</strong>
                    <span>
                      {accessLabel(key.scopes)} ·{" "}
                      {lastUsedLabel(key.lastUsedAt, now)}
                    </span>
                    <span>{expiryLabel(key.lifetime, key.expiresAt)}</span>
                  </div>
                  <Button
                    tone="danger"
                    icon={<Trash2 size={14} />}
                    disabled={task.busy}
                    onClick={() =>
                      setRevoking({ id: key._id, name: key.clientName })
                    }
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <div
        id="agent-activity"
        tabIndex={-1}
        className="settings-preference-anchor"
      >
        <Panel title="Recent agent activity" className="agent-settings-panel">
          <p className="settings-helper">
            Each call is recorded with the connection and time, and each change
            with what it edited, including the values before and after.
            Conversation text is never stored. Activity is kept for 90 days.
          </p>
          {!status.activity.length ? (
            <p className="agent-activity-empty">No agent activity yet.</p>
          ) : (
            <ul className="agent-activity">
              {status.activity.map((event) => (
                <li key={event._id}>
                  <div>
                    {/* A write's summary says what changed; reads show the tool. */}
                    <strong>{event.summary ?? toolLabel(event.tool)}</strong>
                    <span>
                      {event.source === "mcp"
                        ? (event.connection ?? "Connected assistant")
                        : "Browser assistant"}{" "}
                      ·{" "}
                      {event.summary
                        ? toolLabel(event.tool).toLowerCase()
                        : event.success
                          ? event.readOnly
                            ? "Read"
                            : "Updated"
                          : "Unsuccessful"}
                    </span>
                  </div>
                  <time dateTime={new Date(event.createdAt).toISOString()}>
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <CreateKeyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          setRevealed(created);
        }}
      />
      <Modal
        open={Boolean(revealed)}
        onClose={() => setRevealed(null)}
        title="Copy your access key"
      >
        {revealed && (
          <RevealedKey
            name={revealed.name}
            accessKey={revealed.key}
            mcpUrl={status.mcpUrl}
            onDone={() => setRevealed(null)}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        title="Revoke this access key?"
      >
        <p className="agent-modal-text">
          {revoking?.name} will stop working right away. Any assistant using it
          will need a new key.
        </p>
        <div className="modal-actions">
          <Button onClick={() => setRevoking(null)}>Cancel</Button>
          <Button
            tone="danger"
            disabled={task.busy}
            onClick={() =>
              revoking &&
              void task.run(async () => {
                await revoke({ id: revoking.id });
                setRevoking(null);
              }, "Access key revoked")
            }
          >
            Revoke key
          </Button>
        </div>
      </Modal>
    </>
  );
}

const keyLifetimeOptions: { value: KeyLifetime; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Until I revoke it" },
];

function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: { name: string; key: string }) => void;
}) {
  const create = useAction(api.agentAccess.createAccessKey);
  const task = useTask();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"read" | "edit">("read");
  const [lifetime, setLifetime] = useState<KeyLifetime>("90d");
  const close = () => {
    setName("");
    setAccess("read");
    setLifetime("90d");
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void task.run(async () => {
      const result = await create({
        name,
        allowEdits: access === "edit",
        lifetime,
      });
      const created = { name: name.trim(), key: result.key };
      setName("");
      setAccess("read");
      setLifetime("90d");
      onCreated(created);
    });
  };
  return (
    <Modal open={open} onClose={close} title="Create access key">
      <form className="form-stack" onSubmit={submit}>
        <Field
          label="Name"
          hint="So you can recognize it later, like “Meta Muse”."
        >
          <input
            aria-label="Key name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field
          label="Access"
          hint={
            access === "edit"
              ? "Can also change annotations, categories, merchants, tags, rules, recurring schedules, saved forecasts, manual account balances and credit scores. It can’t move money or delete transactions or accounts."
              : "Can read your finances. It can’t change anything."
          }
        >
          <Select
            aria-label="Access"
            value={access}
            onValueChange={(value) => setAccess(value as "read" | "edit")}
            options={[
              { value: "read", label: "Read only" },
              { value: "edit", label: "Read and edit" },
            ]}
          />
        </Field>
        <Field label="Expires">
          <Select
            aria-label="Expires"
            value={lifetime}
            onValueChange={(value) => setLifetime(value as KeyLifetime)}
            options={keyLifetimeOptions}
          />
        </Field>
        <div className="modal-actions">
          <Button onClick={close}>Cancel</Button>
          <Button
            tone="primary"
            type="submit"
            disabled={task.busy || !name.trim()}
          >
            {task.busy ? "Creating…" : "Create key"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RevealedKey({
  name,
  accessKey,
  mcpUrl,
  onDone,
}: {
  name: string;
  accessKey: string;
  mcpUrl: string;
  onDone: () => void;
}) {
  const task = useTask();
  return (
    <div className="agent-revealed-key">
      <p className="agent-modal-text">
        This is the only time Marten shows the key for {name}. Save it in your
        assistant’s connector settings now.
      </p>
      <div className="agent-server-address">
        <code>{accessKey}</code>
        <Button
          icon={<Copy size={14} />}
          onClick={() =>
            void task.run(() => copyText(accessKey), "Access key copied")
          }
        >
          Copy
        </Button>
      </div>
      <dl className="agent-key-usage">
        <dt>Server</dt>
        <dd>
          <code>{mcpUrl}</code>
        </dd>
        <dt>Header</dt>
        <dd>
          <code>Authorization: Bearer {"<key>"}</code>
        </dd>
      </dl>
      <div className="modal-actions">
        <Button tone="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
