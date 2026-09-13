import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Unplug } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  Button,
  Loading,
  Panel,
  Toggle,
  useTask,
} from "../../components/folio/ui";
import { useSiteToolStatus } from "../../lib/siteToolStatus";
import "../agents/agent-access.css";

export function AgentSettings() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const status = useQuery(api.agentAccess.status, { now });
  const browser = useQuery(api.agentAccess.browserStatus, {});
  const setAccess = useMutation(api.agentAccess.setBrowserAccess);
  const revoke = useMutation(api.agentAccess.revoke);
  const siteTools = useSiteToolStatus();
  const task = useTask();
  if (!status || !browser) return <Loading />;
  const grants = status.grants.filter(
    (grant) => !grant.revokedAt && grant.expiresAt > now,
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
          description="Allow transaction annotations, bulk recategorizing, merchant names, categories, tags, rules, review and pending preferences, account display, recurring schedules and saved forecasts. Ask your assistant to review changes with you."
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
      <Panel title="In your AI app" className="agent-settings-panel">
        <p className="settings-helper">
          Connect an MCP-compatible assistant to use Marten without keeping a
          browser tab open. You approve each connection here; read access is the
          default. No model API key is needed in Marten.
        </p>
        <div className="agent-server-address">
          <code>{status.mcpUrl}</code>
          <Button
            icon={<Copy size={14} />}
            onClick={() =>
              void task.run(
                () => navigator.clipboard.writeText(status.mcpUrl),
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
            deployment’s app address must point to that site before a connection
            from ChatGPT or Claude can finish.
          </p>
        )}
        <ol className="agent-setup-steps">
          <li>
            Open your assistant’s app or connector settings and add a custom MCP
            connection.
          </li>
          <li>
            Paste the server address above. If asked for an OAuth client ID, use{" "}
            <code>marten-chatgpt</code> for ChatGPT or{" "}
            <code>marten-claude</code> for Claude. No client secret is used.
          </li>
          <li>
            Sign in to Marten and review the access request. Start with read
            access; allow edits only if you want them.
          </li>
        </ol>
        <p className="agent-client-note">
          Custom connections depend on your assistant’s plan and client support.{" "}
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
                  <strong>{grant.clientName}</strong>
                  <span>
                    {grant.scopes.includes("finance:write")
                      ? "Read and edit"
                      : "Read access"}{" "}
                    · Expires {new Date(grant.expiresAt).toLocaleDateString()}
                  </span>
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
      <Panel title="Recent agent activity" className="agent-settings-panel">
        <p className="settings-helper">
          Calls are recorded by tool and time. Financial values and conversation
          text are not stored in this activity list.
        </p>
        {!status.activity.length ? (
          <p className="agent-activity-empty">No agent activity yet.</p>
        ) : (
          <ul className="agent-activity">
            {status.activity.map((event) => (
              <li key={event._id}>
                <div>
                  <strong>{event.tool.replace(/_/g, " ")}</strong>
                  <span>
                    {event.source === "mcp"
                      ? "Connected assistant"
                      : "Browser assistant"}{" "}
                    ·{" "}
                    {event.success
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
    </>
  );
}
