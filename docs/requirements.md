# Marten requirements and financial contracts

Marten is a personal finance application for Drew's dad. The interface follows the familiar Monarch Money organization while using the Marten name and its own implementation. React renders the web client; Convex owns authenticated application data and business logic. Plaid is the primary bank provider. Sophtron is an optional personal-deployment import with explicitly documented coverage limits.

This document defines scope and acceptance criteria. A listed feature is a requirement, not evidence that its UI, backend, and live provider path have all been verified. See [verification.md](verification.md) for validation evidence and external blockers.

## Feature matrix

| Area               | Required behavior                                                                                                          | Acceptance check                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Authentication     | Email/password sign-in, sign-out, persistent authenticated session, separate user data                                     | Signed-out access fails; a second user cannot read or mutate the first user's records                        |
| Dashboard          | Financial overview, account/net worth context, cash flow, recent transactions, recurring obligations, configurable widgets | Figures reconcile to Accounts, Transactions, and the same report date range                                  |
| Accounts           | Institution grouping, account detail, balances, assets/debts, net worth history and exclusions                             | Brokerage and IRA balances count unless excluded; liabilities reduce net worth                               |
| Transactions       | Search, date/account/category/merchant/tag filters, review/pending/hidden state, sorting, pagination, detail editing       | Filter results and saved edits persist across refresh; inaccessible IDs fail on the server                   |
| Transaction detail | Merchant, category, date, amount, notes, tags, receipt attachments, split allocations, activity                            | Split sums equal the parent amount exactly; each linked record and attachment is owned by the same user      |
| Bulk actions       | Multi-select edits and removal with explicit selection                                                                     | All selected IDs are validated; a mixed-owner batch cannot partially alter authorized rows                   |
| Rules              | Ordered matching, enable/disable, all/any conditions, preview, apply actions                                               | Preview matches actual application; order is deterministic and references remain valid after merchant merge  |
| Recurring          | Named schedules, account/amount/date/text matching, calendar/list, detection, payment state                                | Month-end and leap-date anchors remain stable; predictions are visibly distinct from posted transactions     |
| Liabilities        | Available provider statement data and separately labeled manual due-date/amount reminders                                  | Missing provider fields remain absent; they are not invented or shown as zero owed                           |
| Cash Flow          | Income, spending, net cash flow, time range, category breakdown                                                            | Transfers, hidden transactions, and pending transactions do not inflate income/spending                      |
| Reports            | Income/spending/net-worth views, grouping and chart controls, saved report choices                                         | Totals use the same signed cents, split, transfer, and visibility rules as Cash Flow                         |
| Categories         | Income/expense/transfer groups, custom categories, group/category ordering, enable/disable                                 | Reordering persists and rejects foreign IDs; group kind determines report treatment                          |
| Merchants          | Names, logos, merge                                                                                                        | Merge preserves transactions, recurring references, rule references, and searchable identity                 |
| Tags               | Create, edit, delete, assign/filter                                                                                        | Tags are user-scoped and stale references are cleaned up or safely rejected                                  |
| Institutions       | Plaid Link, connection status, refresh, reconnect/disconnect                                                               | Tokens stay on the server; bank actions use the authenticated owner                                          |
| Appearance         | Responsive layout, light/dark themes                                                                                       | Keyboard access, readable chart labels, dialogs, empty states, loading, and error states work in both themes |

| Credit scores | Manual observations and reviewed local PDF suggestions, separated by bureau/model | Valid 300–850 score and date, owner isolation, explicit review, no server-stored PDF |
| Demo | Isolated fictional workspace opened without an account | Reload retains demo; exit restores normal auth; guest bank actions reject server-side |
| Forecast | Saved long-term scenarios, trips, retirement ages, savings solver, yearly export, and short-term cash runway | Monthly money conservation, explicit assumptions, ownership/revision checks, current cash and unpaid schedules |
| Investments | Cached holdings, allocation, known-basis gain/loss, activity, and account-value history | Complete sync publishes atomically; values do not double count net worth; missing data remains unknown |

Budget, Goals, Advice, live credit-score feeds, and a support service are excluded. A searchable Help & FAQ is included. Agent access uses browser WebMCP and remote MCP with owner consent, read-only defaults, optional edits and revocation. It reuses the financial engines and does not require a model API key in Marten. Investments now includes cached account value, holdings, reported cost basis, allocation, and separate investment activity; see [the financial contracts](investments.md). Forecasting exposes assumptions and distinguishes actual data, expected activity, and modeled outcomes.

## Connected assistant and reminder contracts

- Browser tools register only after the signed-in personal-workspace owner enables access, and use the live authenticated session. Navigation/filter tools change the view; finance writes require the separate edit setting. Unsupported browsers retain the normal interface.
- Remote MCP uses OAuth with PKCE, short-lived access tokens, rotating refresh tokens and revocable 30-day grants. Tokens are hashed in storage. Grants are user- and resource-bound; read-only calls cannot execute edits. Do not expose credentials, private provider identifiers, receipt URLs or unrelated user records through tool results.
- Agents use the same annotation, recurring, report and forecast operations as the UI. Reports must be complete or refuse partial totals. Bank payments, trading, account deletion and provider consent are outside the tools.
- Browser reminders require native permission and run while a Marten tab is open. Email reminders require explicit enablement and verification of the signed-in address; delivery uses the configured email provider. Demo/sample workspaces do not deliver either channel.
- SimpleFIN Bridge connections belong to one user each and work on shared or self-hosted deployments. The user confirms account types and mappings before import. Cached balances, posted transactions, and validated position snapshots are supported. Coverage is not guaranteed; statement minimums, complete history, security price history and SimpleFIN total cost basis remain unavailable. Stopping imports retains cached history; revoke bank consent through SimpleFIN Bridge.

## Financial invariants

- Monetary amounts are integer cents. Conversion to display dollars happens at the boundary. Mutations reject fractional cents, non-finite values, and values outside the accepted safe range.
- Transaction amounts follow Plaid's sign convention: positive is money leaving an account; negative is money entering an account. A refund can therefore be a negative expense. The category group's kind determines whether an entry contributes to income, expense, or transfers. Cash-flow income is presented with its sign inverted; net cash flow is income minus spending.
- Asset balances contribute positively to net worth. Credit/loan debt balances reduce net worth. A debt refund/credit must retain its sign so it can increase net worth. `excludeNetWorth` explicitly removes an account from that calculation. Net worth is based on balances rather than transaction sums.
- A split has either no allocations or 2–50 allocations. Every allocation is an integer number of cents, and the signed sum must equal the parent amount exactly. Reports count the allocations instead of also counting the parent. Mixed transfer/expense splits retain their individual category treatment.
- Transfers do not contribute to income or spending. Their account balance effects still contribute to net worth. A credit card payment should not become a second expense after its purchases have already been recorded.
- Pending and hidden transactions are excluded from posted financial totals. The pending-edit preference controls detail editing before posting; it does not hide pending rows or make them posted income or spending. Hiding a transaction does not change a provider account balance.
- A posted transaction replacing a pending transaction must preserve intentional user annotations, tags, notes, merchant/category edits, review/visibility choices, attachments, and split intent where valid. Provider changes must not duplicate the pending and posted rows. When the posted amount changes, invalidated allocations move to `splitDraft`, active splits clear, and the transaction requires review. Reports use the authoritative posted amount while the original allocations remain available to reconcile.
- Plaid transaction identity and sync cursors make repeated syncs idempotent. Added, modified, removed, and pending-to-posted updates are handled together with annotation preservation. A cursor advances only after the complete fetched pagination loop has been applied successfully; partial imports replay idempotently from the prior cursor.
- Recurrence operates on calendar dates, not elapsed milliseconds. January 31 recurs on February's last day, then returns to March 31. Annual February 29 entries return to February 29 in leap years.
- All IDs used in relationships are checked against the authenticated user. Public callers cannot supply an authoritative owner ID. Private Plaid tokens never appear in public query results, browser state, or logs.
- Sample data is fictional and clearly labeled. No private transactions, balances, credentials, screenshots of real finances, or actual bank identities are copied into seeds or committed fixtures.

## Architecture

The browser uses the generated Convex API through an authenticated provider. Public queries and mutations derive the user from the verified auth context. Shared ownership helpers guard direct IDs as well as category, merchant, account, tag, rule, and attachment relationships. Server validation is authoritative; client validation improves feedback.

Convex tables store user profiles, accounts and balance history, category groups/categories, merchants, tags, transactions and split allocations, attachments, activity, rules, recurring schedules/payment state, saved report settings, forecast scenarios, investment holdings/activity/sync state, and private Plaid items. Indexes begin with the owner or an already validated parent relationship. Query results and bulk operations must remain bounded and disclose any range limits rather than silently claiming a partial financial total is complete.

Plaid requests run on the server. A short-lived Link token is handed to the browser; the resulting public token is exchanged on the server. Access tokens and sync cursor state stay in private records. The integration should use a guarded sync path and current provider responses for transaction, balance, and supported liability data. Neither mocked tests nor synthetic UI seed data establish a working connection to a real institution.

## Future Netlify release

The static build publishes `dist` with SPA fallback routing and `VITE_CONVEX_URL` pointing to the intended Convex deployment. Convex and Netlify deployment configuration must be separated between development and production. Authentication signing keys, allowed/redirect origins, Plaid environment and credentials, Plaid Link redirect registration when needed, scheduled refreshes, and any webhook endpoint must be checked for the final origin.

Before a public release, run the checks in [verification.md](verification.md), complete real institution consent and sync validation, confirm backups/export and disconnect behavior, and obtain publication authorization. No Netlify site, production backend, custom domain, provider approval, or real bank connection is presumed to exist.

## Lunch Flow and shared bank imports

[The Lunch Flow guide](lunchflow.md) covers user-owned API keys, account review, USD-only imports, underlying-provider display, supported holdings, limits and revocation. SimpleFIN and Lunch Flow coexist, one connection per service per user. The shared import engine preserves existing records and fences concurrent writes; legacy `simplefin*` storage names remain for compatibility, with explicit provider and transaction provenance. Plaid retains its existing allow-list and product-specific connection flow.
