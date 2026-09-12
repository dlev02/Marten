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

## Sign-in attempts and session revocation

- Failed password sign-ins are limited by Convex Auth's built-in limiter,
  configured in [auth.ts](../convex/auth.ts) as ten failures per hour per
  account, after which one further attempt is allowed every six minutes.
  Successful sign-ins are not throttled. The sign-in screen shows the
  provider's message when the limit is reached.
- Every `userQuery`, `userMutation`, and `userAction` checks that the
  session named in the token still exists ([access.ts](../convex/lib/access.ts),
  [sessions.ts](../convex/sessions.ts)). A password reset or account deletion
  deletes session rows, so tokens issued to other devices stop working on
  their next request instead of at the token's expiry. Covered by
  `convex/sessionRevocation.test.ts`.

## Request limits and failure handling

[resetLimits.ts](../convex/lib/resetLimits.ts) reserves each request against the normalized email address in `resetEmailLimits`:

- At least one minute between requests.
- At most five requests during the hour that starts with the first request in that window.
- Reservation occurs inside Auth's code-creation transaction, before the previous code is replaced. A rate-limited resend leaves the prior code usable until its original expiry.
- An accepted new request replaces the old code. A later delivery failure can consume the reservation, so repeated retries still respect the limits.

Brevo HTTP errors and network/timeout failures return a safe retry message. Provider response bodies and diagnostics are not returned to the user. Missing mail configuration returns an explicit unavailable message. Requests use a 15-second timeout.

## Deleting your account

Settings → Preferences ends with a **Delete account** section (search: "delete account"). The confirmation dialog requires typing `DELETE` and the sign-in email; the email comparison is case-insensitive and trims whitespace. Anonymous demo guests have no account to delete and are refused.

[accountDeletion.ts](../convex/accountDeletion.ts) records `deletionRequestedAt` on the profile, then schedules the work so the request returns immediately and the browser signs out and returns to the landing page:

1. `revokeBanks` marks each Plaid Item disconnected and calls `/item/remove`. A failed revocation is logged and never blocks deletion; the access token is erased with the row. SimpleFIN keeps no server-side grant, so bridge access continues until the user revokes it at the bridge.
2. `deleteBatch` removes at most 200 documents per run and reschedules itself: assistant grants with their tokens and pending authorization requests, reminder deliveries, rules, credit scores, transactions, balances, recurring payments, and every other `userId`-owned table (assistant preferences and activity, reminder preferences and verifications, forecast scenarios, investment securities, holdings, transactions, and sync states, attachments and uploads with their stored blobs, activity, recurring items, saved reports, tags, merchants with stored logos, categories, groups, accounts, SimpleFIN connections, Plaid items).
3. Once nothing owned remains, the profile (and its photo blob) is deleted, followed by the Convex Auth rows: `authSessions` with their `authRefreshTokens` and `authVerifiers`, `authAccounts` with their `authVerificationCodes` and `authRateLimits`, the email's `resetEmailLimits` row, and finally the `users` row.

Requesting deletion twice is refused while the first sweep is in flight. The [deletion tests](../convex/accountDeletion.test.ts) seed two users across every table family, run the scheduled sweep, and check that one user's rows, blobs, and sign-in records are gone while the other user's remain intact.

## Recorded setup and verification

During the September 10, 2026 development review, the coordinating browser test observed a recovery email delivered to the user's authorized QA inbox, completed the reset, confirmed that the old password was rejected, and signed in with the new password. These observations establish that tested development path, not production deployment.

The review used the account holder’s configured sender address. The sender display name now follows the Marten brand. Brevo displayed a rewrite to a `brevosend` subdomain for delivery. The created key's UI showed an expiry of **2027-09-10** and expiry after **90 days of inactivity**. These are recorded configuration observations; recheck the Brevo console when troubleshooting or rotating the key. No secret value is recorded here.

The [auth integration tests](../convex/authEmail.test.ts) exercise the real `api.auth.signIn` Password provider and Auth store with an ephemeral signing key and fully mocked email transport. They cover throttled resend preservation, expiry, code replay, other-account rejection, canonical-email checks, old/new password behavior, removal of old session records, and sanitized HTTP/network failures. They send no live email.

```sh
npm test -- convex/authEmail.test.ts
```

For a future live check, use an explicitly authorized test inbox, verify delivery, complete one reset, and check both old and new credentials. Do not use another person's account or assume mocked transport tests prove current deliverability.
