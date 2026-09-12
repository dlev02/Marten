# Architecture and contributor map

Marten is a React/Vite single-page application with Convex as its only application backend. Convex Auth supplies authenticated sessions; Plaid actions import bank data, including [investment holdings and activity](investments.md). Each user can also connect their own SimpleFIN Bridge subscription for daily balance and transaction imports, plus validated investment positions when supplied. Convex HTTP actions also host the OAuth and MCP endpoints; there is no separate server or database service.

## Source map

For visual and interaction contracts, use [DESIGN.md](../DESIGN.md). It maps
shared controls and design sources; historical concepts remain in `docs/design/`
as provenance rather than implementation specifications.

| Location                                                                                                                                                                                               | Responsibility                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [`src/main.tsx`](../src/main.tsx), [`src/App.tsx`](../src/App.tsx)                                                                                                                                     | Theme/auth/router setup, signed-out screen, onboarding, authenticated workspace                                             |
| [`src/features/Shell.tsx`](../src/features/Shell.tsx)                                                                                                                                                  | Navigation and routes, shared page header, global search, global Plaid flow                                                 |
| [`src/features`](../src/features)                                                                                                                                                                      | Dashboard, Accounts, Transactions, Reports/Cash Flow, Recurring, Investments, Forecast, Credit scores, and Settings screens |
| [`src/features/transactions`](../src/features/transactions)                                                                                                                                            | Transaction detail/forms and transaction-scoped notes drafts                                                                |
| [`src/features/accounts`](../src/features/accounts)                                                                                                                                                    | Manual accounts, institutions, Link/OAuth coordinator                                                                       |
| [`src/features/settings`](../src/features/settings)                                                                                                                                                    | Categories, merchants/tags, preferences, and rule editing                                                                   |
| [`src/components/folio`](../src/components/folio)                                                                                                                                                      | Shared application controls, dialogs, feedback, and charts                                                                  |
| [`src/components/ui`](../src/components/ui)                                                                                                                                                            | Underlying shadcn/Radix primitives                                                                                          |
| [`src/lib/data.tsx`](../src/lib/data.tsx)                                                                                                                                                              | Reactive workspace metadata, transaction pagination, common pickers and account totals                                      |
| [`src/lib/reporting.ts`](../src/lib/reporting.ts), [`src/lib/format.ts`](../src/lib/format.ts)                                                                                                         | Shared report calculations and boundary formatting/parsing                                                                  |
| [`convex/schema.ts`](../convex/schema.ts), [`convex/validators.ts`](../convex/validators.ts)                                                                                                           | Persisted tables, indexes, and reusable runtime field validators                                                            |
| [`convex/lib/access.ts`](../convex/lib/access.ts)                                                                                                                                                      | Authenticated function wrappers, ownership and input validation                                                             |
| [`convex/lib/finance.ts`](../convex/lib/finance.ts), [`convex/lib/transactions.ts`](../convex/lib/transactions.ts)                                                                                     | Finance rules, recurrence, transaction validation, ordered rule application, search/count maintenance                       |
| [`convex/workspace.ts`](../convex/workspace.ts), [`convex/transactions.ts`](../convex/transactions.ts), [`convex/settings.ts`](../convex/settings.ts), [`convex/recurring.ts`](../convex/recurring.ts) | Public, authenticated data operations for the corresponding features                                                        |
| [`convex/plaid.ts`](../convex/plaid.ts), [`convex/plaidInternal.ts`](../convex/plaidInternal.ts), [`convex/lib/plaidApi.ts`](../convex/lib/plaidApi.ts)                                                | Plaid actions, private database writes, provider normalization, safe errors, and signature verification                     |
| [`convex/http.ts`](../convex/http.ts), [`convex/crons.ts`](../convex/crons.ts)                                                                                                                         | Auth/webhook HTTP routes and scheduled catch-up sync                                                                        |
| [`convex/sample.ts`](../convex/sample.ts)                                                                                                                                                              | Default categories and fictional sample data                                                                                |
| [`convex/_generated`](../convex/_generated)                                                                                                                                                            | CLI-generated API/types/guidelines; regenerate rather than hand-edit                                                        |

Category artwork is a presentation layer: [`categoryIcons.ts`](../src/lib/categoryIcons.ts) resolves portable emoji and aliases into the generated Marten SVG catalog, and `CategoryIcon` chooses the app theme's palette. The category picker shares this search/catalog logic. Stored category emoji and finance behavior do not change. See [assets](assets.md) for regeneration and provenance.

Feature-specific styles stay beside the feature. Shared app styles and theme tokens are in [`src/index.css`](../src/index.css). The visual contract is in [design/system.md](design/system.md).

## Public site and routing

The marketing and policy pages live in `src/site/` and render for everyone,
signed in or not. `src/App.tsx` checks `publicPaths` (`/`, `/faq`,
`/privacy`, `/terms`, `/security`, `/about`) before authentication; `/support`
shows the public donation page to visitors and the in-app Support screen to
signed-in users. Netlify and Vite serve all routes with framing denied (`frame-ancestors 'none'` and `X-Frame-Options: DENY`) to protect authenticated consent and settings from disguised embedded clicks. Other static hosts must set equivalent response headers.

The application itself starts at `/dashboard` (the sidebar,
demo exit, search catalog, and `/demo` redirect all point there) and
`/sign-in` is the auth screen (`?signup=1` opens account creation).

Page copy for the documents and FAQ is data in `src/site/content/*.ts`
(`SiteDocument` and `FaqEntry` shapes) rendered by `DocumentPage` and
`FaqPage`, so a policy edit is a text change with no layout work. Shared
facts (URLs, operator, Ko-fi, governing state) sit in `src/site/siteConfig.ts`.
Product screenshots used by the landing page are captured from the fictional
demo at 1440×900 in both appearances into `public/site/` (WebP), with the
Open Graph image at `public/site/og.png`.

Feedback goes through GitHub issue forms: `src/features/Feedback.tsx` builds
a prefilled `issues/new` URL (template ids match `.github/ISSUE_TEMPLATE`),
optionally including browser, OS, viewport, theme, page, and build id from
`src/lib/feedbackReport.ts`; nothing is sent from the backend.

Route errors are caught by `RouteErrorBoundary` inside the Shell and by the
router's `errorElement`; a stale-chunk error after a deploy reloads once
(`src/lib/staleChunk.ts`, also wired to Vite's `vite:preloadError`) before
showing an explanation.

## Data and trust boundaries

A client calls the generated Convex API through `ConvexAuthProvider`. Public business functions use `userQuery`, `userMutation`, or `userAction`, which derive `ctx.userId` from the authenticated session. `owned` validates direct IDs and relationship targets. Each user owns a separate `profiles` record and financial records; knowing an ID does not grant access, and there is no shared household role model.

Queries and mutations read/write Convex data. External requests and file-storage orchestration use actions, which call internal queries/mutations for transactional changes. An internal function may accept a trusted server-derived `userId`; public APIs must not use a caller-provided owner as authorization.

[AI connections](agent-access.md) expose the same finance operations through browser WebMCP and an authenticated remote MCP HTTP endpoint. Shared schemas live in `convex/lib/agentTools.ts`; `agentAccess.ts` derives the owner from the signed-in session or a validated OAuth grant before calling extracted business handlers. Both paths require personal-workspace consent, enforce separate edit access, and redact provider credentials and identifiers at the output boundary. Remote OAuth is handled by `agentHttp.ts` and `convex/lib/agentAuth.ts`.

`DataProvider` loads bounded workspace metadata reactively. Transactions are paginated separately and reports wait until the entire chosen range is loaded. Recurring payment checkmarks also load through pagination; the month view waits for every page before treating an absent checkmark as unpaid or calculating the remaining total. Account balance history has its own bounded query and a `complete` flag. Those completion signals are part of correctness, not just loading presentation.

Recurring list, calendar, day details, and schedule totals share [`filterRecurring`](../src/lib/recurringFilters.ts), so merchant, account, type, and checkmark filters cannot disagree across views. Paused schedules have no paid/unpaid occurrence status. Bank statements remain a separate, explicitly labeled section because provider statements do not carry the user's schedule checkmarks.

Saved reports retain account, category, merchant, and tag filters. Every referenced record must belong to the authenticated user. Updating a saved report with omitted filter IDs clears those old filters. Category filtering in [`summarize`](../src/lib/reporting.ts) happens after splitting transactions into allocations: only the selected category's amounts and refunds contribute to totals, month series, and any chosen grouping.

Profile pictures are cropped locally by [`profileCrop.ts`](../src/features/settings/profileCrop.ts) and saved as 512-pixel JPEGs. The browser accepts JPEG, PNG, or WebP sources up to 10 MB and 40 megapixels; only the cropped image reaches the authenticated `uploadProfilePhoto` action, which validates image type/signature and a 1 MB limit. The action creates its own storage ID, and replacing a photo, selecting a built-in avatar, or resetting a sample workspace deletes the previous photo. Preset artwork is bundled in [`profileAvatar.ts`](../src/lib/profileAvatar.ts); profile metadata supplies the saved photo URL to settings and the sidebar.

Private `plaidItems` contain access tokens and cursors. Public status/metadata responses construct a safe view. A browser stores only a short-lived Link token and minimal OAuth flow context; it never stores a Plaid access token or client secret. Webhook requests must pass signature/time/body-hash verification before they schedule internal work. When `PLAID_ALLOWED_EMAILS` restricts new links, the shared guard requires both a matching email and Convex Auth mailbox verification. Existing sync and disconnect remain owner-gated independently of this allowlist.

## Planning and investments

The long-term [forecast engine](../convex/lib/forecast.ts) is pure monthly arithmetic. [Forecasting functions](../convex/forecasting.ts) load an explicitly bounded account/history baseline and save versioned, owned input snapshots. The client computes the projection and minimum monthly spending reduction locally; a saved scenario never changes silently with a bank refresh. [Forecasting](forecasting.md) documents the date, inflation, liquidity, and travel contracts.

[Near-term runway](../src/features/forecast/cashRunway.ts) starts from selected open USD cash accounts, includes unpaid cash-account schedules, and subtracts an explicit variable-spending allowance. It does not treat investment values or credit availability as cash.

[Investments](investments.md) has a separate paginated activity model. Its staged sync publishes only a complete holdings/activity snapshot; a failed or canceled sync retains previous data. Account balances supply net worth and are never added to their holdings a second time.

Credit-score observations are separate from bank data. The lazy PDF.js helper reads an explicitly selected document locally, suggests only unambiguous fields, and requires review before an authenticated save. Only score/date/bureau/model/source/method reach the backend. Histories remain separated by bureau and model; see [credit scores](credit-scores.md).

## Guest demo

[Demo context](../src/lib/demo.ts) chooses sessionStorage and a separate Convex Auth namespace before React mounts. Normal account tokens remain in their existing storage. Anonymous users receive only their fictional workspace; server guards prevent bank actions and conversion into a real workspace. Exit signs out the guest and returns to normal authentication. Appearance preferences remain device-wide, and guest records currently remain in the development database after exit.

## Money and dates

| Convention                                                             | Consequence                                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Stored amounts are integer cents                                       | Validate before writes; parse/display dollars only at input/output boundaries                            |
| Positive transaction amount means outflow, negative means inflow       | A negative grocery refund reduces grocery expense; its sign alone does not make it income                |
| Category **group kind** determines `income`, `expense`, or `transfer`  | Changing a category's group can change report treatment, even though the transaction amount is unchanged |
| Credit/loan balances represent debt with their provider sign preserved | Subtract them from net worth; a negative debt balance can increase net worth                             |
| Net worth comes from balances, not transactions                        | Hiding a purchase cannot change the bank's balance                                                       |
| `YYYY-MM-DD` values are calendar dates                                 | Use the calendar helpers rather than timezone-shifting them with midnight parsing                        |
| Recurrence retains its original day anchor                             | January 31 becomes February's last day and then March 31; leap-day yearly schedules regain February 29   |

Current financial reporting is USD-only. Do not add unlike currencies or invent FX conversion. [Requirements](requirements.md#financial-invariants) contains the complete financial contract.

## Transaction changes that require coordinated updates

- **Merchant identity:** refresh `searchText` and maintain merchant `transactionCount` in the same mutation. Merchant merges also update recurring and rule references. Do not replace a user override during provider sync.
- **Splits:** active allocations total the parent amount exactly and replace the parent in reports. A provider amount change saves invalidated allocations as `splitDraft`, clears active splits, and requests review; it does not discard the user's original categories/notes.
- **Visibility:** `hidden` and `pending` transactions are omitted from posted totals. `removedFromBank` retains provider history/annotations but is excluded from active lists and counts. These flags do not alter account balances.
- **Review state:** `editedFields` tracks intentional user changes. Automatic rules must respect those fields; an explicitly applied user rule is a deliberate edit.
- **Receipts:** attachment ownership is checked before storage and again before association. Failed association removes the uploaded blob. Receipt count and deletion paths must remain consistent with the stored attachments.
- **Notes autosave:** the drawer's notes state belongs to one transaction ID. Writes are serialized, navigation flushes the latest draft, and older reactive server snapshots must not replace unsaved text. Keep the state helper's regression tests when changing this flow.
- **CSV retries:** `importKey` is derived from the batch and row key so a retry cannot silently create duplicates. New rows pass through the same validators and ordered rules as other manual imports, except that a category the file named is recorded as an edited field.
- **One purchase, several sources:** `findMatchingTransaction` (same account, same amount, within three days) is the single place that pairs a spreadsheet row with a bank or manual row. Imports enrich the existing row and give it the import key; Plaid and SimpleFIN ingestion adopt an unlinked spreadsheet row instead of inserting a twin; the account merge does both while moving records. Keep the three call sites on that helper so the definition of “same purchase” cannot drift. See [importing](importing.md).

Shared calculations live in `convex/lib/finance.ts` and `src/lib/reporting.ts`. A screen-specific formula must not diverge from those helpers. Ordered rules run in ascending order; later matching rules can replace earlier actions unless the field is protected as a user edit.

## Bank synchronization

The full protocol is in [plaid.md](plaid.md). These details are particularly easy to break during an apparently local change:

1. Finish the entire Plaid pagination loop before applying transaction pages. A mutation-during-pagination error restarts from the original committed cursor and discards the unstable fetched loop.
2. Apply additions/modifications before removals, preserving the pending row's ID when it posts. Attachments, activity, and annotations depend on that stable row identity.
3. Fence every write with the active sync version/lease. Disconnect or a newer sync invalidates earlier work.
4. Advance the stored cursor only after **all** batches succeed. An interrupted import can replay safely; row writes are idempotent.
5. Preserve cached balances and account preferences when disconnecting. Revoking data access does not mean the bank account is closed.
6. Use cached account totals for investment/IRA accounts. Available brokerage cash is not the account's total value.

## Current bounds and growth

This version favors understandable, bounded operations for a small personal workspace. It does not claim unlimited scale:

- Metadata currently supports up to 200 accounts/groups/tags, 500 categories/recurring schedules, 2,000 merchants, and 100 saved reports/institutions. Exceeding the guarded metadata limits produces an error rather than a fabricated complete workspace.
- Transaction pages request at most 200 rows; user bulk edits and CSV imports accept at most 100 rows per call. The report UI consumes all pages for its selected range before declaring totals complete.
- Balance history returns up to 12,000 snapshots with a completion flag. Narrow the range or add pagination before increasing that limit.
- Rules are bounded to 200 per workspace. Reuse `loadRuleContext` within a batch so the same rules/merchant names do not need to be loaded repeatedly.
- Recurring detection examines the latest 2,000 transactions and reports whether that window is complete. Suggestions remain proposals until a user reviews them.
- Receipts are limited to 20 per transaction, up to 5 MB each, with supported types validated on the server.

If a feature outgrows one of these paths, change the query protocol and its completeness/error handling together. Raising a `.take()` limit alone is not a scaling strategy. Keep externally visible totals and ownership guarantees covered by focused tests.

## Assistant and notification integrations

Browser tools in `WebMCPProvider` feature-detect `document.modelContext`, dynamically load schemas after opt-in, and unregister through an abort signal. Frontend navigation/filter tools accept only known destinations and validated filter fields. `/agent-authorize` presents client identity, callback origin and optional edit consent before the backend issues a code. The [agent guide](agent-access.md) covers OAuth lifetimes, client compatibility, limits and setup; the shared ownership boundary is described above.

[Reminders](reminders.md) separate browser display from email delivery. The browser dispatcher uses a service worker for native notices while the tab runs; it is not background push. The server's 15-minute email sweep respects user timing, verification and payment state, and reserves each attempt to avoid duplicate delivery. Activity records omit message contents.

[SimpleFIN](simplefin.md) has a separate provider adapter with one connection per user. A pasted setup token is claimed once, the resulting access URL is sealed with `CREDENTIALS_KEY` when present, and reviewed imports preserve annotations through provider-identified posted records. Its account-type review, balance sign inversion, 45-day request windows, mapping cutover, and no-deletion rules must not be inferred from Plaid's different contract.

## Transaction refinements

`convex/lib/recurringPayments.ts` derives one-to-one posted transaction matches
within a three-day occurrence window. The UI combines `automaticPayments` with
the paginated manual overrides, with explicit paid/unpaid choices winning.
Recurring totals, near-term forecasts, and reminder delivery use this same rule;
agent payment reads return the automatic matches alongside the manual page.
Both directions of ambiguity are checked across date-range boundaries. Queries
refuse ranges exceeding 12,000 transactions rather than silently treating
partial matches as paid. Schedule dates are the first eligible occurrence;
Find recurring starts a reviewed suggestion at its latest observed charge.

Bulk transaction changes are one authenticated, bounded mutation (100 rows),
including per-row tag add/remove/replace semantics and deduplicated recurring
schedules. Unchanged fields are omitted. Bank dates/amounts/accounts remain
provider-managed; bank rows are hidden instead of deleted. Bulk deletion reuses
the single-row cleanup path and requires confirmation in the UI.

### Imported destinations

`imports.prepareDestinations` creates owned manual accounts and named categories in bounded, retry-safe preparation batches. Optional `importName` fields retain normalized source labels across renames. Client-only placeholder IDs exist solely in the worker preview; saving revalidates with real owned IDs before computing stable row keys. Workspace subscriptions are reduced to relevant account/category fields so merchant-count updates do not repeat a full-file preview.

`lib/importedAccounts.ts` is the conservative Plaid account-adoption policy: open, unconnected imported manual accounts with a unique name, four-digit mask, type, and currency match keep their original account ID when connected. Ambiguous identity requires explicit mapping/merge. `lib/categoryDefaults.ts` owns default category definitions for new workspaces and the opt-in additive category suggestions.

## Display privacy

`src/lib/amountVisibility.ts` owns the device-local Hide amounts preference,
initialized before rendering and synchronized across tabs. Financial components
subscribe with `useAmountsHidden`; presentation uses `displayMoney`,
`displayCompactMoney` and `displayFinancialValue`. Raw `format.ts` remains pure
for parsing, calculations and exports. Do not pass a display mask into a mutation
or use it as an input draft. `AmountInput` omits the actual value from the rendered
input while hidden and retains the owner's draft for restoration.

This is screen-sharing concealment, not data redaction or an authorization
boundary. Merchants, account names, dates, counts, proportions and chart shapes
remain visible. Receipts, user-authored text, exported files and authorized agent
reads retain their original content. See Preferences → Privacy for the user-facing
scope and the FAQ/search entry for the direct link.
