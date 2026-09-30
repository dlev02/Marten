import { useState } from "react";
import { useAction, useMutation, useQuery } from "../../lib/convex";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Clock3, Eye, Globe, PencilLine, ShieldAlert } from "lucide-react";
import { Button, Loading, Toggle, useTask } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { Brand } from "../Auth";
import { agentScopeCopy } from "./agentScopes";
import "./agent-access.css";

export function AgentAuthorize() {
  const [params] = useSearchParams();
  const request = params.get("request") ?? "";
  const browser = useQuery(api.agentAccess.browserStatus, {});
  if (!browser) return <Loading />;
  return (
    <main className="agent-consent-page">
      <div className="agent-consent-card">
        <Brand />
        {browser.canEnable && /^request_[A-Za-z0-9_-]{43}$/.test(request) ? (
          <ConsentRequest request={request} />
        ) : (
          <>
            <h1>Connection unavailable</h1>
            <p>
              {browser.canEnable
                ? "This connection link is incomplete. Start again from your AI app."
                : "Sign in to a personal workspace before connecting an assistant. Demo and sample workspaces cannot authorize agent access."}
            </p>
            <a className="agent-back-link" href="/settings/agents">
              Back to Marten
            </a>
          </>
        )}
      </div>
    </main>
  );
}

type Lifetime = "idle" | "fixed" | "untilRevoked";
const lifetimeOptions: { value: Lifetime; label: string }[] = [
  { value: "idle", label: "While it’s in use" },
  { value: "fixed", label: "For 30 days" },
  { value: "untilRevoked", label: "Until I disconnect it" },
];
const lifetimeHints: Record<Lifetime, string> = {
  idle: "Ends after 90 days without use",
  fixed: "Ends 30 days from today",
  untilRevoked: "Ends only when you disconnect it",
};
const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

function ConsentRequest({ request }: { request: string }) {
  const details = useQuery(api.agentAccess.authorizationRequest, { request });
  const authorize = useAction(api.agentAccess.authorize);
  const deny = useMutation(api.agentAccess.denyAuthorization);
  const [allowEdits, setAllowEdits] = useState(false);
  const [lifetime, setLifetime] = useState<Lifetime>("idle");
  const task = useTask();
  if (details === undefined) return <Loading />;
  if (!details || details.expiresAt <= Date.now())
    return (
      <>
        <h1>This request expired</h1>
        <p>Return to your AI app and start the connection again.</p>
        <a className="agent-back-link" href="/settings/agents">
          Back to Marten
        </a>
      </>
    );
  const callback = new URL(details.redirectUri);
  const unverified = details.trust === "unverified";
  const loopback = loopbackHosts.includes(callback.hostname);
  const canEdit = details.requestedScopes.includes("finance:write");
  return (
    <>
      {/* A registered app names itself, so an unverified title never repeats
          that name as if Marten vouched for it. */}
      <h1>
        {unverified
          ? "Connect an unverified app?"
          : `Connect ${details.clientName}?`}
      </h1>
      <p className={`agent-consent-lede ${unverified ? "unverified" : ""}`}>
        {unverified ? (
          <>
            <ShieldAlert size={15} aria-hidden="true" />
            <span>
              It calls itself “{details.clientName}”. Continue only if you just
              started this connection.
            </span>
          </>
        ) : (
          <span>{details.clientName} wants to use your Marten workspace.</span>
        )}
      </p>
      <div className="agent-consent-list">
        <div className="agent-consent-row">
          <Globe size={16} aria-hidden="true" />
          <div>
            <strong className="agent-consent-host">{callback.host}</strong>
            <span>
              {loopback
                ? "An app on this device receives access"
                : "Receives access after you approve"}
            </span>
          </div>
        </div>
        <div className="agent-consent-row">
          <Eye size={16} aria-hidden="true" />
          <div>
            <strong>Read your finances</strong>
            <span>{agentScopeCopy.readSummary}</span>
          </div>
        </div>
        {canEdit && (
          <div className="agent-consent-row">
            <PencilLine size={16} aria-hidden="true" />
            <Toggle
              label="Also allow edits"
              description={`${agentScopeCopy.editSummary}. Never moves money.`}
              checked={allowEdits}
              disabled={task.busy}
              onChange={setAllowEdits}
            />
          </div>
        )}
        <div className="agent-consent-row">
          <Clock3 size={16} aria-hidden="true" />
          <div>
            <strong id="agent-keep-access">Keep access</strong>
            <span>{lifetimeHints[lifetime]}</span>
          </div>
          <Select
            aria-labelledby="agent-keep-access"
            value={lifetime}
            onValueChange={(value) => setLifetime(value as Lifetime)}
            options={lifetimeOptions}
            disabled={task.busy}
          />
        </div>
        <details className="agent-consent-details">
          <summary>
            <span>What it can access</span>
          </summary>
          <dl>
            <dt>Can read</dt>
            <dd>{agentScopeCopy.readAll}</dd>
            {canEdit && (
              <>
                <dt>With edits</dt>
                <dd>{agentScopeCopy.editAll}</dd>
              </>
            )}
            <dt>Never</dt>
            <dd>{agentScopeCopy.never}</dd>
            <dt>Once shared</dt>
            <dd>Data it receives follows that app’s own data settings.</dd>
            <dt>Client ID</dt>
            <dd>
              <code>{details.clientId}</code>
            </dd>
          </dl>
        </details>
      </div>
      <div className="modal-actions agent-consent-actions">
        <Button
          disabled={task.busy}
          onClick={() =>
            void task.run(async () => {
              const result = await deny({ request });
              window.location.assign(result.redirectUrl);
            })
          }
        >
          Cancel
        </Button>
        <Button
          tone="primary"
          disabled={task.busy}
          onClick={() =>
            void task.run(async () => {
              const result = await authorize({
                request,
                allowEdits,
                lifetime,
              });
              window.location.assign(result.redirectUrl);
            })
          }
        >
          {task.busy
            ? "Connecting…"
            : allowEdits
              ? "Allow read and edit"
              : "Allow read access"}
        </Button>
      </div>
      <p className="agent-consent-note">
        You can disconnect it anytime in Settings → AI connections.
      </p>
    </>
  );
}
