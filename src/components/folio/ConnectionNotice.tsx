import { useEffect, useState } from "react";
import { useConvexConnectionState } from "../../lib/convex";
import { useLocation } from "react-router-dom";
import { WifiOff, RefreshCw } from "lucide-react";
import { publicPaths } from "../../site/paths";
import { Button } from "./ui";

export function ConnectionNotice() {
  const { isWebSocketConnected, hasInflightRequests } =
    useConvexConnectionState();
  const { pathname } = useLocation();
  const [delayed, setDelayed] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    if (isWebSocketConnected) {
      setDelayed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayed(true), 5000);
    return () => window.clearTimeout(timer);
  }, [isWebSocketConnected]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (
    publicPaths.has(pathname) ||
    (online && (!delayed || isWebSocketConnected))
  )
    return null;
  return (
    <aside className="connection-notice" role="status" aria-live="polite">
      <WifiOff size={18} aria-hidden="true" />
      <div>
        <strong>{online ? "Reconnecting to Marten" : "You’re offline"}</strong>
        <p>
          {hasInflightRequests
            ? "Waiting for confirmation. Keep this page open and don’t submit again."
            : "Keep this page open. Marten will reconnect automatically."}
        </p>
        {!hasInflightRequests && (
          <small>
            If it stays disconnected, copy unsaved details before reloading.
          </small>
        )}
      </div>
      {!hasInflightRequests && (
        <Button
          icon={<RefreshCw size={14} />}
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      )}
    </aside>
  );
}
