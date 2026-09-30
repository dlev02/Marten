import { useState } from "react";
import { useAction, useMutation, useQuery } from "../../lib/convex";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { ShieldAlert } from "lucide-react";
import {
  Button,
  Field,
  Loading,
  Toggle,
  useTask,
} from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { Brand } from "../Auth";
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
  idle: "Stays connected while your assistant keeps using it, including scheduled tasks. Ends after 90 days without use.",
  fixed: "Ends 30 days from today, even if your assistant is still using it.",
  untilRevoked:
    "Stays connected until you disconnect it in Settings → AI connections.",
};

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
  return (
    <>
      <h1>
        {unverified
          ? "Connect an unverified app?"
          : `Connect ${details.clientName}?`}
      </h1>
      {unverified && (
        <div className="agent-unverified" role="note">
          <span className="agent-trust-badge">
            <ShieldAlert size={13} aria-hidden="true" />
            Unverified app
          </span>
          <p>
            This app calls itself “{details.clientName}”. Marten can’t confirm
            who runs it. After you approve, access is sent to{" "}
            <strong>{callback.host}</strong>. Continue only if you just started
            this connection yourself in an app you trust.
          </p>
        </div>
      )}
      <p>
        {unverified ? "It" : "This assistant"} will be able to read your Marten
        accounts, transactions, categories, merchants, tags, rules, preferences,
        reports, recurring schedules, investments, forecasts and credit-score
        history.
      </p>
      <div className="agent-consent-identity">
        <span>Returns to</span>
        <code className="agent-consent-host">{callback.host}</code>
        <span>Client ID</span>
        <code>{details.clientId}</code>
      </div>
      {["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname) && (
        <p className="agent-consent-note">
          Approve only if you started this connection in a local assistant on
          this device.
        </p>
      )}
      {details.requestedScopes.includes("finance:write") && (
        <Toggle
          label="Also allow edits"
          description="Allow transaction annotations, bulk recategorizing, merchant names and logos, categories, tags, rules, review and pending preferences, account display, manual account balances and statement dates, credit scores, recurring schedules and saved forecasts. Merging a duplicate merchant or category removes the duplicate. Bank payments, trades, deleting transactions or accounts, and bank connections are not available."
          checked={allowEdits}
          disabled={task.busy}
          onChange={setAllowEdits}
        />
      )}
      <div className="agent-consent-lifetime">
        <Field label="Keep access" hint={lifetimeHints[lifetime]}>
          <Select
            aria-label="Keep access"
            value={lifetime}
            onValueChange={(value) => setLifetime(value as Lifetime)}
            options={lifetimeOptions}
            disabled={task.busy}
          />
        </Field>
      </div>
      <p className="agent-consent-note">
        You can disconnect {unverified ? "this app" : "this assistant"} at any
        time in Settings → AI connections. Information sent to it is subject to
        that service’s data settings.
      </p>
      <div className="modal-actions">
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
    </>
  );
}
