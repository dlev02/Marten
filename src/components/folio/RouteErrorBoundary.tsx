import { Component, type ErrorInfo, type ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import { RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "./ui";
import { buildIssueUrl } from "../../lib/feedbackReport";
import { isStaleChunkError, reloadForStaleChunk } from "../../lib/staleChunk";
import { message as friendlyMessage } from "../../lib/format";
import { serviceErrorKind } from "../../lib/serviceErrors";

export function ErrorScreen({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const stale = isStaleChunkError(error);
  const kind = serviceErrorKind(error);
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <div className="route-error" role="alert">
      <div className="route-error-mark" aria-hidden="true" />
      <h1>
        {stale || kind === "update"
          ? "Marten needs a refresh"
          : kind === "connection"
            ? "We can’t reach Marten"
            : "This page couldn’t load"}
      </h1>
      <p>
        {stale
          ? "A newer version of Marten is available. Reload to pick it up; nothing you saved is lost."
          : friendlyMessage(error)}
      </p>
      <div className="route-error-actions">
        <Button
          tone="primary"
          icon={<RefreshCw size={15} />}
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
        {onRetry && !stale && <Button onClick={onRetry}>Try again</Button>}
        <Button
          icon={<Home size={15} />}
          onClick={() => window.location.assign("/dashboard")}
        >
          Go to dashboard
        </Button>
        {!stale && (
          <a
            className="f-button"
            href={buildIssueUrl({
              kind: "bug",
              title: "App error: " + message.slice(0, 80),
              details: `The app showed “${message}”.`,
              includeEnvironment: true,
            })}
            target="_blank"
            rel="noreferrer"
          >
            <Bug size={15} />
            Report it
          </a>
        )}
      </div>
      {!stale && (
        <details className="route-error-detail">
          <summary>Technical details</summary>
          <pre>{message}</pre>
        </details>
      )}
    </div>
  );
}

/** Wraps the routed page tree; stale-chunk errors reload, others explain. */
export class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isStaleChunkError(error) && reloadForStaleChunk()) return;
    console.error("Route error", error, info.componentStack);
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error)
      this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <ErrorScreen
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    return this.props.children;
  }
}

/** The router-level fallback for errors thrown outside the Shell's boundary. */
export function RouteErrorScreen() {
  const error = useRouteError();
  if (isStaleChunkError(error)) reloadForStaleChunk();
  return (
    <main className="route-error-page">
      <ErrorScreen error={error} />
    </main>
  );
}
