# Investments: provider research and implementation proposal

Reviewed September 10, 2026. This is a proposal for the newly requested Investments page; it does not describe an implemented holdings subsystem. Existing account balances and Plaid Link modes are already present. No trades, new account connections, provider registrations, or paid services were initiated for this research.

## Recommendation

Extend the existing Plaid integration first. Build a read-only page showing investment accounts, holdings, allocation, available cost basis, investment activity, and clearly dated valuations. Keep orders, transfers, investment advice, and tax reporting outside this implementation. A separate market-data vendor is unnecessary for the first useful version.

Plaid's current [Trial plan](https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan) includes **Investments and Investments Refresh**. It permits ten production Items over the account's lifetime; an Item represents a user's connection to an institution, rather than each individual account inside that connection. Removing an Item does not restore capacity. API calls for existing Items are uncapped. Trial requires accepting Plaid's standard agreement and excludes Consumer Report Access. Upgrading to paid Production is irreversible. These are published plan terms, not confirmation of remaining capacity or institution-specific access in Marten's account.

The current app's transactions and investments Link-token modes both successfully returned production Link tokens during the September 10 review. This confirms those configuration paths; it does not prove brokerage consent, holdings availability, or a complete investment sync. Reuse existing eligible Items and update consent where necessary rather than creating duplicate connections.

## Data that Plaid supplies

[Investments](https://plaid.com/docs/investments/) supplies holdings, security information, and investment activity. Investment history can reach 24 months, subject to available institution data. Initialization can take one to two minutes. Updates normally arrive at least once per market day, sometimes two to four times depending on the institution; many holding changes appear overnight. This is not a streaming quote feed. Retain provider valuation dates and display last successful sync separately.

The [API contract](https://plaid.com/docs/api/products/investments/) matters for implementation:

- `/investments/holdings/get` returns holdings and related securities. A holding identifies its account/security, quantity, institution value and price, currency, valuation timestamps, and nullable cost basis. Cost basis is the **total holding basis**, not a per-share price. Available tax lots may be empty.
- Securities may provide name, ticker, identifiers, type, close price, and its date. A security ID can change following corporate actions; a ticker is not a stable primary key.
- `/investments/transactions/get` returns account/security references, provider transaction ID, date, amount, fees, price, quantity, type/subtype, and cancellation reference. Fetch every page using count/offset and the reported total; the maximum page count is 500.
- Investment transaction signs describe movement: purchases are generally positive outflows and sales negative inflows. Preserve the provider type and sign rather than treating every sale as household income or every purchase as spending.

## Link consent and synchronization plan

The existing [Plaid action](../convex/plaid.ts) already puts `investments` in `products` for the brokerage flow and in additional consent for the transactions flow. It currently imports cached account balances and ordinary transactions/liabilities, not holdings or investment activity.

Under Plaid's [product initialization model](https://plaid.com/docs/link/initializing-products/), consent and product initialization are distinct. Additional consent permits later initialization where supported; it is not proof that every account supports the product. Check Item consent and availability, surface an update-Link requirement when needed, and do not silently create a new Item after a product error.

Proposed sequence:

1. Reuse authenticated ownership checks, stored Item environment, safe errors, and the current sync lease/version fencing.
2. Fetch account metadata and the complete holdings/security response. Normalize and validate the response before replacing the last successful snapshot. A failed or incomplete fetch must preserve that snapshot with a visible stale/error state.
3. Import the initial available investment activity range, page to completion, and upsert by provider transaction ID. Keep it in its own table. Cancellation references must remove the canceled event from derived totals without deleting its audit provenance.
4. Extend the verified webhook dispatcher for `HOLDINGS` and `INVESTMENTS_TRANSACTIONS` updates. Fetch the affected activity window and reconcile it only after all its pages succeed. Keep periodic catch-up sync as a fallback. Plaid documents the [integration and webhook flow](https://plaid.com/docs/investments/add-to-app/).
5. A normal Sync button should read Plaid's latest cached data. If adding a separate provider refresh, verify the actual account's entitlement before calling `/investments/refresh`, and wait for its asynchronous update rather than claiming immediate new prices. Trial currently includes refresh; the app must not assume an eventual paid plan has identical billing.

## Proposed storage model

These are suggested Marten fields and ownership boundaries, not a transcription of provider objects. Keep access tokens exclusively in `plaidItems` and public reads scoped to the authenticated user.

| Table                    | Proposed content and identity                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `investmentSecurities`   | `userId`, `itemId`, provider security ID, name/ticker/type, optional identifiers, currency, nullable close price and price date. Index by Item and provider security ID. Scope imported metadata to its Item to avoid cross-user association mistakes.         |
| `investmentHoldings`     | `userId`, `itemId`, local `accountId`, security reference, quantity, value in cents, nullable basis in cents, precise unit price, currency, provider valuation date/time, `syncedAt`. Identity is Item/account/provider-security within the complete snapshot. |
| `investmentTransactions` | `userId`, `itemId`, local account, provider event ID, optional security, date, raw type/subtype, amount/fees in cents, quantity/unit price, optional cancellation reference and canceled status. Index for owner/account/date and Item/event ID.               |
| `investmentSyncState`    | Last successful holdings/activity times, requested/completed history window, completeness/error state, and revision used to publish an authoritative snapshot. May live on the existing Item if that keeps ownership/fencing simpler.                          |

Reuse existing account balance snapshots for an account-value chart. Do not duplicate those balances into net worth by adding holding values again. Add per-holding historical snapshots only if a later feature requires them; current holdings do not reconstruct historical positions automatically.

Amounts used in totals follow Marten's integer-cent convention. Quantities and unit prices retain fractional precision and must not be rounded to cents before computing or displaying units. Prefer the institution-reported holding value for valuation. Preserve unknown cost basis and price dates as unknown; never replace missing values with zero. Keep non-USD or unofficial currencies separate from USD totals until an explicit FX model exists.

A bounded complete snapshot can be published in one internal mutation after validating its size. If it exceeds measured transaction limits, preserve the old snapshot and report the limit. A later staged-generation implementation must switch the active version only when complete; never prune old holdings halfway through a failed import.

## Honest allocation and performance

The initial page can reliably show a current holdings table and allocation by account, provider security type, and individual holding. Unknown classifications need an explicit bucket. Do not call a fund's sector label its underlying asset allocation; that requires look-through data. Cash equivalents, short positions, margin debt, and differences between account totals and summed holdings need explicit treatment. A signed bar/table is preferable to a misleading pie chart when values can be negative.

Use **unrealized gain/loss** for current value minus known basis. Show basis coverage when only some holdings have it; exclude unknown basis from the gain calculation, and suppress percentage gain where the denominator is zero or unsuitable. This is neither lifetime total return nor a return over the selected chart period.

An account-value chart may begin with existing snapshots and should be labeled as value, with contributions and withdrawals affecting it. Do not infer investment performance from its slope. Total-return or money/time-weighted performance requires complete opening valuations, cash-flow classification, distributions, fees, transfers, and corporate-action handling. Until those inputs are sufficiently complete, show the missing-data explanation rather than a fabricated return. A current snapshot plus two years of transactions does not by itself establish accurate historical holdings or daily performance.

Focused verification should cover owner isolation, missing basis, fractional shares, cash/short positions, unsupported currencies, duplicate/canceled events, complete pagination, empty authoritative snapshots, failed sync preservation, and account/holding double-counting. Browser QA should exercise initial sync, stale/error states, account filtering, table sorting, and narrow layouts using fictional fixtures before authorized live holdings.

## Optional market data later

[Alpha Vantage](https://www.alphavantage.co/support/) currently offers a free standard allowance of 25 requests per day. Its [premium documentation](https://www.alphavantage.co/premium/) distinguishes additional entitlement for real-time/delayed US data and other premium datasets. It could support a small explicitly chosen benchmark or security-history feature, but is not required for Plaid holdings and should not be added as an assumed free real-time portfolio feed. No API key was requested or configured.
