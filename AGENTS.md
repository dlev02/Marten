<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# Working on Marten

Marten is Drew's family's personal finance app. Read the relevant source and
[architecture](docs/architecture.md) before changing behavior. Product scope and
finance invariants live in [requirements](docs/requirements.md).

For interface work, read the root [DESIGN.md](DESIGN.md) before choosing colors,
type, layout, controls, icons, or motion. It is the maintained design reference;
update it alongside approved changes to shared design patterns. Historical
concepts in `docs/design/` do not override the current system.

## Ownership and autonomy

Carry the requested work through implementation, focused tests, a running app,
and a visual review. Drew authorizes routine implementation choices, fixes,
development-backend updates, and repeated QA in this project without asking for
confirmation each time. Keep working on independent parts when an external
service needs the account holder. Preserve unrelated work. Real bank consent,
new spending, public publication, and destructive actions still require
authorization covering that specific action; reuse authorization already given.

## Quality bar

Aim for a complete, polished product, roughly a 9/10 experience. Proactively fix
nearby usability defects within the requested scope. This includes spacing,
clear copy, motion, keyboard use, tablet/laptop layouts, and functional accuracy.
Do not equate more features or abstractions with higher quality. Finish and
verify the current experience before expanding it.

- Keep code readable: small named functions, explicit domain types, shared money
  and date helpers, and comments explaining decisions or invariants.
- Register every new screen and preference in
  [the search catalog](src/lib/searchCatalog.ts). Search should find familiar
  terms such as light mode, dark mode, font, receipts, and bank connections.
  Deep links must open the relevant setting or filter, not just a generic page.
- Use restrained motion that clarifies state changes. Prefer existing or native
  capabilities for simple transitions; research a library when it adds material
  value. Respect reduced motion and avoid repeated chart reflow; the only
  startup animation is the net-worth reveal described under Motion.
- Inspect actual rendered UI and screenshots after changes settle. Exercise the
  interaction, not just its default appearance. Check laptop and iPad widths,
  then a narrow phone layout where relevant. Review both themes, focus behavior,
  padding, overflow, loading, and failures.
- Use only fictional or authorized QA data for fixtures and saved screenshots.
  Test imports, exports, receipts, and persistence with real browser interactions.
- Choose meaningful regression tests for finance, dates, ownership, and state
  changes. Run the relevant checks and repeat them after material fixes. Record
  observed results and remaining limits honestly in [verification](docs/verification.md).
- Research competitors and user feedback when extending the product. Retain
  Marten's calm visual style and adopt improvements that solve a concrete need.

## Consistency rules

One product, one vocabulary. Before adding a control, look for the shared one:

- Controls: `Button`, `IconButton`, `Field`, `Picker`, `Select`, `Tabs`,
  `Toggle`, `Modal`, `Empty`, `Loading`, `Avatar` in
  [`ui.tsx`](src/components/folio/ui.tsx); dates use `DatePicker`; colors use
  `ColorPicker`; category artwork uses `CategoryIcon`; animated totals use
  `AnimatedMoney`. Do not hand-roll a second calendar, menu, or dialog.
- Icons: Lucide only. Keep one icon per concept across pages (home for
  Dashboard, wallet for Accounts, list for Transactions, bar chart for Cash
  Flow, pie for Reports, calendar for Recurring, trending line for Investments,
  arrow-trend for Forecast, gauge for Credit scores, link for bank connections,
  key for tokens). A new icon for an existing concept is a bug.
- Buttons: one primary action per view, placed top-right in the page header.
  Empty-state and inline actions are secondary (outline). Destructive actions
  use the danger tone and confirm first.
- Hover and selection: sidebar-style items (main nav, settings nav, list rows)
  share the `--selected` background on hover; chart shapes and their legends
  highlight each other on hover and keep values readable without hover.
- Motion: 160ms hover/fade, 240ms drawers and sidebar, tweened totals; net-worth
  charts sweep in left-to-right (about 680ms, ease-out) on first load and on an
  explicit range change only, never on resize or live data ticks; no other
  reveal animations on data changes; respect reduced motion.
- Copy: plain sentences, no provider jargon in user-facing text, prices and
  limits attributed to the provider, and no promises about live data that has
  not been verified.
- Loading and empty states: whole-screen waits are centered (`Loading full`);
  empty states explain what will appear and offer one action.

## Tools and references

- Design polish: use the `impeccable` and `frontend-design` skills for
  redesigns and audits, and the Mobbin MCP (`search_screens`, `search_flows`)
  to compare against Monarch Money, Origin, Copilot, Simplifi, Quicken, Stripe
  and similar well-designed products before inventing a pattern.
- Verification: drive the running app in the Claude Browser pane (or the
  `agent-browser` CLI) with fictional data at `/demo` or a fictional QA
  account; screenshot both themes and desktop/tablet/phone widths.
- Convex work: read `convex/_generated/ai/guidelines.md`; keep public
  functions on `userQuery`/`userMutation`/`userAction` with ownership checks.

## Keep the record current

When an integration, provider, dependency, or workflow changes, update the
matching guide in `docs/` in the same change: [architecture](docs/architecture.md),
[development](docs/development.md), the provider guides
([Plaid](docs/plaid.md), [SimpleFIN](docs/simplefin.md),
[bank provider options](docs/bank-provider-options.md)),
[self-hosting](docs/self-hosting.md), the search catalog, the FAQ, and
[verification](docs/verification.md). Retire documentation for removed
features rather than leaving it beside the replacement.

Agent access reuses the same owned business operations as the interface. Keep
browser access opt-in and remote MCP grants revocable, with read access as the
default. Forecasting must expose assumptions and distinguish actual data,
expected activity, and modeled outcomes.
