import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Button, Loading, Toggle, useTask } from "../../components/folio/ui";
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

function ConsentRequest({ request }: { request: string }) {
  const details = useQuery(api.agentAccess.authorizationRequest, { request });
  const authorize = useAction(api.agentAccess.authorize);
  const deny = useMutation(api.agentAccess.denyAuthorization);
  const [allowEdits, setAllowEdits] = useState(false);
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
  return (
    <>
      <h1>Connect {details.clientName}?</h1>
      <p>
        This assistant will be able to read your Marten accounts, transactions,
        reports, recurring schedules, investments, forecasts and credit-score
        history.
      </p>
      <div className="agent-consent-identity">
        <span>Client</span>
        <code>{details.clientId}</code>
        <span>Returns to</span>
        <code>{new URL(details.redirectUri).origin}</code>
      </div>
      {["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(details.redirectUri).hostname,
      ) && (
        <p className="agent-consent-note">
          Approve only if you started this connection in a local assistant on
          this device.
        </p>
      )}
      {details.requestedScopes.includes("finance:write") && (
        <Toggle
          label="Also allow edits"
          description="Allow transaction annotations, account display changes, recurring schedules and saved forecasts. Bank payments, trades and account deletion are not available."
          checked={allowEdits}
          disabled={task.busy}
          onChange={setAllowEdits}
        />
      )}
      <p className="agent-consent-note">
        Access lasts up to 30 days. You can disconnect this assistant at any
        time in Settings → AI connections. Information sent to the assistant is
        subject to that service’s data settings.
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
              const result = await authorize({ request, allowEdits });
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
