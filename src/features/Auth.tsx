import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Building2, Check, Eye, EyeOff } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button, useTask } from "../components/folio/ui";
import { PasswordRecovery } from "./PasswordRecovery";
import "./auth.css";
import "./demo.css";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true" />
      <span>Marten</span>
    </span>
  );
}
export function AuthScreen() {
  const { signIn } = useAuthActions(),
    { busy, run } = useTask();
  const [signup, setSignup] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailAvailability = useQuery(api.authEmail.availability, {});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("flow", signup ? "signUp" : "signIn");
    await run(() => signIn("password", data));
  }
  return (
    <main className="auth-page">
      <div className="auth-logo">
        <Brand />
      </div>
      <section className="auth-card">
        {recovery ? (
          <PasswordRecovery onBack={() => setRecovery(false)} />
        ) : (
          <>
            <div className="auth-intro">
              <h1>{signup ? "Create your account" : "Welcome back"}</h1>
              <p>
                {signup
                  ? "Bring your accounts and spending together."
                  : "Sign in to your Marten account."}
              </p>
            </div>
            <form
              onSubmit={(e) => {
                void submit(e);
              }}
            >
              {signup && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="given-name"
                    required
                    placeholder="First name"
                    maxLength={80}
                  />
                </label>
              )}
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <span className="auth-password">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={signup ? "new-password" : "current-password"}
                    required
                    minLength={signup ? 12 : 1}
                    placeholder={
                      signup ? "At least 12 characters" : "Your password"
                    }
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              {!signup && emailAvailability?.passwordReset && (
                <div className="auth-forgot">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setRecovery(true)}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <Button tone="primary" type="submit" disabled={busy}>
                {busy
                  ? signup
                    ? "Creating account…"
                    : "Signing in…"
                  : signup
                    ? "Create account"
                    : "Sign in"}
                <ArrowRight size={17} />
              </Button>
            </form>
            <a
              className="auth-demo-link"
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Explore demo</span>
              <span className="auth-demo-label">Sample data</span>
              <span className="sr-only">
                (opens in a new tab, no account needed)
              </span>
            </a>
            <p className="auth-switch">
              {signup ? "Already have an account?" : "New to Marten?"}{" "}
              <button className="text-link" onClick={() => setSignup(!signup)}>
                {signup ? "Sign in" : "Create account"}
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
export function Onboarding() {
  const initialize = useMutation(api.workspace.initialize),
    { busy, run } = useTask();
  const [name, setName] = useState("");
  return (
    <div className="onboarding">
      <Brand />
      <section>
        <h1>See your whole financial picture.</h1>
        <p>
          Start with your accounts, or explore Marten with a fictional
          household.
        </p>
        <label className="onboarding-name">
          What should we call you?
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            maxLength={80}
          />
        </label>
        <div className="onboarding-choices">
          <button
            disabled={busy}
            onClick={() =>
              void run(() =>
                initialize({ name: name || undefined, sample: false }),
              )
            }
          >
            <Building2 size={26} />
            <h2>Start fresh</h2>
            <p>Connect your banks or add an account manually.</p>
            <span>
              Set up my finances <ArrowRight size={16} />
            </span>
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(() =>
                initialize({ name: name || "Brian", sample: true }),
              )
            }
          >
            <Check size={26} />
            <h2>Explore sample data</h2>
            <p>Try accounts, transactions, and reports with fictional data.</p>
            <span>
              Take a look around <ArrowRight size={16} />
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
