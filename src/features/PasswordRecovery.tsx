import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/folio/ui";
import { message } from "../lib/format";
import "./auth.css";

export function PasswordRecovery({ onBack }: { onBack: () => void }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = new FormData(event.currentTarget);
    values.set("email", email.trim().toLowerCase());
    values.set("flow", sent ? "reset-verification" : "reset");
    try {
      await signIn("password", values);
      if (!sent) setSent(true);
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : String(cause);
      // The same next step is shown for an unregistered email address.
      if (!sent && /InvalidAccountId/.test(raw)) setSent(true);
      else if (
        sent &&
        /InvalidAccountId|Invalid code|Could not verify|InvalidVerificationCode/.test(
          raw,
        )
      )
        setError(
          "That code is invalid or expired. Check it or request a new one.",
        );
      else setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="text-link auth-back"
        onClick={onBack}
        disabled={busy}
      >
        <ArrowLeft size={16} /> Back to sign in
      </button>
      <div className="auth-intro">
        <h1>{sent ? "Check your email." : "Forgot your password?"}</h1>
        <p>
          {sent
            ? `If ${email.trim()} has a Marten account, we’ve sent it an eight-digit code. It expires in 15 minutes.`
            : "Enter your email and we’ll send you a code to reset it."}
        </p>
      </div>
      <form
        key={sent ? "verify" : "request"}
        onSubmit={(event) => void submit(event)}
      >
        {!sent ? (
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
        ) : (
          <>
            <label>
              Reset code
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                maxLength={8}
                minLength={8}
                autoFocus
                required
                placeholder="8-digit code"
                className="auth-code"
              />
            </label>
            <label>
              New password
              <span className="auth-password">
                <input
                  name="newPassword"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
          </>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <Button tone="primary" type="submit" disabled={busy}>
          {busy
            ? sent
              ? "Resetting password…"
              : "Sending code…"
            : sent
              ? "Set new password"
              : "Send reset code"}
        </Button>
      </form>
      {sent && (
        <p className="auth-switch">
          No code? Check your spam folder, or{" "}
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setError("");
            }}
          >
            request another
          </button>
          .
        </p>
      )}
    </>
  );
}
