# Plaid connections

Marten uses Plaid directly from Convex actions. Browser clients receive short-lived Link tokens and safe connection metadata; access tokens and Plaid secrets stay on the server.

## Getting credentials and understanding the Trial

Plaid's free Trial allows **10 Production Items, created in total, for the life of the Plaid team**. An Item is one login at one institution and can hold several accounts (a Chase login with three cards and two bank accounts is one Item). Creating an Item spends a slot permanently: disconnecting or removing it in Marten or in Plaid's dashboard does not return the slot. Reconnecting an existing Item in update mode (Marten's **Reconnect**) does not spend a new one, so repair a broken connection rather than adding the institution again. The Trial includes Transactions, Liabilities, and Investments, which are the products Marten uses. Sandbox is separate: free, fictional institutions and data, no effect on the Trial count, and the only environment automated tests may use.

To obtain credentials, sign up at [dashboard.plaid.com](https://dashboard.plaid.com), start with the Sandbox keys, and apply for Production access (the Trial is the plan you are approved into). Then set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` on the Convex deployment as described below, and register the site's HTTPS origin as an allowed redirect URI for OAuth institutions such as Chase. Eligibility, approval, OAuth institution availability, and any pricing after the Trial are decided by Plaid. The [README](../README.md#how-plaids-free-trial-works) walks through this for newcomers; [bank provider options](bank-provider-options.md#how-plaids-limit-works) records the sources and the shared-deployment implications.

## Configuration

Set these environment variables on the intended Convex deployment:

- `PLAID_CLIENT_ID` and `PLAID_SECRET`: the matching Plaid credentials.
- `PLAID_ENV`: explicitly `sandbox` or `production`. Missing or invalid configuration disables new links; there is no implicit sandbox fallback.
- `PLAID_REDIRECT_URI`: the OAuth callback URL registered in Plaid's dashboard, when OAuth is enabled. The authenticated Shell mounts `PlaidLinkFlow`, which preserves a short-lived Link token and flow context in session storage and resumes Link when `oauth_state_id` is present. The session is bound to the signed-in user and cleared on completion, cancellation, or expiration. Both new connections and reconnects use this flow.
- `SITE_URL`: the app's public origin, also used by authentication.
- `PLAID_ALLOWED_EMAILS` (optional): a comma-separated, case-insensitive list of verified sign-in emails allowed to link Plaid. Signup alone does not prove ownership. An allowed user must complete the emailed password-reset flow once to establish Convex Auth mailbox verification; merely requesting a code does not count. When it is set, `plaid.status` reports `restricted: true` and `configured: false` for anyone else, the Add account dialog offers SimpleFIN and Lunch Flow as user-owned bank connections, and new Link tokens and token exchanges are refused server-side. Existing connections keep syncing regardless of the list. Leave it unset for a self-hosted deployment where every user may use Plaid.

`CONVEX_SITE_URL` is supplied by Convex. Link requests register `${CONVEX_SITE_URL}/plaid/webhook`. This endpoint validates Plaid's ES256 JWT, key state, issued-at time (at most five minutes old), and SHA-256 of the original request body before scheduling internal work.

Production credentials, Trial access, OAuth allowlists, and an actual institution connection are separate requirements. A successful development push does not prove a real bank connection works. Do not put credentials in client environment variables, source, screenshots, or logs.

## Link and accounts

The connection chooser uses server-reported eligibility. Eligible household emails see Plaid before the subscription providers; an unverified eligible email sees an email-verification step. Verification is bound to the current sign-in email and does not subscribe the person to reminders. Public FAQ copy does not advertise the private exception.

Transaction connections offer available history, from today, or a custom start date. The optional `plaidItems.importFromDate` persists through OAuth and every sync. It filters only new rows; existing provider rows still receive corrections. Reconnect/update mode does not change that cutoff. See [importing](importing.md#spreadsheet-history-and-bank-connections) for category-only spreadsheets and reversible overlap review.

The checking/cards choice initializes Transactions, collecting additional consent for Liabilities and Investments. The investments choice initializes Investments and collects additional consent for Transactions and Liabilities. Marten calls cached investment holdings and paginated investment activity endpoints for consented investment accounts; see [Investments](investments.md). Investment and IRA totals use the institution's cached current account balance, not available cash. Holdings are never added to net worth a second time.

Anonymous public-demo users cannot create or update Link, exchange a public token, store a live Item, or start/commit a bank sync, even if a profile incorrectly claims to be personal. The check uses the authenticated user's server-side `isAnonymous` flag before provider access. Registered sample-workspace users still need to clear sample data before connecting. Existing owned-Item disconnection remains available to revoke access; it cannot create bank access.

`/accounts/get` supplies cached balances. Marten does not call paid on-demand `/accounts/balance/get`, `/transactions/refresh`, or `/investments/refresh` endpoints. Credit/loan items with consent are queried for liabilities to obtain statement balances, minimum payments, and due dates when supported. Product access and billing remain governed by the Plaid account; this integration does not upgrade a plan.

Use update mode for an existing institution. Chase and Charles Schwab can invalidate an earlier OAuth connection when the same credentials create another Item. The server checks the authoritative Item and institution returned by Plaid, rejects duplicate active institutions for a user, and asks the user to repair the original connection with Reconnect. Client-provided institution names or IDs are never authoritative.

Marten currently accepts USD account and transaction values only. Unsupported currencies and unavailable current balances produce a visible connection error without inventing a conversion or treating brokerage cash as total assets. Bank account names and visibility choices are retained during sync.

## Transaction synchronization

- Fetch `/transactions/sync` until `has_more` is false. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, discard the entire fetched loop and restart at the last committed cursor (up to three attempts).
- Normalize and apply changes in bounded idempotent batches. A version and expiring lease fence every write. A superseded or disconnected sync cannot commit.
- Apply additions and modifications before removals. The posted transaction takes over its pending row ID, preserving attachments, activity, notes, tags, merchant/category choices, and other annotations.
- Advance the stored cursor only after every batch succeeds. An interrupted import replays from the original cursor; earlier applied batches are safe to repeat.
- Preserve removed records with `removedFromBank` while excluding them from active financial queries and merchant counts.
- If a bank changes a split transaction's total, retain the original allocation in `splitDraft`, clear the active split, and mark the transaction for review. Reports use the bank's posted total until the user reconciles the draft.
- Prefer Plaid's category intent to amount sign: merchant refunds reduce expense categories; income and transfers are handled separately. Ordered rules apply when importing new transactions.

A six-hour cron scans connections in pages of 25 and schedules catch-up syncs. Verified webhooks normally update them sooner. New Transactions Link requests ask for 730 days of history. Sync also sends `options.days_requested: 730` so Transactions can request that history when first initialized after an investments-first Link. Update-mode Link retains its existing account/consent flow without new-link product initialization parameters. The history actually available depends on Plaid and the institution; these requests do not establish a two-year backfill for an existing connection. One sync loop is bounded to 100 Plaid pages; one connection supports up to 100 shared accounts.

Before inserting a new transaction, ingestion looks for an unlinked spreadsheet row on the same account with the same amount within three days and adopts it: the row gains the Plaid transaction ID, the bank's date and statement text, and `source: "plaid"`, while its merchant, category, notes, tags, receipts, and review state stay. This is how history imported from another app (such as Monarch Money) merges with a later connection. See [importing](importing.md).

Disconnect first stops sync while retaining transaction history, account settings, and cached balances in net worth, then revokes the Item with Plaid. Disconnecting does not mark a bank account closed. Access tokens are cleared after successful revocation. If revocation fails, the connection displays a retryable error and the Disconnect action remains available.

Sample workspaces cannot create Link tokens or exchange live bank connections. The user must explicitly clear sample data and use a personal workspace first.

## Verification

Focused tests cover pending-to-posted identity, annotations and receipts, split drafts, idempotency, removals, merchant counts, account preferences, lease fencing, ownership, demo separation, metadata redaction, and webhook signatures. The development endpoint rejects unsigned webhooks with HTTP 401 and unauthenticated status reads with a sign-in error. A real institution Link/consent flow and subsequent cached-data sync still require an authorized account holder.

On 2026-09-10, the coordinating browser review completed embedded Plaid Sandbox Link for First Platypus Bank and observed 14 imported accounts. Refresh displayed credit liability fields, including a $1,708.77 statement balance, $20 minimum payment, and payment dates. After renaming the credit card to “QA Visa,” completing Reconnect retained the same 14 accounts and the edited name. Disconnect displayed a disconnected institution while preserving the $410.00 card balance and cached net worth of −$77,164.00.

These are fictional Sandbox values. The Chase OAuth popup could not be completed in the in-app browser, so the Sandbox result does not verify OAuth return in a browser, real institution coverage, live credentials, or production operation. OAuth session-boundary behavior is covered separately by unit tests.

Official references: [Link product initialization](https://plaid.com/docs/link/initializing-products/), [duplicate Items](https://plaid.com/docs/link/duplicate-items/), [Transactions pagination](https://plaid.com/docs/errors/transactions/), [cached account balances](https://plaid.com/docs/api/accounts/), [Liabilities](https://plaid.com/docs/api/products/liabilities/), [webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/), [personal finance categories](https://plaid.com/docs/transactions/pfc-migration/).

### Connecting imported history

Account refresh may adopt an imported manual account in place when its source label, last four digits, type, and currency uniquely match the incoming account in both directions. It never automatically adopts closed accounts or guesses from a mask alone. The original account ID, name, transaction annotations, and older balance history remain; live balances and provider IDs are applied, then the ordinary spreadsheet/posted-transaction matcher handles overlapping history. Uncertain matches retain the existing explicit account-merge path.

## Choosing a service

The account dialog presents the service first. Configured, eligible Plaid users choose checking/cards or investments only after selecting Plaid; those modes request different Plaid products. SimpleFIN and [Lunch Flow](lunchflow.md) review account types after reading their own connected accounts. Institutions displays one overall empty state and existing provider connections, without claiming Plaid is unavailable merely because it has no items.
