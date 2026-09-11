# Sophtron personal imports

Reviewed and implemented September 11, 2026. This adapter is optional and disabled until the deployment operator configures it. Fixture checks and a rendered setup screen do not establish a working connection to any real institution.

## Setup

Use a personally operated Marten frontend and Convex deployment. One configured Sophtron customer is bound to one explicit Marten user. Family members who operate separate copies can configure their own credentials on their own backends; this implementation does not collect developer keys from users of a shared hosted deployment.

1. Create a [Sophtron account](https://sophtron.com/Account/Register) and review the [Developer Agreement](https://sophtron.com/developerAgreement). Its personal, noncommercial license and key-sharing restrictions do not establish permission for a shared hosted key-pooling service. See [bank provider research](bank-provider-options.md).
2. Use Sophtron's [official connection setup](https://docs.sophtron.com/) to create a customer and link the operator's accounts. Complete bank authorization and MFA in Sophtron's own flow. Marten's pilot imports existing linked accounts; it does not collect bank passwords or construct an undocumented widget token.
3. Obtain the API user ID and access key from [Developer settings](https://sophtron.com/Manage/Developer), and the linked customer's UUID from its V2 customer record. An API user can have several customers: configure the exact customer, never whichever customer happens to be returned first.
4. In the personal Convex deployment's environment settings, configure:

| Variable                 | Value                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `SOPHTRON_USER_ID`       | The operator's Sophtron API user UUID                                                          |
| `SOPHTRON_ACCESS_KEY`    | Its base64 Sophtron access key; keep this in server settings                                   |
| `SOPHTRON_CUSTOMER_ID`   | The UUID of the customer whose banks the operator authorized                                   |
| `SOPHTRON_OWNER_USER_ID` | The operator's Marten user ID, shown under Settings → Bank connections → Sophtron → View setup |
| `SOPHTRON_ENV`           | `production` (default) or `preview`                                                            |

Both Sophtron API environments use live bank data. The preview host is **not a fictional-bank sandbox**. No Sophtron environment values, real bank credentials, or consented financial data were configured during implementation.

5. In Marten, use **Add account → Import from Sophtron**, or **Settings → Bank connections → Sophtron → Review linked accounts**. Select accounts, choose an existing Marten account or explicitly create a new one, review the import start date, and confirm the balances and mapping.
6. For the first live import, compare balances, debt/refund signs, known transfers, transaction dates, history coverage, and freshness against the bank. Provider coverage and account-specific payload behavior require that consented check before this pilot can be relied on as a complete record.

## Supported data and review

- Current account balances are imported separately from available balances; available cash is not substituted for the investment account's current value. Brokerage/IRA balances can contribute to net worth without adding holdings values again.
- USD is the only supported currency. `USD` and `US$` are recognized. A bare `$` or absent currency requires the owner to confirm US dollars. Explicit foreign currencies remain unsupported even if that checkbox is selected.
- Sophtron's account schema does not define the sign of debt balances. Credit and loan imports require an explicit choice of positive-debt or negative-debt convention. The choice is stored for subsequent imports; a credit balance retains its sign after conversion.
- Only records explicitly marked `Posted`, with `DEBIT` or `CREDIT`, a valid date, and a valid amount are imported. DEBIT becomes positive outflow; CREDIT becomes negative inflow. Posted date is preferred, then date, then transaction date. Pending and unsupported records are counted and skipped. Dates outside the selected range are omitted.
- Credit direction alone does not establish income: refunds can also be credits. Recognized income/transfer categories are preserved; other new transactions start uncategorized and run through the user's ordered rules. Review uncategorized payments and transfers before relying on spending totals.
- Documented account due dates, credit limits, and available balances can populate their corresponding fields. Statement balance, minimum payment, and statement date stay absent. Loan payoff amount and recurring payment are not relabeled as statement minimums. Separately entered manual statement reminders are retained.
- Unknown account types, missing current balances, and explicit unsupported currencies appear as unavailable in the review screen. Full account numbers, routing numbers, credentials, and owner identity details are not copied to Marten; previews retain only the last four account-number digits.

The current pilot does **not** import holdings, investment activity, or pending transactions. Its V2 response contract does not document a deletion cursor, a pending-to-posted association, or a history-complete signal. Missing records in a later response are therefore not treated as deletion instructions. Every import and the saved connection state disclose that provider history completeness is unverified. `complete: true` in the account preview means only that the bounded returned account list was enumerated and validated; `historyComplete` remains `false`.

## Mapping, retries, and stopping

Existing manual accounts and accounts with fully disconnected provider connections may be mapped when type and currency match. An active Plaid connection cannot be overwritten. Existing transaction history from a different source requires the Sophtron start date to be **after** that account's latest transaction; this explicit cutover prevents the same activity being added to reports twice. The account's name, visibility, net worth exclusion, receipts, and earlier history stay in place.

External transaction identity is scoped to the mapped Marten account. Retries update the same stored row. User notes, tags, merchant/category choices, review status, hidden state, receipts, and activity survive provider refreshes. If a corrected amount makes saved splits invalid, Marten retains the original allocations as a review draft and uses the corrected total until reconciled. Bank-managed date/amount/account and deletion restrictions apply to Sophtron transactions just as they do to Plaid.

Import mutations require the configured owner, a personal non-demo profile, matching provider ownership, a live connection version, and an unexpired lease. Changing the connection while remote data is loading rejects the stale request before it can create accounts. Stopping during a write invalidates later batches. Partial failures retain already validated cached data and show a retryable error; completed batches are idempotent.

**Stop imports** stops Marten from importing and preserves cached balances, account flags, and history. It does not revoke Sophtron's access to the bank. The account holder revokes that access in Sophtron; removing the deployment access key disables this adapter. Marten currently imports on demand, so “Import latest” reads what Sophtron has already collected and does not force the institution to refresh.

## Server contract and bounds

`convex/sophtron.ts` exposes authenticated `status`, `preview`, `importAccounts`, `sync`, and `disconnect` functions. `sophtronInternal.ts` owns fenced persistence. `lib/sophtronApi.ts` handles documented V2 payload validation and HMAC requests. Credentials remain in server environment variables; connection records contain provider/customer identity and import state, never the access key. Public status omits those private identifiers. Agent outputs additionally redact Sophtron provider fields.

The server uses only fixed production/preview origins and these GET routes, with redirects disabled:

```text
/api/v2/customers/{configured-customer}
/api/v2/customers/{configured-customer}/members
/api/v2/customers/{configured-customer}/accounts
/api/v2/customers/{configured-customer}/accounts/{owned-account}/transactions
```

Every customer, member, account, and transaction response must match the configured API owner and the expected parent/customer relationship. Requests use the [official HMAC format](https://github.com/sophtron/Sophtron-Integration/blob/main/js/lib/directAuth.js). Query-free GETs avoid assuming undocumented query-string signature canonicalization; requested dates are applied after validating the returned cached rows. The [V2 schema](https://docs.sophtron.com/?urls.primaryName=Sophtron-Api+V2+endpoints) is the payload contract.

Limits are explicit: 100 linked accounts/members, 20 selected accounts per import, 20,000 returned transaction records per account, 10,000 supported in-range transactions per import, 100 rows per write batch, 5 MB per response, and 20 seconds per provider request. Exceeding a limit reports a failure; it does not silently truncate a financial total. A provider-side truncation still cannot be ruled out because the documented response has no completeness indicator.

## Provider background and privacy

Sophtron's [About page](https://sophtron.com/about) describes a company founded in late 2016 and lists a Seattle address. Its [privacy policy](https://sophtron.com/home/privacy) says it operates in the US, hosts data on AWS in the US, may store login credentials and MFA information to support authorized refreshes, and uses encryption and external SOC 2 Type 2 audits. These are provider claims; no audit report or independent compliance assessment was inspected. The bank provider research records the current personal-license terms and institution-status caveats.

## Verification

Nine focused fixture tests cover balance versus available data, masking, currency and debt-sign review, transaction direction/status/parent validation, HMAC and fixed-origin requests, owner/demo isolation, remote ownership before writes, retry identity and annotations/receipts/splits, account cutover, stop/version fences, and the workspace account limit. Backend and app TypeScript checks pass. The adapter was deployed to the development backend without provider credentials by the coordinating workstream; no live bank connection or provider signup was performed.

The actual unconfigured setup screen was inspected through both Add account and Bank connections at 1440×1000, 820×1180, and 390×844 in light appearance, and at 1440×1000/390×844 in dark appearance. The import button stayed disabled, the demo owner ID stayed hidden, Escape dismissed the dialog, and no outer/dialog horizontal overflow was observed. Representative captures are `output/playwright/sophtron-setup-light-1440.png` and `sophtron-setup-dark-390.png`. No real provider enrollment, bank consent, or external data import was performed.

An isolated browser fixture exercised the configured review and success screens without contacting Sophtron or writing financial data. A non-USD account stayed disabled; the selected card required an account mapping, USD confirmation, debt-sign choice, and final review before submission. The captured request retained the selected sign and currency confirmation. This check exposed and fixed a phone-width grid overflow and inherited vertical checkbox layout. The corrected review dialog had no horizontal overflow at 390, 820, and 1440 pixels in dark appearance; captures are `output/playwright/sophtron-review-fixture-dark-{390,820,1440}.png`. Fixture results validate interface behavior, not a live provider integration.
