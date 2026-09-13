# Lunch Flow

Marten accepts a user's own [Lunch Flow Personal API](https://www.lunchflow.app/docs/api/personal-api-overview) key alongside SimpleFIN. Each service has its own subscription and account access. No operator-wide Lunch Flow subscription or platform client secret is needed.

## Connect and review

1. Link banks in [Lunch Flow](https://lunchflow.app). Its connection screen owns bank authentication, available connectors, and reconnection.
2. Open **Destinations → Add Destination → API**, copy the API key, and enable the desired accounts in **Account Access**.
3. In Marten choose **Add account → Continue with Lunch Flow** and paste the key.
4. Review account types, balances, import start date, and destinations. Marten currently imports USD accounts only, even when Lunch Flow covers the bank internationally.
5. Choose **Import accounts**. Marten checks daily; **Import latest** requests another read of Lunch Flow's cached data, not a guaranteed bank refresh.

When switching from another service, stop and remove that connection first to free its account mappings. The accounts and transactions stay. Map the existing Marten account and start after its latest transaction. Creating a new account instead keeps both balances in net worth. Replacing a Lunch Flow key preserves the connection's mappings; rejected keys do not replace a working key.

## Provider choice and data quality

Lunch Flow documents MX, Finicity, GoCardless, Finverse, Pluggy, Akahu and SnapTrade coverage. The accounts endpoint reports the provider behind an account, which Marten shows beside the account. Its Personal API has no institution search, connector-selection operation or success/longevity metrics. Marten therefore delegates connection choice and repair to Lunch Flow and does not invent rankings or copy Monarch's success ratings. The reviewed documentation does not establish how Lunch Flow ranks competing connectors for Fidelity or any other particular bank.

| Data | Marten behavior |
| --- | --- |
| Accounts | Names, institution name/logo, provider and currency; user reviews the suggested type |
| Balances | Signed amounts converted to integer cents; debt becomes amount owed; no fabricated update timestamp |
| Transactions | Stable account-scoped IDs, dates, description and merchant; deposits become negative and outflows positive in Marten |
| Pending / removed | Pending rows are excluded; absent rows are not deleted because this API does not supply a deletion stream |
| Categories / merchant logos | Not present in the documented transaction schema; Marten's rules, merchant catalog and user edits apply |
| Credit-card details | No statement balance, minimum payment, statement date or payment due date in this API; use statement reminders |
| Holdings | Quantities, value, symbol and price where available; failed or unsupported snapshots retain prior positions |
| Cost basis / price history | No gains or historical security prices inferred; the documented costBasis field lacks sufficient unit semantics for use here |

Broader provider coverage does not establish better data for a particular account. A real account-holder connection remains necessary to verify completeness, signs and availability at each institution.

## Implementation and privacy

`convex/lib/lunchflowApi.ts` is the provider-specific adapter. Requests use only `https://lunchflow.app/api/v1` with `x-api-key`, a timeout, bounded response size and redirects disabled. Provider error bodies and keys never enter client errors or logs. The browser clears the password input after successful connection.

The existing `simplefinConnections` table and `simplefin*` foreign-key fields are retained for stored-ID compatibility. They now form the shared import storage: an optional `provider` distinguishes connections (absent means legacy SimpleFIN), one per provider per user. Lunch Flow external IDs are namespaced, account rows record `bankProvider`, and transactions use source `lunchflow`. The shared engine checks ownership, mapping cutovers, version leases, idempotency, split preservation and annotations. These fields are not exposed by assistant business operations.

Set `CREDENTIALS_KEY` to a base64-encoded 32-byte key to seal credentials with AES-256-GCM. Without a valid key, credentials remain server-side but are stored unsealed, as with the existing SimpleFIN integration. Never put a Lunch Flow key into a `VITE_*` variable.

**Stop imports** pauses Marten reads. **Remove** forgets the saved credential and makes imported accounts manual while preserving history. Revoke the API destination or bank consent in Lunch Flow separately. Workspace/account deletion includes these connections in the existing cleanup path.

## Reviewed references (September 13, 2026)

- [API destination and account access](https://www.lunchflow.app/docs/guides/destinations/api)
- [Accounts](https://www.lunchflow.app/docs/api/personal-api/listAccounts), [transactions](https://www.lunchflow.app/docs/api/personal-api/getAccountTransactions), [balance](https://www.lunchflow.app/docs/api/personal-api/getAccountBalance), [holdings](https://www.lunchflow.app/docs/api/personal-api/getAccountHoldings)
- [Providers](https://www.lunchflow.app/docs/api/what-is-lunch-flow) and [US/Canada connections](https://www.lunchflow.app/docs/guides/connections/regions/us-canada)
- [Sure's transaction adapter](https://github.com/we-promise/sure/blob/main/app/models/lunchflow_entry/processor.rb) and [account adapter](https://github.com/we-promise/sure/blob/main/app/models/lunchflow_account/processor.rb), used as implementation evidence for amount conversion, not proof of a live Marten connection
