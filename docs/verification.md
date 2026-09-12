# Verification record

Final assembled-app checks were completed on **September 11, 2026** using fictional Taylor and Morgan workspaces. This record distinguishes automated checks, observed browser behavior, development configuration, and remaining release work.

## September 12 — Production launch configuration follow-through

- Verified production `confident-kiwi-9` directly. Corrected `SITE_URL` to
  `https://marten.money`; added `PLAID_REDIRECT_URI=https://marten.money/` and
  a cryptographically random 32-byte base64 `CREDENTIALS_KEY`. Existing keys
  were preserved and no secret values were written to source or this record.
- Confirmed the production sender, explicit Plaid production mode, and a
  two-address household allowlist. Secret presence was checked without
  exposing values; this does not establish successful live bank consent.
- Brevo reports `marten.money` verified and authenticated, all required DNS
  records valid, and `noreply@marten.money` active after domain authentication.
  No real password-reset message was sent in this pass.
- `www.marten.money` returns a 301 to the apex. Google DNS over HTTPS resolves
  the apex to Netlify's `75.2.60.5`; HTTPS at that address returns 200 with
  certificate validation. The local system/browser resolver returned NXDOMAIN,
  so ordinary browsing on this machine was not yet confirmed.
- Validation: all 310 tests in 44 files passed, `npm run lint` (including
  typecheck), `npm run build`, and `git diff --check` passed. The existing
  local marketing site rendered and its desktop screenshot was reviewed.
  This was a release/configuration check, not a new full responsive UI audit.

## September 12 — Codex Security pass and remediation

- Codex Security Standard scan `418563a6-73ee-4fea-a14a-36f61039804d`
  reviewed current frontend and backend product source, authentication, ownership,
  provider credentials, uploads, browser/remote agent consent, parsers, exports,
  and deployment configuration. Independent baseline and architecture reviews
  were reconciled with parent source checks. Daybreak Blue access was confirmed.
- Two source-backed findings: missing SPA framing protection (medium), and an
  email-only Plaid household allowlist accepting an unverified signup address
  (low; conditional provider quota/cost impact, no existing-user bank disclosure).
  No cross-owner read/write bypass was identified in reviewed finance operations.
- Framing: Netlify and Vite local/preview responses now set
  `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
  An isolated browser at `http://127.0.0.1:5174` received both headers with HTTP 200
  on `/sign-in`, `/agent-authorize`, and `/settings/preferences`. All three routes
  were blocked when embedded from an `about:blank` foreign-origin harness;
  the sign-in and privacy pages remained usable as top-level pages. No real
  OAuth grant, sign-in, bank consent, or financial record was submitted.
- Plaid: both status and link/exchange authorization use the shared guard's
  trusted Auth email-verification timestamp. New regression tests failed before
  the fix and pass afterward. They cover unverified matching addresses, new and
  update Link requests, exchange refusal without provider calls, legitimate
  verified access, verified nonmembers, an unset allowlist, and preserved sync/
  disconnect access. The real installed Password provider ignores forged signup
  verification flags; requesting a reset does not verify ownership, while
  successful redemption of the mocked email code does. All delivery/provider
  traffic in these tests is mocked and all data fictional.
- Validation: `npm test` passed **310 tests across 44 files**; `npm run lint`
  (including typecheck), `npm run build`, and `git diff --check` passed.
  `convex dev --once` confirmed the selected development deployment and completed
  successfully. Production backend and public hosting were not changed.
- Privacy/FAQ copy now describes the existing in-app account deletion and
  SimpleFIN position imports. Sensitive-contact placeholders fall back to the
  existing private-reporting URL rather than public issues. Reviewed rendered
  privacy text at desktop, tablet and phone widths in light/dark appearance;
  this was a targeted content check, not a full visual redesign audit.
- Compatibility: on an email-restricted deployment, an existing unverified
  allowlisted account must complete the emailed password-reset flow before new
  linking/reconnecting. Existing owned imports and disconnect remain available.
  Configure working reset email delivery before relying on restricted mode.
- Limits: source review does not certify production environment values, hosting
  headers, provider/platform encryption or egress, storage URL lifetime, backup
  access, dependency advisories, or the absence of every vulnerability. SimpleFIN
  application-level sealing is optional; Plaid tokens rely on private backend
  storage/platform controls. Supporting tests were selectively reviewed and run;
  raster artifacts and historical prose were not comprehensively audited.

## September 12 — UI verification pass (add-account, recurring, drilldown, reveal, logo drop, error boundary)

- Verified six previously unreviewed UI changes in the fictional demo with the
  `agent-browser` CLI at 1440×900 in light and dark, plus 390×844 where noted.
  Screenshots were inspected for each step. Defects found were fixed in the
  owning files and re-verified.
- Add account → Connect a bank: Plaid and SimpleFIN render as two identical
  `.connect-provider` rows (icon, title, one-line note, arrow) separated by an
  “or” divider; both are disabled and dimmed in the demo, and the notice reads
  “This demo uses fictional finances. Exit demo and sign in to connect your own
  bank.” Confirmed in light and dark. The `restricted` path (Plaid hidden and
  the hero copy generalized when `PLAID_ALLOWED_EMAILS` excludes the user) was
  verified by reading `api.plaid.status` and `npm run typecheck`; it was not
  exercised in the browser because the env cannot be set there.
- Recurring rows: found the inline meta rendering as “Monthly·Gold Card·”
  because `.recurring-row .row-title small { display: block }` outranked
  `.recurring-row-meta { display: flex }` and dropped the gap. Raised the
  selector’s specificity and grouped each separator with the item after it, so
  a wrapped phone line never ends in a dangling dot. Desktop now reads
  “Monthly · Gold Card · [icon] Subscriptions” on one line with no extra
  whitespace; at 390px it wraps to “· [icon] Subscriptions” with document
  scroll width equal to the viewport. Checked light and dark.
- Reports and Cash Flow drilldown: clicking the Rent breakdown row opened the
  panel with Total $14,100.00, 6 transactions, average and largest $2,350.00,
  first Apr 11 and last Sep 6, 2026, a Sort control, and six rows. Escape
  cleared it; Tab to the row’s name button and Enter reopened it; clicking the
  same row again cleared it. Clicking a transaction opened the details drawer
  with Previous/Next; Escape closed only the drawer. Sort “Date · oldest”
  reordered the list to Apr 11 first. Donut slices selected on a real click on
  the ring (agent-browser’s bounding-box click lands in the donut hole for the
  largest slice, which is a test artifact, not a defect); legend rows selected
  and toggled. Cash Flow showed the same panel for September Rent (1
  transaction). Phone width used the two-column stats and hid the account
  column with no overflow. Also added a 5px gap after the category emoji in
  breakdown tables, which had been touching the name.
- Net-worth reveal: on Accounts, changing the period shows the loading state
  until history arrives, then the remounted chart sweeps from `scaleX(0)` to
  `1` in about 750ms (0.33 → 0.63 → 0.78 → 0.90 → 0.95 → 0.99 → 1.0 sampled
  every 90ms). On Dashboard the Select change replays immediately (0 at 52ms,
  0.39 at 150ms, 0.66 at 250ms, 0.88 at 400ms, 1 by 800ms). Partial-line
  screenshots were captured by freezing the clip rectangle at 0.33 on both
  pages (Accounts light, Dashboard dark); axes stay in place during the sweep.
  Resizing the viewport to 1200×800 and 1100×800 left the rectangle at
  `scaleX(1)` with no `chart-reveal-start` class, so it does not replay.
  Reduced motion is handled in `useReveal` (returns “done”) and in
  `charts.css` (no clip or transition under `prefers-reduced-motion`).
- Merchant logo: “Upload image” hovers like its siblings (same 38px height,
  hover background and muted border). Synthetic `dragenter`/`dragover` with a
  `DataTransfer` file showed “Drop image to upload”; found the overlay label
  colliding with the dimmed buttons beneath because the upload label is
  positioned and painted above it. Gave the overlay an opaque accent tint and
  `z-index: 1`; it now reads as a clean panel inside the dashed border in both
  themes. Dropping a text file showed “Choose a JPEG, PNG, or WebP image up to
  2 MB.” and cleared the drag state; dropping a 1×1 PNG cleared the error and
  showed a blob preview with “logo.png · Preview above. Save merchant to
  apply.” `dragleave` cleared the state. Paste uses the same `acceptFile`
  validation (read only; the clipboard cannot be scripted here).
- Error boundary: reviewed only. `RouteErrorBoundary` wraps the routed tree
  inside Shell’s Suspense with `resetKey={location.pathname}`, stale-chunk
  errors reload once per minute via sessionStorage before falling back to the
  explanation screen, `RouteErrorScreen` is the router `errorElement`, and
  `main.tsx` listens for `vite:preloadError`. `.route-error*` styles and the
  `/marten-mark.png` mask asset exist. The error screen was not rendered in a
  browser because that requires editing Shell or App.
- Checks: `npm run typecheck` passed; `npx vitest run convex/plaid.test.ts`
  passed 26 tests; focused ESLint (`--max-warnings 0`) and Prettier passed on
  `Recurring.tsx`, `recurring.css`, `reports.css`, and `settings.css`. Nothing
  was committed.

## September 12 — public site, feedback, support, error screens

- Added the public site (`/`, `/faq`, `/privacy`, `/terms`, `/security`,
  `/about`, `/support`) and moved the app home to `/dashboard`. In the Claude
  browser pane at desktop width, the landing page rendered the hero with the
  dashboard screenshot, the four "day" beats with their screenshots and the
  sticky time rail, the petrol "night" section with the header and footer
  recolored, the story, the closing call to action, and the footer. Checked
  dark appearance (hero, a beat, FAQ) and a 375px phone viewport (hero, a
  beat, the night section, and the comparison table stacked into labelled
  blocks). FAQ, Privacy, About, and the in-app Support page rendered with
  their side navigation and search.
- Product screenshots in `public/site/` were captured from the fictional demo
  with `agent-browser` at 1440×900, 2× scale, light and dark, then trimmed and
  converted to WebP; the Reports shot shows a real Shopping drilldown. The
  Open Graph image was rendered from an HTML source page at 1200×630.
- Feedback: opened Support → "Report a bug or share an idea" in the app; the
  dialog showed the kind switcher, title, details, and the device summary
  ("Chrome 152 on macOS · 1024×768 at 2x · light appearance · Self-hosted ·
  build 0.0.0+6d6a156"). The GitHub hand-off URL was not followed (the repo is
  still private).
- Error handling: `RouteErrorBoundary` wraps the routed pages and the router
  has an `errorElement`; stale-chunk errors reload once. Reviewed by code,
  not reproduced in a browser.
- `npm test` (306 tests, 43 files), `npm run typecheck`, ESLint with zero
  warnings on the new files, and `npm run build` passed; the direction
  contract comment survives in `dist/index.html`.
- Not done here: `npx convex deploy` and the Netlify deploy were blocked by
  the session's command policy and remain for Drew, as does the domain
  purchase.

## September 12 — account deletion

- Added self-service account deletion (Settings → Preferences → Delete account) with a typed `DELETE` plus sign-in email confirmation and a batched backend sweep. `npx vitest run convex/accountDeletion.test.ts` passed 4 tests: two seeded users across every user-owned table, the auth tables, and stored blobs; the scheduled sweep (Plaid revocation mocked, then rescheduling batches over 90 transactions) left no rows, blobs, sessions, tokens, codes, rate limits, verifiers, or authorization requests for the deleted user while the other user's rows, blobs, and sign-in survived; a failing Plaid `/item/remove` still completed deletion; wrong confirmation or email was refused without scheduling work; anonymous guests were refused. `npm run typecheck`, focused ESLint, and Prettier passed for the touched files. The dialog was not exercised in a browser during this pass.

## September 12 — demo banner stacking

- Follow-up: Drew's screenshot on port 5176 demonstrated that the layering-only
  change still allowed the document/banner to rubber-band across the fixed
  sidebar. Added `overscroll-behavior-y: none` to the root only while the app's
  demo banner exists. On port 5176, confirmed the computed root value was `none`,
  normal scrolling reached 644.5px, and repeated upward scrolling returned to
  an intact banner at the top. Inspected the resulting dashboard screenshot.
  This supersedes the earlier layering-only fix; physical trackpad verification
  in Aside remains outstanding.

- Raised the sticky demo banner from layer 24 to 31, above the fixed desktop
  sidebar (30) and mobile header (25), while retaining modal navigation above it.
- In the fictional demo, scrolled Transactions and Accounts down and back past
  the top boundary; inspected laptop light/dark screenshots, tablet dark
  (820×1180), and phone light (390×844). The banner remained readable, and the
  phone navigation overlay still covered it correctly and dismissed with Escape.
  Browser-computed layers confirmed banner 31 and desktop sidebar 30, with the
  sidebar starting beneath the 59px desktop banner. Restored light appearance
  and the default viewport.
- CSS parsing and focused diff whitespace checks passed. Native trackpad
  elastic overscroll was not reproduced by automated scrolling; the stacking
  defect is corrected, but that exact physical gesture remains unverified.
  No TypeScript or business logic changed; the full suite was not rerun.

## September 12 — design-system documentation

- Created root `DESIGN.md` from the current working CSS, shared components,
  brand/category documentation, product guidance, and the existing Mobbin
  refinement review. Added `.impeccable/design.json` with seven visual specimens
  and metadata, plus `docs/design/claude-design.md` with official-source setup
  guidance and a Marten-specific handoff brief. Linked the system from contributor
  entry points and marked the earlier visual specification as historical.
- Validation: all 34 light/dark color values matched `src/index.css`; all
  component token references and seven preview mappings resolved. The eight
  canonical Markdown sections were in order; 166 local links across the design
  document and related contributor documentation resolved. Formatting checks
  passed for the three new artifacts, and changed-document diff whitespace
  checks passed.
- Browser reference check in the fictional `/demo` workspace: inspected the
  desktop dashboard in light/dark appearance, tablet dark at 820×1180, and phone
  light at 390×844. Neither sampled narrow layout had outer horizontal overflow.
  Computed dark colors and the primary button's 36px height, 13px type, and 6px
  corners matched the reference. Inspected a transaction drawer and its nested
  calendar; Escape closed the calendar while retaining the drawer, then Close
  dismissed the drawer. No transaction values were changed. Restored light
  appearance and removed the temporary viewport override.
- Limits: this was a documentation/reference pass, not a full regression or
  accessibility audit. Runtime application code was not edited, so the full
  application test/build suite was not rerun. The public landing page currently
  hit an existing Vite/Lucide `Github` export error; public-site type/layout rules
  were extracted from source, not visually accepted here. Aside was not running;
  Codex's browser supplied the demo observations. No system was uploaded,
  synchronized, or published in Claude Design, and its imported behavior has
  not been tested.

## September 12 — custom category library

- Replaced the 21-icon Fluent presentation catalog with 89 original Marten SVG pictograms in 11 collections, with 106 portable emoji mappings and coordinated light/dark assets. Drew selected the generated style direction. Read-only Monarch category settings informed general-purpose coverage; no account data was changed.
- Inspected all collections in the local review sheet at 64px and 24px on light/dark backgrounds. The pass led to brighter dark artwork, a corrected avocado contour, and a joined hammer handle. The regenerated dark palette was visibly confirmed in the lower collections.
- In the fictional demo at 1280 × 900, opened Add category, searched “video games,” moved focus to Gaming with ArrowDown, and selected it with Enter; the trigger displayed Gaming. The expanded catalog and collection control rendered. Initial clipping inside the dialog was observed and prompted a final body-portal/modal fix.
- Final browser validation was blocked by automatic approval review: “Your workspace is out of credits. Add credits to continue.” The final portal change, collection selection, wheel scrolling, save/reload persistence, tablet/phone layouts, and full dark-theme interaction remain unverified. Do not treat the code change as proof these checks passed.
- Focused category tests passed (3). The full suite reported 263 passed and 3 failed; all three failures were in concurrent `convex/accountDeletion.test.ts` work (missing `providerSecurityId`). Full build was blocked by account-deletion type errors and concurrent site/support errors (missing `Feedback`, `Github` export, and `Landing.tsx` types). Initial lint reported six unused-import warnings in `Reports.tsx`; focused lint for the changed category components/helpers/preferences/search/FAQ passed. No release or publication was performed.

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

- September 11 evening pass (fictional QA workspace, Claude Browser): linked hover between legend rows and treemap cells/donut segments with a 12-color palette; the treemap stays fixed while its value list scrolls; report chart bodies no longer show a horizontal scrollbar; the transaction drawer's recurring links moved into a section after the editable fields with a merchant **Rename** link beside the transaction count; merchant logo options render as three equal buttons; recurring totals tween; forecast sliders update the projection on a 90ms trailing delay; whole-screen loading is vertically centered; settings navigation shares the sidebar hover; dashboard customization applies immediately; credit-card statements due this month appear under upcoming recurring with a per-account planned-payment preference; Plaid merchant names are cleaned and lone-word account nicknames defer to the official name; Monarch Money CSV exports are detected with negative-expense mapping; unexpected server errors render as plain sentences. A follow-up pass in the fictional demo workspace measured the sidebar brand row and page header sharing a 103px centre line in both expanded and collapsed states, the command palette at 691px wide with its focus ring on the whole control, no clipped category or account labels at 1900px, real wheel scrolling inside the category picker (scrollTop 0 → 300), the category icon picker opening on click with search and an any-emoji field, Sankey hover highlighting with a tooltip, the treemap staying fixed while its value list scrolled, the Recurring list showing each schedule's category, and the Gold Card statement (due Sep 18, $1,946.00) listed under Upcoming recurring. `npm test` (250), `npm run lint`, and `npm run build` passed after these changes. After the September 12 Monarch import work (tags, review state, IDs, account/category choices, balance export, cross-source matching, bank-sync adoption, account merge, attach-receipt flow, file-format guide and template), `npm test` (257), `npm run lint`, and `npm run build` passed at 08:24; a later run after the last copy edits passed `npm test` (262) while lint and build reported errors only in `src/features/Reports.tsx` and `src/site/siteConfig.ts`, which another session was editing at that moment and which this work did not touch.

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
- September 12 Monarch Money pass (fictional Taylor demo workspace, Claude Browser, files loaded through the dialog's file input): a Monarch-shaped transaction export with Owner, Reviewed, and Id columns was detected; "Sapphire Preferred (...1108)", "Gold Card (...3007)", and "Everyday Checking (...4821)" matched the demo accounts by last digits; "Coinbase" was listed under **Accounts in this file** with its two rows rejected until an account was chosen; **Categories in this file** listed Shopping (matched), Restaurants & Bars, Paychecks, and AI Assistants; the repeated Monarch ID counted as the single duplicate; five rows imported with "Gifts, Family" tags, a note, and reviewed state visible in the drawer. Re-importing the same rows plus one row matching the sample AMC Theatres purchase (same amount, one day apart) reported 0 imported, 1 existing transaction updated, 4 skipped, and the AMC drawer then showed the note "Popcorn night", the Movies tag, and reviewed state. A Monarch balance export switched the dialog to **Import account balances**, matched two accounts, skipped Coinbase, rejected one non-numeric row, saved 4 updates, and the Sapphire Preferred history listed $1,500.25 owed (inverted from Monarch's negative balance) while the ALL-period net worth chart extended to November 2025 and the current balance stayed $1,840.00. **Merge into another account** on the sample Gold Card moved 96 records into Sapphire Preferred (K-Food Lab now on Sapphire, five accounts remain, Sapphire's balance unchanged). The Receipts tab's **Attach receipt** action attached a PNG to the Sep 8 AMC transaction from the search list and the tab then listed it. The **What your file needs** guide and template download rendered at desktop, phone (375px), and dark appearance. The Vite dev server threw "Finance data unavailable" twice during this pass when another session hot-updated unrelated modules; a reload cleared it and the completed merge toast confirmed the mutation loop had finished.
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

## Reminders, assistants and SimpleFIN

- Reminder controls were checked in fictional demo workspaces at desktop, tablet and phone widths in both appearances. Native/email delivery remains disabled for demo users. Tests exercised verified-address consent, expiration/replay/rate limits, DST/calendar eligibility, paid/paused/edited schedules, duplicate claims, and safe notification/email payloads. Browser and email calls were mocked; this pass did not send a real reminder or establish closed-tab browser delivery. See [reminders](reminders.md).
- A new fictional personal QA account completed sign-up, fresh onboarding, OAuth consent and the return through the configured localhost frontend to a local MCP callback. Live development discovery returned HTTP 200, unauthenticated MCP returned 401 with its discovery challenge, SDK initialization negotiated `2025-11-25`, tools/list returned 20 tools, and get_accounts completed with an empty owned result. An edit under read-only consent returned 403. Disconnecting the client in Marten Settings made its token return 401 on subsequent calls.
- Chrome reported no native WebMCP API. In the Codex in-app browser, a fictional personal workspace registered 16 tools with read access (14 finance reads and two navigation/filter tools). The native bridge read accounts, opened Transactions with the requested search and date range, and returned to AI connections. Turning access off removed the tools; browser editing stayed off throughout.
- A separately consented local MCP edit grant created a zero-balance fictional forecast, changed annual return from 5% to 6%, restored 5%, and read back revision 3. Refresh returned HTTP 200 with a rotated token. Immediate disconnection made the refreshed access token return 401. No test grant remains active. Automated tests additionally cover ownership, stale revisions, token replay and both supported protocol versions. No real ChatGPT/Claude account or phone client was connected. The development frontend is HTTP localhost; hosted clients still require an authorized HTTPS deployment and configured app origin. See [agent access](agent-access.md).
- SimpleFIN Bridge replaced the Sophtron pilot on September 11, 2026. From a fictional QA workspace the connect flow claimed the public demo bridge's setup token, previewed three demo accounts, imported two with 344 posted transactions, applied MCC-based categories, and surfaced the bridge's range notice on the Bank connections card. The Institutions page shows Plaid and SimpleFIN as matching cards. Nine backend tests cover the protocol client, sealed storage, redaction, rate limiting, retries, cutover, fences, removal and limits; no real bank or paid subscription was used. See [SimpleFIN](simplefin.md).

Still required before a public release or real household onboarding:

1. Have the account holder complete real Plaid consent; validate Chase, American Express, and Charles Schwab account/product coverage, balances, posted/pending transactions, available liabilities, and investment data separately.
2. Verify refresh/reconnect/disconnect, scheduled sync, and live webhook delivery for those real connections.
3. Choose the production backend and final HTTPS frontend URL, configure authentication/Plaid origins and redirects, publish the frontend with SPA routing, and exercise routes/authentication on that URL under authorization covering public publication.
4. If enabling the optional integrations, complete real reminder opt-in/delivery checks, native browser and intended MCP-client connection checks, and SimpleFIN validation against a real subscription for its explicitly configured personal owner.

The development backend and private source repository do not establish public hosting. No real bank was connected by this QA pass.

## Large spreadsheet imports — September 12, 2026

- Shared CSV/XLSX reader and transaction preview accept up to 50,000 rows and 25 MB. This also fixes Monarch balance exports being rejected by the old transaction-only reader limit before format detection.
- File parsing and preview validation run in disposable browser workers; obsolete previews are terminated. Existing sequential 100-row mutations, transaction payload limits, stable retry keys, and 20-row preview pagination remain in place.
- Focused tests: 29 passing across `src/lib/transactionImport.test.ts` and `convex/accounts.test.ts`, including full 50,000-row CSV transaction/balance previews and oversized XLSX rejection. Changed import files pass ESLint. An isolated Vite production build of the worker and client succeeds.
- Browser: fictional demo at localhost:5175 accepted a 50,000-row CSV, showed 50,000 ready / zero rejected, and advanced to page 2 of 2,500. Reviewed the rendered light-theme preview. This is preview verification, not a 50,000-row database throughput benchmark.
- Full suite: 273 passing, three failures in the existing account-deletion fixtures (missing providerSecurityId). Full typecheck/lint/build remain blocked by unrelated account-deletion test types, missing Github icon exports in support/site, and Landing.tsx narrowing errors. No import-file type errors remain.

The same browser session accepted a 50,000-row Monarch balance CSV, matched all rows, consolidated repeated account/date entries to one update, and confirmed that update saved in the fictional demo workspace.

## September 12 refinements: transactions, charts and recurring matches

Used the Build Web Apps debugging and React guidance, supplied screenshots, and Mobbin's [Monarch bulk editor](https://mobbin.com/screens/75ffa9a7-3ec0-477b-9ecc-d6af757e294d). The bulk form adopts explicit “No change” defaults within Marten's shared controls.

- Dashboard spending labels and donut slices highlight each other with pointer and keyboard focus. Active values use the center label, removing the overlapping transparent tooltip. Browser assertions verified label-to-slice, slice-to-label, keyboard focus, and gap continuity. Report donut and treemap legends retain their highlight through row gaps; Sankey retains it through empty space inside the chart and resets on exit.
- Settled screenshots were reviewed in light and dark appearances, at 1440px desktop, 1024px tablet and 390px phone widths across the affected dashboard/settings surfaces. Document width matched the viewport. Recent-transaction hover backgrounds retain horizontal padding; both AI connection notices align with their related content.
- Collapsed sidebar labels display on hover and focus. Turning the preference off and back on was exercised. Screenshot review found and corrected a Radix wrapper incompatibility with NavLink's function-valued class name.
- In a fictional demo workspace, selecting the September 10 Target and September 9 Shell transactions, creating a tag inside the bulk editor and applying replacement notes plus the new tag succeeded. Both exact rows retained their notes and tags after reload. Nested tag creation keeps the enclosing bulk form open. The editor's fields scroll while its actions remain visible, verified at desktop and 390px phone widths. Phone wheel scrolling and nested tag creation were rechecked after that layout change.
- Creating a monthly schedule from the posted September 10 Target transaction immediately displayed its paid checkmark. Manually marking it unpaid remained authoritative after reload. Matching is conservative and one-to-one, excludes pending/hidden/removed transactions, and is shared with forecasts, reminders and agent reads. No reminder was sent.
- Focused regression checks cover recurring ambiguity/reversal/manual overrides, bulk ownership/atomic rollback/tag modes/schedule deduplication, bank date/deletion restrictions, merchant aliases and SimpleFIN holding parsing/import replacement. The final transaction/SimpleFIN/logo run passed 19 tests across three files; an earlier investment-focused run passed 30 tests across four files. Focused ESLint and `git diff --check` passed.
- The full suite reported 270 passing and three failing tests (38 passing files, one failing file). Failures are in the existing account-deletion fixtures using outdated investment field names. Full typecheck/build also remain blocked by those fixtures, `StorageWriter.store` usage there, existing `Github` icon imports in site/support, and existing Landing DOM typing errors. These unrelated workstreams were preserved.
- The authorized development Convex backend was updated successfully. No production publication or real bank/brokerage consent occurred. SimpleFIN positions were verified with mocked provider responses: malformed/missing snapshots preserve prior positions and an explicitly empty valid snapshot clears them. This does not establish real institution holdings coverage, cost basis or quote freshness. See [SimpleFIN](simplefin.md) and [investments](investments.md).

## September 12: Monarch destinations and category suggestions

- Missing spreadsheet account/category names now produce reviewed creation plans. A fictional Monarch file in the development demo created three manual accounts (including a closed checking account and a credit card marked closed during review), two named categories with suggested icons, and four transactions with zero rejected rows. Reloading and importing the same file again inserted zero transactions and skipped all four previously imported rows. No real financial export was uploaded.
- Expanded the Monarch mapping disclosure in the browser and verified separate original-statement and merchant mappings, account, category, notes, tags, reviewed status, and transaction ID. CSV imports no longer show a worksheet picker or an arbitrary default account. Previewing another file proposed missing accounts without saving them.
- Reviewed import screenshots in light appearance at desktop and phone widths and expanded mappings at tablet width. Reviewed category suggestions in dark appearance at 1440, 820 and 390px widths; fixed the suggestion paragraph/button wrapping at tablet width. The suggested-category operation succeeded in the fictional demo. Existing seeded suggestions remained unchanged; backend tests cover adding missing entries and repeating the operation.
- Five focused test files passed all 68 tests, including 50,000-row planning, destination reuse and ownership, creation rollback, closed-account balance previews, source metadata preservation, and conservative Plaid adoption retaining the account ID and imported transaction details. This is not a 50,000-row database throughput benchmark or a real bank connection test.
- Full suite: 288 passed and three failed in the unrelated existing account-deletion fixtures. Full lint/typecheck/build remain blocked by those fixtures' storage/investment types, existing Github icon imports in support/site, and Landing DOM typing errors. Focused changed-file ESLint and isolated production import-worker bundling passed. The development Convex backend was updated successfully; no production publication occurred.

## Forecast, recurring scenarios, and editing review — September 12, 2026

Scope: existing fictional `/demo` in the Codex browser, shared reorder handles,
merchant-logo entry points, and bounded finance scenario checks. This was not a
historical market backtest or a live brokerage verification.

- Added seven independent forecast checks: hand-calculated income/withdrawals,
  closed-form monthly annuities at -20%, 0%, 5%, and 12%, lower-return/higher-
  inflation/earlier-retirement/travel stresses, and a trip that causes an early
  liquidity shortfall despite sufficient annual income. All passed.
- Added five recurring examples: Amazon renewal beside orders/refunds, $5/$6
  creator subscriptions, a two-day restart, card migration, and a first-year
  $50/next-year $100 annual charge. The creator case failed before the exact-
  amount fallback and passes afterward; existing one-cent variation tests pass.
- Focused forecast, runway, detection, matching, and investment suites passed
  all 63 tests across seven files in the final run. The full suite
  subsequently reported **300 passed, 3 failed (303 total)**. All three failures
  originate in the unrelated `convex/accountDeletion.test.ts` fixture using
  outdated investment field names. They were not changed in this work.
- Affected-file ESLint passed. Required full lint/build both stop at the shared
  typecheck: six account-deletion fixture errors (`storage.store` and old
  investment field names), missing `Github` exports in support/site, and
  `Landing.tsx` event-target narrowing. None is in an edited implementation.
- Attempted `npx convex dev --once` against the configured development backend;
  it stopped at the six account-deletion fixture type errors before pushing.
  The detection fix is implemented and unit-tested locally, **not verified as
  deployed**. No production deployment was attempted.
- Demo browser: saved `QA · zero-growth baseline` ($10,000 -> $22,000 at
  retirement -> $10,000 ending) and `QA · save $100 per month` ($23,200 at
  retirement -> $11,200 ending), selected the baseline as the comparison, and
  inspected the plotted paths and annual ledger.
- Category keyboard pickup/arrow/drop displaced neighboring rows and persisted
  after reload. Pointer dragging moved Vacation to the last tag position.
  Category-group keyboard movement also succeeded. Dashboard keyboard movement
  and cancellation exposed an Escape conflict, now fixed: the first Escape
  cancels the drag while keeping the dialog open; the next closes the dialog.
  Rules use the same implementation, but this demo had no rules to reorder.
  Shared reordering covers groups, categories, tags, rules, and dashboard
  customization, with named announcements and Escape cancellation.
- From Target transaction details, opened the shared merchant editor, selected
  the Target catalog logo, saved, and returned to the transaction drawer.
  From Spotify recurring, opened the same editor. Escape returned focus to
  the invoking schedule control. Logo actions are centered next to the avatar.
- Pausing Spotify moved it from the calendar list into Paused; resuming restored
  the same schedule and the original seven scheduled items. Actual financial
  service cancellation, inferred card migration, future price schedules, and
  subscription lifecycle history are not implemented by that toggle.
- Inspected merchant editing at 1440x900, 820x1180, and 390x844, including light
  and dark renders. Phone layout stacked the logo controls and had no page
  overflow (390px viewport and scroll width). These are browser viewports, not
  claims about physical-device or native-touch testing.
- Near-term cash forecasting: adding $20/day over 90 days reduced ending cash
  from $79,777.98 to $77,977.98, exactly $1,800. The selected cash accounts and
  four excluded schedules were visible; unpaid occurrences totaled 16.
- Investments: the demo's $17,433 unrealized gain reconciled to individual
  known-basis positions. A holding worth $81,400 with $70,818 total basis showed
  $10,582 gain. Unknown-basis holdings remained unavailable, and the summary
  disclosed 75% value coverage (six of eight positions).

References checked: [dnd-kit sortable](https://dndkit.com/legacy/presets/sortable/overview/),
[Monarch merchant editor](https://mobbin.com/screens/b5368b7a-a9a5-4cf7-94cd-7893566f9368),
[Plaid total cost basis](https://plaid.com/docs/api/products/investments/), and
[sequence-of-returns risk](https://workplace.schwab.com/story/timing-matters-understanding-sequence-returns-risk).
The model review and proposed next additions are in [forecasting.md](forecasting.md);
subscription behavior and limitations are in [recurring-schedules.md](recurring-schedules.md).

## Hide amounts and merchant action sizing — September 12, 2026

- Added device-local Preferences → Privacy → Hide amounts and a matching profile
  menu action. Search for “hide amounts” opens and focuses the privacy section.
  The shared four-dot mask covers amounts on Dashboard, Accounts, Transactions,
  Cash Flow, Reports, Recurring, Investments, and both forecasts, including chart
  amount axes, tooltips and accessible labels. Holding units/prices are masked
  along with value and total basis. Proportions, dates and counts remain visible.
- Browser QA used only the existing fictional demo. Toggling from the profile
  menu immediately restored report totals and concealed dashboard totals and
  chart axes without navigating. Reload retained the setting. The Target drawer
  concealed its amount; split fields rendered disabled masks. Holding details
  concealed units, price, basis and gain. Expanded forecast amount fields and
  an interacted chart tooltip remained concealed; chart shapes stayed intact.
- Reviewed screenshots at 1440px (dashboard, transaction detail, forecast),
  820px (investment table and privacy setting), and 390px (privacy setting),
  across light and dark appearances. The phone setting wraps without clipping.
  “Edit merchant” now matches the adjacent 12px “View transactions” action.
- The setting is display privacy, not redacted data. Original values stay in
  calculations, saved records and exports. Receipts, notes, statement text and
  authorized assistant access retain their content; the preference explains
  this scope. Masked amount inputs preserve the owner's draft instead of writing
  dots back into financial data.
- Focused tests: 14 passed across privacy formatting, investment view, and
  forecast scenarios. Full suite: 306 passed across 43 files. Production build
  passed. Focused changed-file ESLint passed. Full lint reported unrelated
  RouteErrorBoundary/SiteLayout refresh warnings and a DocumentPage template
  type error. No backend change or publication was required for this feature.

Design reference: inspected [Kraken's portfolio visibility control](https://mobbin.com/screens/53a9dda8-f9c4-4712-a4fb-d891f59079e6);
Marten uses fixed dots and its existing preference controls.

## Transaction detail hierarchy — September 12, 2026

Date now uses a label above the full-width shared date picker. The header keeps
Mark as reviewed and moves Hide/Unhide and eligible Delete into a keyboard-accessible
overflow menu; deletion still requires the existing confirmation. The merchant
summary's top inset is reduced from 25px to 16px. Reviewed the fictional Target
drawer at desktop and phone widths, opened the calendar, and used arrow keys to
open then cancel the delete confirmation. No transaction data was changed.
Focused ESLint, production build and diff whitespace checks passed.
