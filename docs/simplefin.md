# SimpleFIN Bridge connections

Implemented September 11, 2026, replacing the earlier Sophtron pilot. SimpleFIN
Bridge is a low-cost aggregator subscription that a user buys directly. It links
their banks once and shares balances and posted transactions with any app the
user approves through a one-time **setup token**. Marten never sees bank
passwords, and the same Marten deployment can serve any number of users, each
with their own SimpleFIN subscription and token.

## For hosted-site users

If you use Marten on someone else's deployment, such as the hosted Marten site,
SimpleFIN is how you connect your banks. You keep your own SimpleFIN Bridge
subscription and your bank logins stay in the bridge; Marten never sees them.
The only thing Marten stores is the access URL the bridge issues when you paste
your setup token, and when the operator has set `CREDENTIALS_KEY` that URL is
sealed so it never appears in plain form in the database, dashboard, or
backups. You can revoke Marten's access at any time in the bridge, and
**Remove** in Marten forgets the connection while keeping the history you
imported.

## What a user does

1. Subscribe at [SimpleFIN Bridge](https://beta-bridge.simplefin.org/) and link
   the banks to include. The bridge advertises $1.50 + tax per month or $15 +
   tax per year for up to 25 institutions and 25 apps. Prices belong to
   SimpleFIN and can change; Marten shows them only as an approximation.
2. In the bridge, create a new app connection and copy the setup token.
3. In Marten, open **Add account → Continue with SimpleFIN** or **Settings →
   Bank connections → Connect SimpleFIN**, paste the token, then review the
   linked accounts: choose each account's type, map it to an existing Marten
   account when switching providers, pick the history start date, and confirm.
4. Marten imports again once a day and whenever the user chooses **Import
   latest**. Revoking the app in SimpleFIN Bridge stops the bridge from sharing
   data; **Remove** in Marten forgets the token and keeps the imported history.

## Protocol and storage

The client in [`convex/lib/simplefinApi.ts`](../convex/lib/simplefinApi.ts)
follows the [SimpleFIN protocol](https://www.simplefin.org/protocol.html):

- A setup token is a base64 claim URL. Marten requires `https`, refuses
  credentials, query strings, IP literals, and local hostnames, then sends one
  `POST` with an empty body. The response body is the **access URL** with Basic
  credentials embedded. The claim works exactly once, so the URL is stored
  before the first data request; a failed preview leaves a retryable
  connection instead of burning the token.
- The access URL is stored in `simplefinConnections`, one row per user. When
  the deployment operator sets `CREDENTIALS_KEY` (32 random bytes, base64), the
  URL is sealed with AES-256-GCM by
  [`credentialCrypto.ts`](../convex/lib/credentialCrypto.ts) so it never appears
  in plain form in the database, dashboard, or backups. Without the key it is
  stored as received, the same posture as Plaid access tokens. Public functions
  never return it; status reports only the host and whether it is sealed.
- Data comes from `GET {access}/accounts` with `start-date`, `end-date`
  (exclusive, so Marten adds a day), `account` filters for the selected accounts,
  and `balances-only=1` for previews. Requests use a 30-second timeout, a 10 MB
  body limit, and never follow redirects.
- The bridge recommends at most 45 days per request and roughly daily reads.
  Marten fetches history in 45-day windows (up to about five years on a first
  import), re-reads a 5-day overlap on later imports, and runs one catch-up per
  connection per day at 09:17 UTC. Connecting is rate limited per user.

## Supported data and conventions

- **Accounts**: SimpleFIN provides no account type. The review screen guesses
  from the name (checking/savings → cash, card names → credit, mortgage/loan →
  loan, holdings or retirement words → investment) and the user confirms.
  Balances are signed from the owner's view, so credit and loan balances are
  inverted into Marten's amount-owed convention. Available balances and the
  balance date are kept; the institution name comes from the bridge's `org`.
- **Transactions**: positive SimpleFIN amounts are deposits, so Marten negates
  them (outflows positive). Dates use `transacted_at`, then `posted`, as UTC
  calendar dates. Pending records are counted and skipped; the protocol does not
  link a pending record to its posted version, and missing records are not
  treated as deletions. Merchant names use `payee` when present, cleaned by
  [`merchantNames.ts`](../convex/lib/merchantNames.ts).
- **Categories**: the bridge passes through merchant category codes (`mcc`).
  Broad, unambiguous codes map to an existing category name (Groceries,
  Restaurants, Gas, Transport, Travel, Utilities, Internet, Health,
  Entertainment, Shopping); obvious transfers and payroll descriptions map to
  Transfers or Income. Everything else starts uncategorized and runs through the
  user's ordered rules.
- **Holdings**: the bridge returns a `holdings` array for investment accounts.
  Marten imports a complete array of identifiable positions into Investments,
  preserving fractional quantities and reported market values. Unit price is
  value divided by quantity. Missing/malformed arrays and provider errors retain
  the previous positions; an explicit valid empty array clears them. Total
  basis and quote dates remain unknown because the extension does not establish
  their semantics. See [investments](investments.md).
- **Provider errors**: the protocol says apps must show the `errors` list to
  users. Marten stores it on the connection and shows it on the Bank connections
  card and after each import.
- USD only. Non-USD accounts appear as unavailable in the review screen.

## Mapping, retries, and stopping

Existing manual accounts and accounts whose Plaid item is disconnected may be
mapped when the type matches. Where imported spreadsheet history overlaps the
SimpleFIN range, ingestion adopts an unlinked spreadsheet row on the same
account with the same amount within three days (nearest date, then matching
statement text) instead of inserting a twin: the row gains the provider ID,
date, and statement text and keeps its merchant, category, notes, tags,
receipts, and review state. Other overlapping history from a different source
should still end before the SimpleFIN start date. External transaction identity
is scoped to the mapped Marten account; a retry updates the same row and keeps
notes, tags, categories, review state, hidden state, receipts, and activity. A corrected amount that invalidates saved splits
keeps them as a review draft. Bank-managed date, amount, and account edits stay
disabled, as with Plaid.

Every write is fenced by the connection's sync version and a two-minute lease.
**Stop imports** ends future reads and keeps everything imported. **New token**
replaces the access URL in place, so mapped accounts keep their identity.
**Remove** deletes the connection row and turns its accounts into manual
accounts.

Limits: 25 accounts per import, 200 accounts per bridge response, 20,000
transactions per account response, 100 rows per write batch.

## Hosting model

Because each user supplies their own subscription token, SimpleFIN works both on
a self-hosted Marten and on a shared Marten hosted by someone else. Plaid stays
tied to the deployment's own Plaid credentials and its Trial connection quota,
which makes it suitable only for the operator's household. See
[bank provider options](bank-provider-options.md) and the
[self-hosting guide](self-hosting.md).

## Verification

`npx vitest run convex/simplefin.test.ts` covers token decoding and host rules,
decimal and date parsing, 45-day windows, kind guessing, signed balances and
amounts, MCC categories, one-time claims with sealed storage, redaction of the
access URL, rate limiting, reviewed imports, retries that keep annotations and
split drafts, provider-switch cutover, stop/remove fences, and the account
limit. `credentialCrypto.test.ts` covers sealing.

On September 11, 2026 the connect flow was exercised end to end in the browser
against the public SimpleFIN demo bridge from a fictional QA workspace: the demo
setup token was claimed, three demo accounts previewed, two imported with 344
posted transactions across the 90-day default range, MCC categories applied, and
the bridge's "recommended range of 45 days" notice surfaced on the connection
card (which led to the 45-day window). No real bank or subscription was used.
