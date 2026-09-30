import { useAction, useMutation, useQuery } from "../../lib/convex";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Plug,
  ShieldAlert,
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
import { agentScopeCopy } from "../agents/agentScopes";
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
  return `Last used ${dayFormat.format(new Date(lastUsedAt))}`;
}
const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const activityFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
function expiryLabel(lifetime: Lifetime, expiresAt: number) {
  const date = dayFormat.format(new Date(expiresAt));
  if (lifetime === "untilRevoked") return "No expiry";
  if (lifetime === "idle") return `Ends ${date} if unused`;
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

/**
 * Copy with feedback on the button itself ("Copied" for two seconds), the
 * shared pattern for the server address and a newly created key. A blocked
 * clipboard reports how to copy by hand.
 */
function useCopy() {
  const task = useTask();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return {
    copied,
    copy: (text: string) =>
      void task.run(async () => {
        await copyText(text);
        setCopied(true);
      }),
  };
}
function CopyLabel({
  copied,
  label = "Copy",
}: {
  copied: boolean;
  label?: string;
}) {
  return <span aria-live="polite">{copied ? "Copied" : label}</span>;
}
function copyIcon(copied: boolean) {
  return copied ? <Check size={14} /> : <Copy size={14} />;
}

/** A read-only value with its Copy action beside it, never inside it. */
function CopyField({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="agent-copy-field">
      <input
        readOnly
        aria-label={label}
        value={value}
        spellCheck={false}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button
        className="agent-copy-action"
        icon={copyIcon(copied)}
        onClick={() => copy(value)}
      >
        <CopyLabel copied={copied} />
      </Button>
    </div>
  );
}

type Confirming = {
  kind: "grant" | "key";
  id: Id<"agentGrants">;
  name: string;
};

/** One row per connection or key: name, access and use, expiry, action. */
function CredentialRow({
  name,
  unverified = false,
  scopes,
  lastUsedAt,
  lifetime,
  expiresAt,
  now,
  action,
}: {
  name: string;
  unverified?: boolean;
  scopes: string[];
  lastUsedAt?: number;
  lifetime: Lifetime;
  expiresAt: number;
  now: number;
  action: ReactNode;
}) {
  return (
    <div className="agent-grant">
      <div>
        <strong>
          {name}
          {unverified && (
            <span className="agent-trust-badge">
              <ShieldAlert size={12} aria-hidden="true" />
              Unverified
            </span>
          )}
        </strong>
        <span>
          {accessLabel(scopes)} · {lastUsedLabel(lastUsedAt, now)} ·{" "}
          {expiryLabel(lifetime, expiresAt)}
        </span>
      </div>
      {action}
    </div>
  );
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
  const [confirming, setConfirming] = useState<Confirming | null>(null);
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
          Let a browser assistant use Marten while this tab is open.
        </p>
        <Toggle
          label="Browser agent access"
          description="For browsers that support WebMCP. Your assistant’s own permissions still apply."
          checked={browser.enabled}
          disabled={!status.canEnable || task.busy}
          onChange={(enabled) =>
            void task.run(() =>
              setAccess({ enabled, allowEdits: enabled && browser.allowEdits }),
            )
          }
        />
        <Toggle
          label="Allow edits"
          description={`${agentScopeCopy.editSummary}. It can’t move money or delete transactions or accounts.`}
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
              ? "This browser doesn’t support WebMCP. Browser assistants can still use the regular interface."
              : siteTools.count
                ? `${siteTools.count} site tools are available in this tab.`
                : browser.enabled
                  ? "Registering site tools…"
                  : "This browser supports WebMCP. Turn on access when you’re ready.")}
        </p>
      </Panel>
      <div id="remote-mcp" tabIndex={-1} className="settings-preference-anchor">
        <Panel title="In your AI app" className="agent-settings-panel">
          <p className="settings-helper">
            Connect ChatGPT, Claude or another MCP assistant, including for
            scheduled tasks. You approve each connection, and read access is the
            default.
          </p>
          <CopyField label="Server address" value={status.mcpUrl} />
          {!status.remoteReady && (
            <p className="inline-notice agent-notice">
              Remote connections need Marten at an HTTPS address. Point this
              deployment’s app address at that site before connecting ChatGPT,
              Claude or another assistant.
            </p>
          )}
          <ol className="agent-setup-steps">
            <li>
              In your assistant, add a custom connector and paste the server
              address.
            </li>
            <li>
              Choose OAuth. If asked for a client ID, use{" "}
              <code>marten-chatgpt</code> for ChatGPT or{" "}
              <code>marten-claude</code> for Claude. Others, such as Grok,
              register themselves.
            </li>
            <li>Sign in to Marten and approve the request.</li>
          </ol>
          <p className="agent-client-note">
            Custom connectors depend on your assistant’s plan.
            <a
              href="https://help.openai.com/en/articles/11487775-connectors-in-chatgpt"
              target="_blank"
              rel="noreferrer"
            >
              ChatGPT setup <ExternalLink size={12} />
            </a>
            <a
              href="https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp"
              target="_blank"
              rel="noreferrer"
            >
              Claude setup <ExternalLink size={12} />
            </a>
          </p>
        </Panel>
      </div>
      <div
        id="connected-assistants"
        tabIndex={-1}
        className="settings-preference-anchor"
      >
        <Panel title="Connected assistants" className="agent-settings-panel">
          {!grants.length ? (
            <Empty
              icon={<Plug size={20} />}
              title="No assistants connected"
              description="Assistants you approve from your AI app appear here."
            />
          ) : (
            <div className="agent-list">
              {grants.map((grant) => (
                <CredentialRow
                  key={grant._id}
                  name={grant.clientName}
                  unverified={grant.trust === "unverified"}
                  scopes={grant.scopes}
                  lastUsedAt={grant.lastUsedAt}
                  lifetime={grant.lifetime}
                  expiresAt={grant.expiresAt}
                  now={now}
                  action={
                    <Button
                      disabled={task.busy}
                      onClick={() =>
                        setConfirming({
                          kind: "grant",
                          id: grant._id,
                          name: grant.clientName,
                        })
                      }
                    >
                      Disconnect
                    </Button>
                  }
                />
              ))}
            </div>
          )}
          {!status.grantsComplete && (
            <p className="agent-list-empty">
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
              Access keys
              <InfoTip
                disclosure
                label="About access keys"
                text="For assistants that send a saved key instead of signing in, such as Meta Muse. Use the server address above and send the key as a bearer token. Keys get the same checks, limits and activity record as connected assistants. Marten stores only a fingerprint, so each key is shown once."
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
              description="For assistants that can’t sign in. You’ll see each key once."
              action={createKeyButton}
            />
          ) : (
            <div className="agent-list">
              {keys.map((key) => (
                <CredentialRow
                  key={key._id}
                  name={key.clientName}
                  scopes={key.scopes}
                  lastUsedAt={key.lastUsedAt}
                  lifetime={key.lifetime}
                  expiresAt={key.expiresAt}
                  now={now}
                  action={
                    <Button
                      disabled={task.busy}
                      onClick={() =>
                        setConfirming({
                          kind: "key",
                          id: key._id,
                          name: key.clientName,
                        })
                      }
                    >
                      Revoke
                    </Button>
                  }
                />
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
        <Panel
          title={
            <>
              Recent activity
              <InfoTip
                label="About activity"
                text="Each call is recorded with its connection and time, and each change with the values before and after. Conversation text is never stored. Activity is kept for 90 days."
              />
            </>
          }
          className="agent-settings-panel"
        >
          {!status.activity.length ? (
            <Empty
              title="No activity yet"
              description="What your assistants read and change appears here."
            />
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
                    {activityFormat.format(new Date(event.createdAt))}
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
        title="Save your access key"
      >
        {revealed && (
          <RevealedKey
            accessKey={revealed.key}
            mcpUrl={status.mcpUrl}
            onDone={() => setRevealed(null)}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={
          confirming?.kind === "grant"
            ? `Disconnect ${confirming.name}?`
            : "Revoke this access key?"
        }
      >
        <p className="agent-modal-text">
          {confirming?.kind === "grant"
            ? "It loses access right away. To use it again, connect it from your AI app."
            : `Any assistant using “${confirming?.name}” loses access right away.`}
        </p>
        <div className="modal-actions">
          <Button onClick={() => setConfirming(null)}>Cancel</Button>
          <Button
            tone="danger"
            disabled={task.busy}
            onClick={() =>
              confirming &&
              void task.run(
                async () => {
                  await revoke({ id: confirming.id });
                  setConfirming(null);
                },
                confirming.kind === "grant"
                  ? "Assistant disconnected"
                  : "Access key revoked",
              )
            }
          >
            {confirming?.kind === "grant" ? "Disconnect" : "Revoke key"}
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
        <Field label="Name" hint="So you can recognize it later.">
          <input
            aria-label="Key name"
            placeholder="Meta Muse"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <div className="form-grid agent-key-options">
          <Field label="Access">
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
        </div>
        <p className="agent-key-access-hint">
          {access === "edit"
            ? `Reads your finances and can also ${agentScopeCopy.editSummary.toLowerCase()}. It can’t move money or delete transactions or accounts.`
            : "Reads your finances. It can’t change anything."}
        </p>
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

/**
 * The one-time key reveal: the key in a read-only monospace field, how to use
 * it, and Copy as the dialog's primary action with Done beside it.
 */
function RevealedKey({
  accessKey,
  mcpUrl,
  onDone,
}: {
  accessKey: string;
  mcpUrl: string;
  onDone: () => void;
}) {
  const { copied, copy } = useCopy();
  return (
    <div className="agent-revealed-key">
      <p className="agent-modal-text">
        Add it to your assistant’s connector settings. Marten won’t show it
        again.
      </p>
      {/* Wraps like text on any width; one click selects the whole key. */}
      <code className="agent-secret" tabIndex={0} aria-label="Access key">
        {accessKey}
      </code>
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
        <Button onClick={onDone}>Done</Button>
        <Button
          tone="primary"
          className="agent-copy-action"
          icon={copyIcon(copied)}
          onClick={() => copy(accessKey)}
        >
          <CopyLabel copied={copied} label="Copy key" />
        </Button>
      </div>
    </div>
  );
}
