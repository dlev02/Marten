# Verification record

Final assembled-app checks were completed on **September 11, 2026** using fictional Taylor and Morgan workspaces. This record distinguishes automated checks, observed browser behavior, development configuration, and remaining release work.

## Final checks

| Check               | Observed result                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated suite     | `npm test`: **245 tests across 34 files passed**. Concurrency is capped at four workers while retaining test isolation.                                                                                                                     |
| Types and lint      | `npm run lint` passed, including the application TypeScript check and ESLint. The backend TypeScript check also passed.                                                                                                                     |
| Production build    | `npm run build` passed. Routes, spreadsheet parsing, and PDF parsing are split into separate bundles; PDF.js loads only for PDF import.                                                                                                     |
| Development backend | Convex confirmed the assembled schema/functions ready on `stoic-narwhal-224` at 09:38:51 America/Chicago, including OAuth/MCP, reminders, recurrence detection and the unconfigured Sophtron adapter. Backend type checking passed.         |
| Rendered UI         | Actual interactions and opened screenshots covered desktop, landscape/portrait tablet, and 390px phone layouts in both appearances. The final desktop pass used a 1536×1024 fine-pointer browser.                                           |
| Design comparison   | [Fidelity ledger](design/qa/fidelity-ledger.md) compares the original concepts with the implementation. The later [Mobbin review](design/mobbin-review.md) records 26 inspected previews from 19 apps and the concrete refinements adopted. |

The tests cover money conservation, signed cents, refunds, splits, complete-period reporting, date boundaries, ownership, ordered rules, provider retries, recurrence matching/detection, imports, search destinations, authentication helpers, demo isolation, investment calculations, forecast scenarios, credit-history validation, reminder consent/deduplication, Sophtron normalization, brand matching, and agent permissions/token lifecycle. Mocked provider tests do not establish live bank behavior. An earlier unconstrained run hit two five-second timeouts under worker contention; the bounded final run passed all tests.

## Later refinement pass

- Sign-in and signup now use direct headings and a compact demo action beneath the form. The final sign-in, grouped command palette, credit-history empty state, and bank score guide were opened and inspected. Search arrow keys moved the active result; Enter on “category icons” opened the exact appearance preference.
- Rapid viewport changes covered 1512, 1220, 1100, 990, 820, and 780 pixels. After two animation frames, the net-worth curve retained an 8px gap before the rendered right-axis labels at every width. The sidebar collapse button stayed at x=181 and the search shortcut at x=182.1875. This is an observed resize check, not a frame-time benchmark on every device.
- The settings rail remained at y=88 before and after scrolling with the sticky demo banner. Profile photo actions shared the same top position and 36px height; choosing a preset and restoring initials worked.
- A forecast slider changed retirement age from 66 to 67 with ArrowRight. A pointer drag changed return to 10.5%; entering 6% afterward, saving and reloading retained both 67 and 6%. Both numeric fields and sliders remain available.
- Illustrated/system category style persisted after reload; selecting the avocado illustration retained the original emoji value in the category editor. The generated catalog produced 3,459 locally served brand icons, with reviewed Trader Joe's and Walgreens fallbacks.
- The Last month preset applied to Transactions and appeared in its toolbar. The credit score editor exposed a text field with a numeric keyboard rather than native steppers. The four-bank guide retained separate source/model/date guidance.
- Forecast, Credit scores, Preferences and AI connections were captured at 820×1180 and 390×844 in both themes with zero outer horizontal overflow. Settled screenshots were inspected, including the palette, profile actions, forecast and narrow settings. Captures are under `output/playwright/marten-final-*`; only fictional data was used.

## Authentication, profile, and demo

- Browser sign-up/sign-in, sign-out, refresh persistence, and an authorized password-recovery email were exercised. The delivered code reset the password; the old password was rejected and the new password worked. Existing access tokens retain their normal short lifetime after session invalidation.
- Profile name, preset avatar, and initials persisted after reload. The actual photo cropper was exercised with zoom/pan; a saved 512px image persisted and was then restored to initials.
- **Explore demo**, `/demo`, and **Profile → Open demo** opened a fictional Taylor household in a separate tab. Guest changes survived refresh, and **Exit demo** returned to the normal account or sign-in page. An existing signed-in workspace retained its saved forecast while a separate guest demo ran.
- Guest authentication uses a separate tab-storage namespace. Backend tests reject guest bank access, sample clearing, and conversion to a personal workspace even if the profile is tampered with. The UI disables Plaid and explains how to sign in.
- Guest records are retained in the development database after exit; the app does not promise immediate deletion. Appearance preferences remain device-level preferences.

See [authentication](authentication.md) for delivery configuration and recovery limits.

## Accounts, transactions, and organization

- Fictional dashboard, account, Cash Flow, and Reports data were inspected with known account/transaction fixtures. Backend tests reconcile net worth, reporting periods, refunds, split amounts, pending/hidden/provider-removed records, and transfer treatment.
- Transaction filters, search, sorting, editing, split handling, notes, tags, bulk controls, detail navigation, and refresh persistence were exercised. Entering and leaving bulk mode retained row/header positions.
- Actual CSV/Excel files were mapped, previewed, imported, and retried. Valid rows persisted; invalid dates and duplicates were explained. Account mapping and second-row spreadsheet headers were checked. See [importing](importing.md).
- PNG and PDF receipts were uploaded, reloaded, downloaded with matching SHA hashes, and removed. Ownership, size, type/signature checks, removal, and orphan cleanup have backend coverage. Header checks are not a complete document sanitizer.
- Categories/groups, merchant identity and merging, tag colors, and ordered rules were reviewed. A regression proved merchant merge originally left saved report filters behind; the repaired merge retargets only the owner's matching reports and preserves other filters. The focused backend suite then passed all 16 tests.
- Search opened relevant preferences, categories, imports, and screen destinations. Drawer-to-tag navigation, repeated Search → Import opening, and focus restoration were repaired and rechecked. The tablet fixture had no Vacation-tag rows or receipts, so opening a result from those two empty lists was not established by that particular pass.

Detailed records: [organization QA](qa-organization.md), [workspace refinement](qa-refinement.md), and [desktop visual QA](design/qa/desktop-visual.md).

## Recurring schedules and cash runway

- Recurring calendar/list, manual schedules, detection review, and payment state were exercised with fictional data. Exact amount matching is the default; sign, merchant, optional account/statement text, explicit tolerance, and occurrence timing prevent an Amazon Prime schedule from matching unrelated Amazon purchases. Regression tests cover these distinctions.
- Credit accounts can store a statement due date, balance, and minimum entered by the user. Recurring labels these **Entered by you**, separately from provider fields. Statement **Mark paid / Mark unpaid** controls apply to that due date and suppress eligible reminders without changing transactions or initiating payment.
- Detection now clusters the same merchant/account/sign by amount and cadence, accepts explicit small variation, and proposes weekly, biweekly, monthly, quarterly and yearly schedules. Coverage dates, occurrence counts and tolerance are visible before review. Suggestions do not create schedules automatically.
- A final regression confirmed 99 eligible patterns are complete, while 101 patterns return the capped 100 suggestions with `complete: false`. The latter case failed before the fix. The UI and agent tools share the same completeness result.
- The cash-runway view was inspected at 1180×820, 820×1180, and 390×844 with no outer horizontal overflow. A selected $42,300 account with $25/day variable spending ended at $40,050 after 90 days. At $250/day over 365 days it ended at −$48,950 and first went below zero on February 28, 2027.
- Ten cash-runway tests cover exact cents, future unpaid activity, selected USD cash accounts, excluded currencies/types, month ends/leap years, 30/90/365-day horizons, daily closing balances, and unsafe input rejection. Card purchase schedules and separate statement reminders are excluded; a card payment must be scheduled explicitly from a cash account.

See [recurring schedules](recurring-schedules.md) and [forecast guide](forecasting.md) for assumptions and limitations.

## Retirement forecasting

- The browser saved a fictional plan starting at age 55, retiring at 65, and planning through 90, with two $4,000 trips annually from ages 65 through 84. The original assumptions showed a first shortfall at age 78.5 on March 11, 2050.
- **Apply savings** applied the minimum whole-cent solution, $2,604 more monthly savings, and the result remained funded through age 90 with approximately $100,001 in today's dollars. This is a spending-reduction assumption in the model, not additional outside money.
- The funded scenario was saved as a copy, reloaded, and compared with a retirement-at-67 scenario. Both curves and their totals were inspected. An invalid retirement age blocked Save; loading another scenario with unsaved changes required a discard decision and restored the saved values.
- The actual CSV export contained 36 annual rows, 20 years of travel budgets, and an ending future-dollar balance of $237,322.82 with no unfunded spending. The export was parsed and checked independently of the visible chart.
- Ten backend forecast tests cover monthly conservation, compounding, inflation, anchored dates, annual travel, retirement liquidity, minimum-savings solving, partial years, input validation, ownership/revision conflicts, observed baselines, and scenario removal during sample reset.
- Desktop, tablet, and phone layouts were opened and visually inspected in light/dark themes. A first-axis-label clipping issue was repaired and rechecked in the final desktop capture.

This deterministic planning model is not a return forecast, tax engine, Monte Carlo analysis, or automated advice. See the [model guide](forecasting.md) and [research](forecasting-research.md). The [Origin audit](origin-audit.md) contains product observations without private account values or screenshots.

## Investments

- Browser QA showed $234,000 across eight fictional holdings; Roth IRA filtering showed $148,000 across four holdings with 75% known-basis coverage. Missing cost basis displayed **Not provided** and **Unavailable**.
- Name/ticker search, empty results, sorting, allocation, account filtering, custom dates, and all 24 fictional activity events worked. Escape closed holding detail and returned focus to its trigger.
- Desktop, 1024px tablet, and 390px phone screenshots were inspected. After repairing table containment, document width matched the viewport. Narrow rows preserve the fund, account, and value, with full details available in the drawer.
- Tests cover complete pagination, failure preserving prior data, stable holding identity, cancellation, ownership, sample reconciliation, history coverage, currencies, basis absence, fractional precision, and month-end dates. Separate guest tests prohibit investment sync.

No real brokerage consent, live quote feed, on-demand paid refresh, or trading was performed. See [investments](investments.md).

## Credit-score history

- A fictional statement PDF suggested 742, FICO 8, TransUnion, and September 1 in an explicit review form. Saving it, manually adding 750 on September 10, and viewing the +8 change worked after reload. Editing the second score to Equifax separated the histories; deleting it retained the original TransUnion record.
- Encrypted/no-text/ambiguous documents fall back to manual entry. Browser PDF processing uses the bundled PDF.js worker; PDF bytes, extracted text, and file names are not uploaded or stored. Only the reviewed fields are saved.
- Nine focused tests cover ownership, CRUD, date/score validation, model and bureau separation, history calculations, and conservative text parsing. Real PDF.js fixture tests cover text, encrypted/no-text, and page-count limits.
- Desktop/tablet/phone light and dark layouts, the date field, and contained horizontal table scrolling were inspected. A 390px page overflow caused by the offscreen Actions heading was repaired and rechecked.

This is manually maintained history with optional local PDF assistance, not automatic access to a bank or credit-bureau score. Source research and limits are in [credit scores](credit-scores.md).

## Shared controls and appearance

- Custom calendars replaced native date inputs. Real checks covered typed dates, February 29 in leap/non-leap years, month/year menus, arrow keys, Escape/focus, Today/Clear, and a 390px phone popup. Enter commits the date without submitting its enclosing form. Nested selectors were raised above calendar popovers.
- Custom tag/merchant hex colors persisted after reload; invalid hex disabled Apply. Presets were also checked, and temporary QA edits were removed.
- Newest/oldest sorting uses one hover surface. Dashboard recent-transaction and spending rows now have padding inside their hover backgrounds; settled light/dark screenshots were inspected.
- Marten's original marten mark, wordmark, and blue accent appear in the shell/auth UI, page title/favicon, exports, email display name, and Plaid client name. Dark semantic buttons use explicit contrasting ink.
- Shared dialogs restore focus on close. A short laptop sidebar scrolls to keep the profile accessible. Theme transitions no longer fight individual control transitions; settled colors were checked. Reduced motion skips nonessential movement. Static screenshots do not establish animation frame timing or a performance benchmark.

## Provider configuration and release boundary

- Authentication routes/signing and the authorized development backend were exercised through the browser.
- Real **Plaid Sandbox** ingestion returned 14 accounts and 50 transactions; the temporary sample connection was removed afterward. Production Link-token creation returned valid tokens/expirations for bank and investment flows. Neither result establishes real institution consent or successful live bank sync.
- Webhook tests verify original-body signatures, ES256, active verification keys, a five-minute time window, modified bodies, expired keys, malformed JWTs, and unsupported algorithms. The `/plaid/webhook` route and six-hour catch-up cron are implemented; live provider delivery has not been observed.
- Secrets and signing material belong in Convex deployment configuration. `.env.local`, browser-session artifacts, caches, and build output are excluded from source control.

## Reminders, assistants and Sophtron

- Reminder controls were checked in fictional demo workspaces at desktop, tablet and phone widths in both appearances. Native/email delivery remains disabled for demo users. Tests exercised verified-address consent, expiration/replay/rate limits, DST/calendar eligibility, paid/paused/edited schedules, duplicate claims, and safe notification/email payloads. Browser and email calls were mocked; this pass did not send a real reminder or establish closed-tab browser delivery. See [reminders](reminders.md).
- A new fictional personal QA account completed sign-up, fresh onboarding, OAuth consent and the return through the configured localhost frontend to a local MCP callback. Live development discovery returned HTTP 200, unauthenticated MCP returned 401 with its discovery challenge, SDK initialization negotiated `2025-11-25`, tools/list returned 20 tools, and get_accounts completed with an empty owned result. An edit under read-only consent returned 403. Disconnecting the client in Marten Settings made its token return 401 on subsequent calls.
- Chrome reported no native WebMCP API. In the Codex in-app browser, a fictional personal workspace registered 16 tools with read access (14 finance reads and two navigation/filter tools). The native bridge read accounts, opened Transactions with the requested search and date range, and returned to AI connections. Turning access off removed the tools; browser editing stayed off throughout.
- A separately consented local MCP edit grant created a zero-balance fictional forecast, changed annual return from 5% to 6%, restored 5%, and read back revision 3. Refresh returned HTTP 200 with a rotated token. Immediate disconnection made the refreshed access token return 401. No test grant remains active. Automated tests additionally cover ownership, stale revisions, token replay and both supported protocol versions. No real ChatGPT/Claude account or phone client was connected. The development frontend is HTTP localhost; hosted clients still require an authorized HTTPS deployment and configured app origin. See [agent access](agent-access.md).
- Sophtron setup/import entry points were inspected at 1440, 820 and 390 pixels with light/dark coverage. Unconfigured and demo states kept import disabled and hid the demo owner ID. An isolated browser fixture exercised currency, debt-sign, account-mapping and final-review gates; a phone grid/checkbox layout issue was fixed, then review-dialog client/scroll widths matched at 390 (349/349), 820 (771/771), and 1440 (923/923). Nine backend fixture tests cover identity, balances, supported posted records, retry preservation, cutover, stale writes and account limits. No Sophtron account, credentials, real consent or live import was configured. Provider history completeness remains unverified. See [Sophtron](sophtron.md) and the [provider comparison](bank-provider-options.md).

Still required before a public release or real household onboarding:

1. Have the account holder complete real Plaid consent; validate Chase, American Express, and Charles Schwab account/product coverage, balances, posted/pending transactions, available liabilities, and investment data separately.
2. Verify refresh/reconnect/disconnect, scheduled sync, and live webhook delivery for those real connections.
3. Choose the production backend and final HTTPS frontend URL, configure authentication/Plaid origins and redirects, publish the frontend with SPA routing, and exercise routes/authentication on that URL under authorization covering public publication.
4. If enabling the optional integrations, complete real reminder opt-in/delivery checks, native browser and intended MCP-client connection checks, and Sophtron enrollment/data validation for its explicitly configured personal owner.

The development backend and private source repository do not establish public hosting. No real bank was connected by this QA pass.
