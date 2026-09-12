# Recurring schedules and manual statement reminders

Research and implementation checked September 11, 2026.

## Why this model

Monarch's current [recurring-expense help article](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills) documents one recurring transaction per merchant. Its workaround creates alternate merchants and transaction rules. A [December 2025 Reddit report](https://www.reddit.com/r/MonarchMoney/comments/1pwby0s/amazon_reoccuring_merchant_issues/) describes the concrete Amazon case: a Prime membership makes ordinary Amazon purchases appear recurring. This is user-reported behavior, consistent with the documented merchant restriction; it does not establish that every current Monarch account behaves identically.

The existing Marten model already stored an amount, account and frequency per recurring row. It did not mark merchants recurring. Its actual limitation was detection: one merchant/account group used the latest purchase as its amount anchor, and any existing schedule suppressed every further suggestion for that merchant/account. The editor also lacked a schedule name and the transaction drawer had no schedule action.

## Implemented contract

- Every schedule has its own display name. Legacy rows fall back to the merchant name. Creating a schedule from a transaction preselects its merchant, account, category, amount and date.
- Transaction matches require the same merchant, account, payment direction and amount, within three days of an occurrence. Exact amount is the default. The editor optionally allows a bounded amount difference and a case-insensitive original-statement substring. Pending, hidden, removed and paused items do not match. A match is a candidate association; it does not mark the schedule paid. Multiple candidate schedules are shown as ambiguous.
- Detection groups close amounts before examining cadence, so alternating $16.07/$16.08 charges remain one pattern. It checks weekly, every-two-weeks, monthly, quarterly, and yearly calendar spacing with a small posting-date allowance. Most cadences need three observations; yearly suggestions can start with two and remain medium confidence. A single missing cycle is tolerated, but at least 70% of similar purchases within the observed span must fit the pattern. Frequent everyday purchases, stale patterns, future rows, transfers, hidden/pending/removed transactions, and separate payment directions are excluded. Existing schedules suppress only their matching amount/account/statement pattern. Suggestions show the observed date range, count, and amount variation, and every suggestion still requires review. This is deterministic logic and uses no AI or external transaction analysis.
- Detection scans up to 2,000 recent transactions and stops at 100 suggestions. Results are marked incomplete when older transactions were excluded or detection stops at the suggestion cap; the UI and agent tools must not present these results as every recurring pattern. Suggestions remain subject to review before saving.
- Existing occurrence IDs, paid checkmarks and near-term cash forecast semantics are preserved. Names flow to the recurring list/calendar, dashboard, transaction drawer/list and near-term forecast.
- Credit-card statement reminders are a separately owned optional object on the account. Date and optional statement/minimum amounts can be entered even when the bank supplies none. The displayed source says “Entered by you.” Bank refresh updates provider fields without overwriting this object; removing it reveals any bank-provided details again. This is a reminder for one statement, updated by the user each cycle. It does not create a payment or a second cash forecast outflow. Opt-in [payment reminders](reminders.md) can now notify in the browser while Marten is open, or by verified email while it is closed. Statement cards have an explicit paid checkmark, scoped to that due date, which suppresses delivery without changing the financial data.

Monarch's [bill-syncing guide](https://help.monarch.com/hc/en-us/articles/29446697869076-Getting-started-with-bill-syncing) describes a separate credit-report-based integration and manual due-date/amount editing. Marten uses its existing Plaid fields plus explicit local reminders; this change adds no provider or credit enrollment.

## Verification

Focused tests exercise unrelated Amazon amounts, refunds, accounts, statement text, dates, pending/hidden/removed items, paused schedules, explicit amount tolerance and month ends; multiple recurring amounts at one merchant; mutation validation and owner isolation; manual reminder save/clear; and preservation through the real Plaid account-refresh mutation.

The subsequent September 11 recurring/reminder pass added cadence coverage for one-cent changes, weekly/biweekly/quarterly/yearly histories, February month ends, a missed cycle, unrelated purchases, stale patterns, and future rows. The focused backend run passed 30 tests across `recurringDetection`, `recurringMatching`, `recurringFilters`, and `reminders`; six separate native browser API tests passed. Delivery tests use mocked email/browser APIs. See [reminders.md](reminders.md) for consent, time-zone, deduplication, paid-state, and delivery limits.

Development deployment accepted the schema and functions at 00:39:51 America/Chicago on September 11. TypeScript project checks and affected-file ESLint passed. The five new recurring tests passed; the existing recurring-filter, account and Plaid suites also passed (33 existing tests).

Browser checks used the fictional Morgan QA workspace. Creating “Amazon Prime QA” from a transaction preserved the selected merchant/account/date and displayed the new matching schedule in the drawer. Changing its amount from $53.94 to $16 immediately removed that match from the $53.94 purchase, while Recurring showed the separate $16 monthly schedule with its checkmark still unpaid. A manual card reminder saved September 22, $320 statement and $25 minimum, displayed “Entered by you,” and reopening its editor retained all three values. The reminder layout was inspected in a rendered desktop screenshot. Live bank connectivity is not inferred from this sample-data check; refresh preservation is covered by the backend mutation test above.

## Real-life scenario review — September 12, 2026

Detection now retries an exact-amount cadence when a broad amount cluster
contains multiple overlapping subscriptions. Two $5/$6 monthly subscriptions
previously hid each other; they now produce distinct suggestions. Alternating
one-cent variations still produce one schedule. Tests also cover Amazon orders
and refunds beside Prime, a restart two days later, a card change, stale canceled
services, and an introductory annual price doubling.

- Card changes: edit the account on the existing schedule. Detection never
  silently merges accounts; repeated new-card charges can eventually produce a
  suggestion requiring review. Editing applies to the whole schedule and may
  change old automatic matches. Posted transactions stay on their real accounts.
- Cancellation: pause to keep the saved row in Paused and remove it from the
  calendar/runway. This is not service cancellation. Actual old charges remain
  in Transactions; there is no separate dated subscription-lifecycle history.
- Restart: resume and update the start date as needed. A two-day shift fits
  the three-day matching window; a paused schedule remains paused until edited.
- Multiple subscriptions: separate names, amounts, and optional statement text
  distinguish them. Identical merchant/account/amount/date/text is inherently
  ambiguous; the app cannot infer which creator was paid.
- Introductory/future pricing: one $50 charge does not establish that next year's
  charge is $100. Update the expected amount when the new price takes effect,
  and record the future price in Notes. There is no effective-dated price field.

Current automatic payment matching (implemented in the existing checkout)
requires a unique posted-transaction/occurrence match in both directions. Manual
paid/unpaid choices override it. This supersedes the earlier manual-only
checkmark description above; neither path sends payments. The shared merchant
editor is now reachable from each recurring editor and transaction drawer.
