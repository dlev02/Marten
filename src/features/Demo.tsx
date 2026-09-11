import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Loading, useTask } from "../components/folio/ui";
import {
  demoStorageError,
  exitDemo,
  isExitingDemo,
  returnToAccount,
} from "../lib/demo";
import { Brand } from "./Auth";
import "./demo.css";

export function DemoStartup({ authenticated }: { authenticated: boolean }) {
  const { signIn } = useAuthActions();
  const initialize = useMutation(api.workspace.initialize);
  const started = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current || demoStorageError() || isExitingDemo()) return;
    started.current = true;
    const start = authenticated
      ? initialize({ name: "Taylor", sample: true })
      : signIn("anonymous");
    void start.catch(() => {
      started.current = false;
      setError("The demo couldn't start. Please try again.");
    });
  }, [authenticated, attempt, initialize, signIn]);
  const message = demoStorageError() ?? error;
  if (!message) return <Loading text="Preparing your fictional household…" />;
  return (
    <main className="auth-page">
      <div className="auth-logo">
        <Brand />
      </div>
      <section className="auth-card">
        <h1>Explore the demo</h1>
        <p role="alert">{message}</p>
        {!demoStorageError() && (
          <Button
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        )}
        <Button onClick={returnToAccount}>Back to sign in</Button>
      </section>
    </main>
  );
}

export function DemoBanner() {
  const { signOut } = useAuthActions();
  const { busy, run } = useTask();
  return (
    <div className="demo-banner" role="note" aria-label="Demo workspace">
      <p>
        <strong>Demo mode</strong>
        <span>Fictional finances. Your own accounts stay separate.</span>
      </p>
      <Button disabled={busy} onClick={() => void run(() => exitDemo(signOut))}>
        {busy ? "Leaving…" : "Exit demo"}
      </Button>
    </div>
  );
}
