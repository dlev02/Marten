# Investments

The Investments page shows cached investment account value, current holdings,
reported cost basis, allocation by account or security type, and investment
activity. It uses existing Plaid connections, SimpleFIN position snapshots, and the explicitly labeled sample
workspace. It does not place trades or fetch live quotes.

## Financial meaning

- Account balances remain the source of net worth. Holdings explain those
  balances and are never added again.
- The historical chart is account value, including deposits and withdrawals.
  It is not time-weighted or money-weighted return. A date is shown only after
  every selected USD account has a saved balance; pre-range balances supply the
  baseline. A growing subset of accounts cannot appear as portfolio growth.
- Unrealized gain is current holding value minus the institution's reported
  total cost basis. Missing basis remains unknown. Coverage uses absolute USD
  position value; foreign and unknown currencies are excluded from USD totals.
  Zero or short-position basis does not produce a misleading gain percentage.
- Quantity and unit price preserve fractional precision. Total monetary amounts
  use integer cents. Valuation date and last sync are visible in holding details.
- Allocation uses reported security types, without looking through funds to
  their underlying assets. A difference between holdings and account value is
  disclosed without manufacturing a cash position.
- Investment activity is stored separately from spending transactions. The UI
  reverses Plaid's amount sign to display positive cash inflows and negative
  outflows. Cancellation records remain visible; superseded/missing provider
  records are retained internally but omitted from current activity.

## Ingestion and storage

[The sync helper](../convex/lib/investmentSync.ts) calls cached
`/investments/holdings/get` and paginates `/investments/transactions/get` over a
requested two-year window with a maximum page size of 500. Actual history and
cost-basis availability depend on the institution. No paid on-demand
`/investments/refresh` or live quote endpoint is called.

All pages must load and validate before [one atomic
mutation](../convex/investmentInternal.ts) publishes the snapshot. A changed
pagination total, duplicate event, invalid identifier, unresolved account or
security, expired sync lease, or provider failure preserves the previous
investment snapshot. The ordinary bank sync can still publish account balances
and spending transactions while reporting an investment-specific warning.
Existing verified webhooks and the six-hour catch-up cron request the same sync.

The four owner-scoped tables are `investmentSecurities`, `investmentHoldings`,
`investmentTransactions`, and `investmentSyncStates`. Stable account/security
pairs preserve holding IDs across refreshes; provider transaction IDs prevent
duplicate activity. Cancellation references can cross pages or fetched windows.
The bounded implementation allows up to 1,000 holdings, 2,000 retained securities,
and 5,000 retained activity records per connection. Exceeding a limit preserves
the previous snapshot and explains the limit. It does not silently truncate.
The history query permits 12,000 balance rows and asks for a shorter range if
that limit is exceeded.

[Public queries](../convex/investments.ts) require authentication and verify
selected account ownership. They return safe connection metadata, never Plaid
access tokens. All-active excludes hidden/closed accounts; explicitly selecting
an owned hidden/closed account permits inspecting its saved history.

The sample mutation runs only for a sample profile, seeds fictional securities
idempotently, and makes each account's holdings reconcile exactly to its sample
balance. Clearing sample data removes the four investment tables as well.

## Verification

The focused suite covers normalization and fractional precision, unknown/zero
basis, currency exclusion, anchored month-end ranges, idempotent snapshots,
rollback on invalid/duplicate positions, cross-window cancellation, stale sync
leases, ownership, complete history coverage, sample reconciliation, all-page
publication, and later-page failures. See [the verification
record](verification.md) for observed command and browser results. Mocked provider
tests do not establish a real brokerage connection or real institution coverage.

## SimpleFIN position coverage

The base [SimpleFIN protocol](https://www.simplefin.org/protocol.html) does not
specify holdings. Marten accepts the Bridge extension's `id`, `description`,
`symbol`, `shares`, `market_value`, and `currency` when a complete array validates.
It derives unit price from market value divided by nonzero quantity;
`purchase_price` is never used as a current quote. `cost_basis` is not assumed to
mean total rather than per-share basis, and `created` is not a quote timestamp.
The UI explicitly leaves basis, gains and security price history unavailable.

The same bank sync publishes each complete account snapshot atomically under
the connection's lease and ownership checks. IDs remain stable. Missing or
malformed arrays, invalid/duplicate positions, and provider errors preserve the
last positions. A valid empty array removes the previous SimpleFIN positions.
When an account moves to SimpleFIN, the overview excludes preserved Plaid
positions for that account to avoid double counting. Account balances remain
the sole source of net worth. SimpleFIN investment activity is not imported into
the investment activity table. Sync SimpleFIN through Bank connections.

Validation uses fictional provider fixtures, including full import/sync and
malformed-snapshot rollback. Real brokerage coverage has not been verified.

## Gain/loss review — September 12, 2026

Traced Plaid `institution_value` and `cost_basis` through `normalizePosition`
into `investmentMetrics`: gain is reported value minus reported total basis.
The [current Plaid reference](https://plaid.com/docs/api/products/investments/)
confirms that `cost_basis` is total acquisition cost, not per-share cost. Demo
values come from the fictional investment sample. No gain arithmetic changes
were needed; existing tests cover incomplete basis and excluded currencies.
This review does not establish live institution accuracy or portfolio returns.
