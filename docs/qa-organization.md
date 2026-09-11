# Organization and recurring browser QA

Run: September 10, 2026, local frontend at `http://localhost:5173`, through Aside CLI in a newly opened tab and an isolated fictional sample workspace named Morgan QA. All writes below affect that sample workspace only.

## Completed checks

| Flow                          | Observed result                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signup and sample onboarding  | Fictional account created; Explore sample data produced 6 accounts, 250 transactions, and $284,620 net worth. Sample data label remained visible.                                                                                                |
| Group edit and reorder        | Renamed Everyday to Daily spending QA; moved it above Home & bills. Renamed group and new order appeared in subsequent views.                                                                                                                    |
| Category edit and reorder     | Renamed Groceries to Groceries QA; moved it below Restaurants. Existing grocery transactions displayed the renamed category.                                                                                                                     |
| Tag create, edit, delete      | Added Household QA, renamed it Household reviewed QA, confirmed deletion; tag disappeared and UI reported Tag deleted.                                                                                                                           |
| Merchant rename               | Renamed Blue Bottle Coffee to Coffee House QA; merchant list retained 11 transactions.                                                                                                                                                           |
| Merchant merge                | Merged Coffee House QA into Sweetgreen. Source disappeared, merchant count changed 25 to 24, destination transaction count changed 11 to 22.                                                                                                     |
| Rule preview and apply        | Merchant contains Target + Mark reviewed preview returned 12 matching transactions. Save & apply completed and showed Rule saved and applied. Existing Target rows no longer carried Needs review.                                               |
| Rule ordering                 | Added a second matching Mark unreviewed rule, moved it above Mark reviewed, and confirmed displayed order. Newly created $7.23 Target QA ordered transaction opened with Reviewed status, matching the final rule.                               |
| Recurring payment checkmark   | September Spotify payment marked paid; Still to pay changed $201.31 to $188.32. Calendar rendered its paid checkmark; list retained Paid after switching views.                                                                                  |
| Recurring create and edit     | Created United Airlines monthly payment for $45.67 on Sep 25; changed it to $49.25 on Sep 26. List and calendar both reflected the new amount/date; October showed the next occurrence on Oct 26.                                                |
| Recurring suggestions         | Find recurring returned three proposals. Reviewed Chase interest, confirmed income $132.40, High Yield Savings, Interest category, monthly cadence, Oct 3 date; saved schedule appeared in October list and raised expected income to $9,432.40. |
| Receipt upload and filtering  | Uploaded a synthetic 450 KB PNG copied from public/folio-mark.png to the $7.23 QA transaction. Detail showed Receipt attached and a named attachment link; Receipts tab showed exactly one transaction.                                          |
| Receipt removal               | Deleted the synthetic attachment. Detail showed Attachment deleted; Receipts tab returned zero transactions and its receipt-specific empty-state guidance.                                                                                       |
| Rule editor layout correction | Fresh reload after scoped label CSS fix confirmed Enabled, Match mode, Replace tags, and Set split allocations align horizontally. Dialog opened and closed successfully; snapshot did not confirm focus restoration to its edit trigger.        |

## Screenshot evidence

Screenshots were captured by Aside; category, rule-editor, and recurring-calendar captures were visually inspected. Full-page captures can repeat the fixed viewport when content uses an inner scrolling container; prefer the viewport captures below for presentation.

- `categories-reordered.png`
- `merchants-merged.png`
- `rule-preview.png`
- `rules-ordered.png`
- `ordered-rule-result.png`
- `categories-viewport.png`
- `merchants-viewport.png`
- `rule-layout-fixed.png`
- `recurring-calendar.png`
- `recurring-list-edited.png`
- `recurring-suggestion.png`
- `receipt-attached.png`
- `receipts-filter.png`
- `receipts-empty.png`

## Resolved transient issue and verification limits

Recurring navigation initially encountered an API deployment mismatch while its pagination repair was being implemented: frontend sent `paginationOpts` before the backend accepted it. Deployment and reload resolved this; the recurring checks above ran successfully afterward.

Aside's checkbox `.check()` reported an immediate state-change error while a controlled checkbox awaited its backend result. A fresh snapshot showed the successful persisted Paid state and correct totals; no application defect was inferred from that tool timing error.

Controlled desktop/mobile viewport testing was attempted with the Playwright-style `page.setViewportSize({width:1536,height:1024})` API, which Aside rejected with `TypeError: qaPage.setViewportSize is not a function`. Existing viewport captures are 2880×1800 image pixels. This run does not establish behavior at 1536×1024 or 390×844 CSS pixels, or absence of browser-console warnings. The fictional workspace remains available for continued QA.

## Final core-page visual pass

After a fresh reload, the following top-of-page viewport captures were taken through the public UI and individually inspected. The Cash Flow capture uses Monthly, September 2026, with its updated six-month comparison; Reports uses its default April 1–September 30 range. No data mutations were performed in this capture pass.

- `final-dashboard.png`
- `final-transactions.png`
- `final-transaction-drawer.png`
- `final-accounts.png`
- `final-cash-flow.png`
- `final-reports.png`

The desktop captures show consistent page margins, readable chart labels, aligned transaction amounts, and no overlapping or cropped controls. The following observations were sent to the coordinating agent for final polish:

| Screenshot                   | Observation                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| final-transaction-drawer.png | The link says “View 1 transactions”; singular wording should be used for one result. The merchant list has the same singular-count wording.                                                   |
| final-reports.png            | From, Through, Group by, and Chart labels are centered over their controls, unlike the left-aligned labels in the other editors.                                                              |
| final-cash-flow.png          | The chart repeats month labels in its x-axis and button row; the tall chart card pushes the breakdown table below the first viewport. This is a density refinement, not a functional failure. |
