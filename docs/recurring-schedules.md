# Recurring schedules and manual statement reminders

Research and implementation checked September 11, 2026.

## Why this model

Monarch's current [recurring-expense help article](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills) documents one recurring transaction per merchant. Its workaround creates alternate merchants and transaction rules. A [December 2025 Reddit report](https://www.reddit.com/r/MonarchMoney/comments/1pwby0s/amazon_reoccuring_merchant_issues/) describes the concrete Amazon case: a Prime membership makes ordinary Amazon purchases appear recurring. This is user-reported behavior, consistent with the documented merchant restriction; it does not establish that every current Monarch account behaves identically.

The existing Marten model already stored an amount, account and frequency per recurring row. It did not mark merchants recurring. Its actual limitation was detection: one merchant/account group used the latest purchase as its amount anchor, and any existing schedule suppressed every further suggestion for that merchant/account. The editor also lacked a schedule name and the transaction drawer had no schedule action.

## Implemented contract

- Every schedule has its own display name. Legacy rows fall back to the merchant name. Creating a schedule from a transaction preselects its merchant, account, category, amount and date.
- Transaction matches require the same merchant, account, payment direction and amount, within three days of an occurrence. Exact amount is the default. The editor optionally allows a bounded amount difference and a case-insensitive original-statement substring. Pending, hidden, removed and paused items do not match. A match is a candidate association; it does not mark the schedule paid. Multiple candidate schedules are shown as ambiguous.
- Detection inspects distinct amount patterns and suppresses only an existing matching pattern. Variable-bill suggestions use their observed amount variation and cannot borrow rows already covered by another schedule. Every suggestion requires review.
- Existing occurrence IDs, paid checkmarks and near-term cash forecast semantics are preserved. Names flow to the recurring list/calendar, dashboard, transaction drawer/list and near-term forecast.
- Credit-card statement reminders are a separately owned optional object on the account. Date and optional statement/minimum amounts can be entered even when the bank supplies none. The displayed source says “Entered by you.” Bank refresh updates provider fields without overwriting this object; removing it reveals any bank-provided details again. This is a reminder for one statement, updated by the user each cycle. It does not create a payment, notification, or a second cash forecast outflow.

Monarch's [bill-syncing guide](https://help.monarch.com/hc/en-us/articles/29446697869076-Getting-started-with-bill-syncing) describes a separate credit-report-based integration and manual due-date/amount editing. Marten uses its existing Plaid fields plus explicit local reminders; this change adds no provider or credit enrollment.

## Verification

Focused tests exercise unrelated Amazon amounts, refunds, accounts, statement text, dates, pending/hidden/removed items, paused schedules, explicit amount tolerance and month ends; multiple recurring amounts at one merchant; mutation validation and owner isolation; manual reminder save/clear; and preservation through the real Plaid account-refresh mutation.

Development deployment accepted the schema and functions at 00:39:51 America/Chicago on September 11. TypeScript project checks and affected-file ESLint passed. The five new recurring tests passed; the existing recurring-filter, account and Plaid suites also passed (33 existing tests).

Browser checks used the fictional Morgan QA workspace. Creating “Amazon Prime QA” from a transaction preserved the selected merchant/account/date and displayed the new matching schedule in the drawer. Changing its amount from $53.94 to $16 immediately removed that match from the $53.94 purchase, while Recurring showed the separate $16 monthly schedule with its checkmark still unpaid. A manual card reminder saved September 22, $320 statement and $25 minimum, displayed “Entered by you,” and reopening its editor retained all three values. The reminder layout was inspected in a rendered desktop screenshot. Live bank connectivity is not inferred from this sample-data check; refresh preservation is covered by the backend mutation test above.
