# Desktop visual QA — September 10, 2026

Checked the latest UI through Aside in a separate fictional **Morgan QA** sample workspace. Captures use a 1440 × 900 CSS-pixel desktop viewport at 2× resolution, dark appearance, and DM Sans. Screenshots were opened and visually inspected, in addition to reading UI state.

## Results

| Area               | Observed result                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cash Flow timeline | Timeline appears first, followed by the selected month, totals, and money-flow diagram. Month labels, axes, legend, period controls, and summary amounts are readable without overlap.                                                                                                              |
| Money flow         | September sample income is $4,782.40 with $891.81 left over. Paycheck, interest, rent, shopping, groceries, other outflows, and leftover amounts fit their labels. Focusing a node shows its detail; View all movements opens the full breakdown.                                                   |
| Reports            | Custom chart menu and searchable account menu are styled consistently. The expanded filters show Account, Category, Merchant, and Tag in one aligned row. Filtering to Everyday Checking changes the totals and breakdown; cash flow remains positive. Donut rendering and its labels are readable. |
| Bulk editing       | Entering Edit multiple, selecting one row, and exiting preserve vertical table position and row height exactly. Checkboxes and category/review actions appear without an added table column.                                                                                                        |
| Profile            | Six preset avatars render clearly. Selecting Ocean updates the large profile picture and sidebar, shows its selection ring/check, and survives a reload. Use initials restores MQ in both locations.                                                                                                |

### Bulk-edit measurements

Read `getBoundingClientRect()` from the rendered table before entering bulk mode, after entering it, and with one row selected. Values are CSS pixels.

| Element                  |      Before |   Bulk mode | One selected |
| ------------------------ | ----------: | ----------: | -----------: |
| Table top                | 220.3984375 | 220.3984375 |  220.3984375 |
| First transaction top    | 295.8984375 | 295.8984375 |  295.8984375 |
| First transaction height |          54 |          54 |           54 |

The list header stays at top 149 with height 71.3984375. The table stays 1146 pixels wide. Raw before/after geometry is saved as `bulk-layout.json` beside the captures.

### Resolved issue and final appearance check

Selecting **Profile and preferences → Preferences** initially left the profile popover open over the destination page. The validation workstream fixed the menu's close behavior. A fresh Aside recheck confirmed that both **Preferences** and **Help & FAQ** now close the popover immediately and show the selected content. This QA pass did not edit `Shell.tsx`.

The final recheck also toggled Light → Dark and collapsed → expanded the sidebar. Three fresh screenshots were opened and inspected: the settled content remains aligned, the compact sidebar shows its navigation icons cleanly, and light/dark colors update consistently. Static captures establish settled behavior and appearance; they do not verify animation frame timing. The original **Match system** preference and expanded sidebar were restored.

No visual clipping or overlap was found in the inspected cash-flow, report, bulk-edit, or avatar states.

## Capture source

The following captures were inspected in the local Aside session. They remain
local QA artifacts; the later [fidelity ledger](fidelity-ledger.md) links the
curated final screenshots retained in the repository.

- `cashflow-timeline.png`
- `cashflow-money-flow.png`
- `reports-spending.png`
- `reports-filters.png`
- `reports-filtered.png`
- `reports-account-menu.png`
- `reports-chart-menu.png`
- `reports-donut.png`
- `transactions-before-bulk.png`
- `transactions-after-bulk.png`
- `transactions-selected.png`
- `preferences-initials.png`
- `preferences-ocean-avatar.png`
- `preferences-light-final.png`
- `sidebar-collapsed-light-final.png`
- `preferences-dark-final.png`
- `bulk-layout.json`

Do not use `cashflow-full.png`: Aside's full-page stitching repeated a viewport instead of following this application's inner scroll container. The separate timeline and money-flow viewport captures above are valid. `cashflow-movements.png` is an optional expanded-state capture with the movement list continuing below the viewport.

Only fictional sample data was changed. No bulk transaction mutation was performed. The avatar was restored to initials at the end. This pass did not modify Cash Flow, Reports, their CSS, or shared application code.
