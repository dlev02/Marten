# Marten

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Drew and his family, primarily his dad. They want to understand everyday money
and explore future choices without maintaining several disconnected tools.
Laptop and iPad use are primary; a usable phone layout is also expected.

## Product Purpose

Bring account balances, transactions, recurring obligations, and financial
planning together in a clear personal app. A finished experience includes real
data persistence, working imports and attachments, and truthful calculations.

## Operating Context

The existing spreadsheet workflow includes merchant, amount, date, and notes,
with roughly five or six columns. Excel and CSV imports must make those columns
easy to map, preview, and validate. Intended banks include Chase, American
Express, and Charles Schwab. Brokerage and IRA balances belong in net worth.

Planning questions include the number and cost of annual trips, the savings
needed to afford them, retiring at different ages, assumed investment growth,
and how long available funds might last.

## Capabilities and Constraints

- React web client with authenticated Convex storage and functions. Separate
  users own separate workspaces. Shared household access is not yet implemented.
- Plaid is the current bank-data provider. Use its existing Trial entitlements
  and preserve the limited lifetime connections. A successful configuration or
  synthetic test is not proof of live institution coverage.
- Core areas are Dashboard, Accounts, Transactions, Recurring, Cash Flow,
  Reports, and organization/preferences settings.
- The September 11 scope adds Forecasting and a read-only Investments page.
  Forecasts must distinguish recorded activity from assumptions and show how
  results were calculated. Investment values and unrealized gains are different
  from time-period returns.
- Credit scores are being evaluated through official providers and user-supplied
  documents. Do not fabricate a live score feed or conflate bureau/model histories.
- AI is a later capability. Trading, public financial advice, and tax filing
  are outside the current implementation.
- Netlify is an intended hosting option; public publication is a separate step.

## Brand Commitments

The name is Marten, chosen at Drew’s request to replace the temporary Folio name.
The identity uses a curled marten silhouette and muted blue accents. Monarch
Money, Origin, and Copilot inform product interactions; the brand and code are
original. Preserve calm neutral surfaces and clear financial views.

Use concise, direct copy. Avoid redundant reassurance and implementation details
in ordinary product flows. Keep all settings discoverable through search.

## Evidence on Hand

[Requirements](docs/requirements.md), [design system](docs/design/system.md),
[forecasting research](docs/forecasting-research.md),
[investments research](docs/investments-research.md), and
[verification](docs/verification.md) record product contracts and observed checks.
Generated concepts and QA fixtures use fictional finances. Private competitor
screenshots and linked account data must not become sample data or public assets.

## Product Principles

1. Make familiar tasks easy and financial calculations inspectable.
2. Preserve money, dates, account ownership, and source provenance.
3. Complete features through real UI interaction and focused verification.
4. Refine useful details proactively; added complexity must earn its place.
5. Work autonomously within the user's authorized project scope, as described
   in [AGENTS.md](AGENTS.md).

## Accessibility & Inclusion

Support keyboard navigation, clear focus and labels, reduced motion, both
appearance modes, and touch-friendly tablet controls. Do not make chart color
or hover the only way to obtain a financial value.
