# Authentication and password recovery

Marten uses the installed Convex Auth Password provider in [auth.ts](../convex/auth.ts). Email addresses are trimmed and lowercased, and new passwords must contain at least 12 characters. The current recovery flow uses an emailed one-time code rather than a clickable reset link.

## Configuration

Configure these values on the intended **Convex deployment**, never in frontend build variables or committed files:

| Variable                  | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth signing key and public verification keys        |
| `SITE_URL`                | Exact frontend origin used by authentication                |
| `AUTH_BREVO_KEY`          | Brevo API key authorized to send transactional email        |
| `AUTH_EMAIL_FROM`         | Verified sender email address; the display name is `Marten` |

Convex supplies `CONVEX_SITE_URL`. See [development setup](development.md) before initializing a new deployment or replacing signing keys. Development and production configuration are separate.

[authEmail.availability](../convex/authEmail.ts) exposes only a boolean indicating whether both email configuration values exist. It does not test delivery or establish that the key remains active. The sign-in page displays **Forgot password?** when that flag is true.

Do not print keys, passwords, recovery codes, or complete mail payloads in logs or troubleshooting output. Update secrets through the selected deployment's environment settings. Sender authentication and deliverability must be checked separately from a successful backend push.

## Recovery behavior

[PasswordRecovery](../src/features/PasswordRecovery.tsx) normalizes the email and calls the Password provider with `flow: "reset"`. [passwordReset.ts](../convex/lib/passwordReset.ts) generates eight uniformly distributed decimal digits, sends them through Brevo's transactional email endpoint, and sets a 15-minute expiry.

Submitting the code calls `flow: "reset-verification"` with the canonical email and new password. Verification requires an exact match with the account's canonical email. A code cannot reset another account, noncanonical spellings cannot redeem it, and successful verification consumes the code. The password is replaced and the auth library invalidates other session records. This does not introduce a live session lookup on every backend request; do not describe it as instant revocation of every already-issued access JWT before that token expires.

The request screen uses the same next step for an unknown account. This is a **UI behavior**, not a claim of server-side account-enumeration resistance: the underlying provider can return distinguishable errors for an unknown account. A generic screen alone does not change that API contract.

## Request limits and failure handling

[resetLimits.ts](../convex/lib/resetLimits.ts) reserves each request against the normalized email address in `resetEmailLimits`:

- At least one minute between requests.
- At most five requests during the hour that starts with the first request in that window.
- Reservation occurs inside Auth's code-creation transaction, before the previous code is replaced. A rate-limited resend leaves the prior code usable until its original expiry.
- An accepted new request replaces the old code. A later delivery failure can consume the reservation, so repeated retries still respect the limits.

Brevo HTTP errors and network/timeout failures return a safe retry message. Provider response bodies and diagnostics are not returned to the user. Missing mail configuration returns an explicit unavailable message. Requests use a 15-second timeout.

## Recorded setup and verification

During the September 10, 2026 development review, the coordinating browser test observed a recovery email delivered to the user's authorized QA inbox, completed the reset, confirmed that the old password was rejected, and signed in with the new password. These observations establish that tested development path, not production deployment.

The review used the account holder’s configured sender address. The sender display name now follows the Marten brand. Brevo displayed a rewrite to a `brevosend` subdomain for delivery. The created key's UI showed an expiry of **2027-09-10** and expiry after **90 days of inactivity**. These are recorded configuration observations; recheck the Brevo console when troubleshooting or rotating the key. No secret value is recorded here.

The [auth integration tests](../convex/authEmail.test.ts) exercise the real `api.auth.signIn` Password provider and Auth store with an ephemeral signing key and fully mocked email transport. They cover throttled resend preservation, expiry, code replay, other-account rejection, canonical-email checks, old/new password behavior, removal of old session records, and sanitized HTTP/network failures. They send no live email.

```sh
npm test -- convex/authEmail.test.ts
```

For a future live check, use an explicitly authorized test inbox, verify delivery, complete one reset, and check both old and new credentials. Do not use another person's account or assume mocked transport tests prove current deliverability.
