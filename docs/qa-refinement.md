# Workspace refinement verification

This pass preserves Marten's neutral surfaces and compact financial views. It adds navigation and appearance choices and corrects layout behavior. The final identity uses a blue accent. Source checks and browser observations are recorded separately; the consolidated current result is in the [verification record](verification.md).

## Implemented

- The desktop sidebar can collapse to a 76px icon rail. Its state persists on the device, and every icon retains an accessible name and tooltip. At 760px and below, navigation uses a modal drawer with focus containment, Escape dismissal, and backdrop dismissal.
- Settings places its page title and navigation in one rail, alongside the selected section's heading. The rail becomes a horizontal list on phones. Help & FAQ is available there and from the profile menu.
- New installations follow the system light/dark appearance. An explicit existing theme choice is retained. Preferences offers Marten/DM Sans or the system font; font choice persists on the device and also applies to chart labels.
- Page arrival and loading transitions are brief and disabled by reduced-motion preferences. The transaction query string does not remount the route, preserving drawer and notes behavior.
- Bulk selection keeps both toolbar modes in the same layout slot, retains the header's second line, and reserves stable table columns. Checkboxes appear inside merchant cells; only merchant contents receive 28px additional inset. Tables scroll inside their panel at narrow widths.
- Transaction status, visibility, sort, theme, and font controls use the shared custom Select. Minimum and maximum amounts use signed decimal text fields without native steppers; unfinished decimal input does not erase the result list.
- MoneyFlow displays proportional ribbons from incoming money through available funds to expenses and leftover money. Refunds and income reversals retain their signed meaning. A shortfall is shown explicitly as existing funds or borrowing. Grouping retains exact cents and keeps the balance visible. Under 620px of component width, the chart becomes readable vertical lists with proportional bars and exact amounts.
- Explicit theme changes use a 180ms native view-transition crossfade. Desktop sidebar changes apply layout once and animate browser snapshots for 240ms, avoiding the earlier width/margin tween that could repeatedly resize charts. Both actions apply immediately for reduced motion, hidden pages, or browsers without the API. No animation dependency was added, and startup remains immediate.
- Profile-menu Preferences and Help & FAQ links close their popover on selection. Preferences exposes keyboard-focusable section anchors for profile, appearance, transaction preferences, and the sample workspace, allowing global search to land on the relevant controls.
- On coarse-pointer devices, Recurring calendar dates and event controls use 44px touch targets (date width is capped by its cell). Fine-pointer calendar density is preserved.

## Motion research decision

The implementation follows the browser's [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) and [snapshot model](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using), with React DOM's existing [flushSync](https://react.dev/reference/react-dom) committing the state update before the new snapshot. The [web.dev animation guide](https://web.dev/articles/animations-guide) supports avoiding repeated layout work. [Motion's bundle guidance](https://motion.dev/docs/react-reduce-bundle-size) was reviewed; these two bounded effects do not require adding a dependency. A [React community discussion](https://www.reddit.com/r/reactjs/comments/1pmbum9/which_animation_library_should_i_use/) was also considered as non-authoritative context. Two searches for relevant X/Twitter discussion did not produce a useful source; no technical claim relies on them.

## Checks completed

- Focused ESLint passed for Shell, Settings, Preferences, Transactions, appearance helpers, MoneyFlow, and its tests.
- A fresh app TypeScript check passed after the profile and generated auth API work was available.
- Six MoneyFlow regression tests passed: exact remaining cents; refund/reversal placement; shortfall conservation; zero, refund-only, reversal-only, and balanced periods; grouping conservation; invalid or mismatched input rejection.
- The Impeccable mechanical detector ran once on the changed UI targets and returned no findings. This is a source scan, not visual proof.

## Initial browser limits and subsequent confirmation

Independent Aside snapshot QA was not completed: automatic approval review rejected opening the transaction page even after the fictional-only Morgan QA fixture was documented. The coordinating task is checking the app through its local browser route.

The coordinating task subsequently confirmed at 390 CSS pixels that document width equals viewport width and that mobile navigation closes after a link and restores focus to its trigger. Its Preferences inspection found the new profile photo controls flush with the panel edge; a scoped CSS correction now applies the same 22px inset as the existing name form. The coordinating task later verified the corrected profile layout and a saved, reloaded 512px cropped profile image.

An independent sample-workspace browser pass subsequently confirmed that Profile → Preferences and Profile → Help & FAQ dismiss the popup and display their destinations. Light/dark changes and collapse/expand showed correct settled layouts in fresh captures, with no overlap or stale content. This confirms the settled result, not frame timing or a performance benchmark. The reviewer restored system appearance and the expanded sidebar. Tablet dimensions and coarse-pointer calendar behavior still require the coordinating task's browser check because that reviewer's browser interface cannot resize its viewport.

| Surface            | Confirmation                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop navigation | Collapse/expand without clipping; reload retains choice; profile menu and theme action work in the rail.                                                            |
| Phone navigation   | Open at 390px; tab stays in the drawer; Escape/backdrop close it; focus returns to the trigger; navigation to the current page also closes it.                      |
| Settings           | Page and section headings share their top alignment; 390px navigation scrolls within its rail; profile/appearance controls fit.                                     |
| Appearance         | Marten and system fonts apply immediately and after reload; system theme responds to OS preference; explicit light/dark persists.                                    |
| Transactions       | Record first row/header/amount coordinates before and after Edit multiple; Y positions and non-merchant columns stay fixed. Test both default and optional columns. |
| Narrow layouts     | At 390, 760, and 1024 CSS pixels, document width equals viewport width. Wide transaction tables may scroll inside their panel.                                      |
| Money flow         | Desktop ribbons/labels fit; focus/hover shows exact cents; all movements remain readable; the narrow version fits without outer overflow.                           |
| Reduced motion     | No route entrance or sidebar animation when reduced motion is enabled.                                                                                              |

No production deployment, real-bank data, or external email delivery is established by these checks.

## Tablet completion and cash runway — September 11

The isolated `folio-tablet` Chrome session subsequently provided the missing tablet checks using a fictional Taylor QA workspace. Its portrait viewport was 820×1180, landscape 1180×820, coarse pointer true, and one emulated touch point. Document width matched each viewport. Captures in `output/playwright/tablet-*` were opened and visually inspected; they are local QA artifacts rather than publication assets.

- Preferences, Rules, the rule editor, the Excel import controls/row preview, Recurring calendar, dark Search, and account/transaction drawers fit the reviewed tablet layouts. The calendar's rendered dates measured 44×44px and event controls 44px high.
- Portrait Recurring filters originally wrapped three plus one; a 761–950px rule now presents a balanced two-column grid. The account drawer's body originally touched both edges; its content now aligns with the title using 24px insets, or 20px on narrow phones. Corrected captures were inspected.
- The Excel fixture produced two ready rows, one rejected invalid-date row, and one skipped duplicate after choosing its second-row headers. The preview was canceled without importing. Its dialog had equal client/scroll widths and an intentionally scrollable height.
- Keyboard Search focused its text field; ArrowDown/Enter opened Groceries and retained 22 category matches when opening transaction detail. A stale drawer after navigating from detail to a tag result was reported, fixed by the coordinating task, and verified after a fresh load. Search focus restoration was likewise repaired and verified for both direct-click and keyboard-opened Search. Repeated Search → Import → Close worked twice and cleared the import URL flag.
- Tag and Receipts search destinations selected the correct view. This fixture contained no matching Vacation rows or receipts, so opening a row from those two lists was not established by this pass.
- Near-term cash runway was inspected at 1180px, 820px, and 390px in dark mode, with no outer horizontal overflow. A selected $42,300 savings account and $25/day allowance produced $40,050 after 90 days. A $250/day allowance over 365 days produced an ending balance of −$48,950 and its first negative closing balance on February 28, 2027. System appearance, expanded navigation, and all-cash/90-day/zero-allowance defaults were restored before handing the browser back.

The near-term calculation waits for all recurring-payment pages, starts future activity tomorrow, retains exact cents, counts only open USD cash accounts, and excludes paid occurrences and schedules attached to noncash/closed/missing/other-currency accounts. Card purchase schedules and separate statement reminders do not enter the forecast; a card payment must be explicitly scheduled from a cash account. Optional recurring names take precedence over merchant names. The chart uses daily steps and exposes the zero-default variable-spending assumption, exclusions, and daily-closing-balance limitation.

After the final near-term edits, all 10 focused cash-runway tests, scoped ESLint, and a fresh app TypeScript check passed. Tests cover signed money and daily allowance, paid/today exclusions, selected accounts and currencies, month ends/leap years, all three horizons across daylight-saving boundaries, same-day net activity, card-payment deduplication, and invalid/unsafe inputs. Static screenshots establish settled appearance, not animation frame timing or a performance benchmark.
