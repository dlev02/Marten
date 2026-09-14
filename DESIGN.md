---
name: Marten
description: Calm, clear personal finance with warm neutrals and muted petrol blue.
colors:
  canvas: "#f6f5f3"
  surface: "#fff"
  text: "#22201d"
  muted: "#77746f"
  border: "#e9e6e2"
  strong-border: "#d4d0ca"
  hover: "#f5f3f0"
  selected: "#ebe8e3"
  accent: "#356587"
  accent-ink: "#fff"
  accent-hover: "#295472"
  positive: "#188567"
  positive-ink: "#fff"
  negative: "#c45846"
  negative-ink: "#fff"
  blue: "#039dbb"
  avatar: "#ece9e3"
  dark-canvas: "#191917"
  dark-surface: "#242421"
  dark-text: "#f3f1eb"
  dark-muted: "#aaa79f"
  dark-border: "#373733"
  dark-strong-border: "#54544e"
  dark-hover: "#2c2c28"
  dark-selected: "#363630"
  dark-accent: "#83b8d5"
  dark-accent-ink: "#152b3b"
  dark-accent-hover: "#a2cee6"
  dark-positive: "#6ac3a3"
  dark-positive-ink: "#142e23"
  dark-negative: "#e68c78"
  dark-negative-ink: "#351b15"
  dark-blue: "#56becf"
  dark-avatar: "#3a3a33"
typography:
  total:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "33px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-1.2px"
  headline:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.95px"
  title:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.35px"
  body:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  site-display:
    fontFamily: '"Bricolage Grotesque Variable", "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(40px, 6.2vw, 78px)"
    fontWeight: 520
    letterSpacing: "-0.028em"
rounded:
  control: "6px"
  navigation: "7px"
  select: "8px"
  menu: "10px"
  panel: "11px"
  dialog: "12px"
spacing:
  control-gap: "7px"
  compact: "8px"
  actions: "10px"
  inline: "12px"
  form-grid: "14px"
  form-stack: "16px"
  panel-inset: "20px"
  section: "24px"
  page-inset: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.negative}"
    textColor: "{colors.negative-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
    typography: "{typography.body}"
  navigation-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.navigation}"
    padding: "0 13px"
    height: "42px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
---

# Design System: Marten

## Overview

**Creative North Star: "Calm clarity for everyday money."**

Marten feels composed, familiar, and carefully made. Warm neutral surfaces,
muted petrol blue, readable financial information, and gently rounded controls
support the task at hand. Personality comes from the curled marten mark and
the original everyday category illustrations. The interface earns trust through
clear labels, stable layouts, inspectable numbers, and predictable interactions.

This is the living design reference for extending the existing product. It
captures the working checkout on September 12, 2026, including work still in
progress; it is not a claim about a published release. Read it before creating
a screen, component, illustration, or preference. Pair it with the
[product context](PRODUCT.md), [architecture](docs/architecture.md), and
[financial contracts](docs/requirements.md#financial-invariants).

**Key Characteristics:**

- Warm, quiet surfaces with restrained borders and shallow depth.
- Compact, legible app layouts with deliberate room around groups.
- One vocabulary for controls, icons, navigation, and financial states.
- Motion that explains a change while keeping the surrounding layout steady.
- Equal attention to light/dark appearance, keyboard use, and iPad interaction.

### Authority and scope

The tokens in this file describe existing values; they are not a second runtime
theme. Implement with the CSS variables and shared components linked below.
When an approved design change lands, update its source and this reference in
the same change. If the source and documentation disagree, inspect the current
render and resolve the discrepancy; do not blindly copy an old screenshot.

| Reference                                                         | Owns                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Application CSS](src/index.css)                                  | Theme variables, base type, shell, panels, buttons, dialogs, layout |
| [Shared UI](src/components/folio/ui.tsx)                          | Product control APIs, focus behavior, feedback                      |
| [Public site CSS](src/site/site.css)                              | Marketing display typography and editorial layouts                  |
| [Brand provenance](docs/design/brand.md)                          | Approved mark, identity history, generation prompt                  |
| [Category artwork contract](docs/design/category-icons/README.md) | Illustration palettes, geometry, aliases, generation and review     |
| [Mobbin review](docs/design/mobbin-review.md)                     | Observed references and the particular patterns adopted             |
| [Verification](docs/verification.md)                              | What was actually tested, when, and remaining limits                |
| [Claude Design handoff](docs/design/claude-design.md)             | Import materials, setup and future prototype brief                  |

The app and public site share the brand but have different jobs. The app is an
operating interface; its hierarchy favors scanning and editing. The public site
introduces the product and uses larger display type and more space. Preserve
these boundaries when expanding either surface.

### Brand assets

Use [the transparent marten mark](public/marten-mark.png) through the existing
`Brand` component in [Auth.tsx](src/features/Auth.tsx). Its alpha acts as a CSS
mask colored with `--accent`; the wordmark remains live text. Keep the silhouette
and proportions. Do not redraw the mark, turn it into a coin, or repeat it in
every category. Follow the existing icon assets for favicons and app icons.

Write **Marten** in product copy. `folio` in component paths and browser
preference keys is a compatibility detail, not a second product name.

## Colors

### Primary

Petrol blue is the action and identity color: `--accent`, `--accent-hover`, and
`--accent-ink`. Pair background and ink tokens together. Dark appearance uses a
lighter blue with dark ink, rather than keeping white text on the light accent.

Use the accent for the primary action, selected calendar days, and the mark.
Chart cyan (`--blue`) has a separate role in data and app focus indicators.
Do not substitute chart cyan for the primary button color.

### Neutral

| CSS variable           | Frontmatter keys (light / dark)        | Use                                                |
| ---------------------- | -------------------------------------- | -------------------------------------------------- |
| `--canvas`             | `canvas` / `dark-canvas`               | Page and sidebar ground                            |
| `--surface`, `--panel` | `surface` / `dark-surface`             | Panels, inputs, popovers, dialogs                  |
| `--text`               | `text` / `dark-text`                   | Titles, primary copy, figures                      |
| `--muted`              | `muted` / `dark-muted`                 | Supporting labels and metadata                     |
| `--border`             | `border` / `dark-border`               | Quiet structural edges and dividers                |
| `--strong-border`      | `strong-border` / `dark-strong-border` | Interactive control boundaries                     |
| `--hover`              | `hover` / `dark-hover`                 | Control hover surfaces                             |
| `--selected`           | `selected` / `dark-selected`           | Sidebar/list selection and shared navigation hover |
| `--avatar`             | `avatar` / `dark-avatar`               | Fallback identity backgrounds                      |

Use semantic variables in feature CSS, including portaled content. `.dark`
supplies the app palette; `next-themes` supports light, dark, and system modes.
Do not add an independent OS-theme query inside an app component.

### Financial and categorical color

`--positive` and `--negative` describe financial direction or status; their ink
partners support filled controls. A raw transaction sign is not a category:
a refund may be a negative expense, and a transfer is not income. Use the shared
formatting and reporting helpers before choosing a label or color. Always pair
color with a value, label, icon, or state text.

The twelve-series palette lives in [constants.ts](src/lib/constants.ts).
Reuse that ordered palette and existing series assignments for breakdowns.
Cash-flow bars intentionally use their existing income/expense pair in
[charts.tsx](src/components/folio/charts.tsx); those are data colors, not button
tokens. Category artwork has its own coordinated light/dark palette in the
[artwork source](scripts/category-icon-art.mjs). Neither palette replaces the
semantic interface colors.

Public-site petrol scene colors are scoped to `.site` in
[site.css](src/site/site.css). Keep those presentation colors out of app tables,
forms, and settings.

## Typography

DM Sans is locally bundled at weights 400, 500, 600, and 700 in
[main.tsx](src/main.tsx). `--font-app` includes native system fallbacks.
The System font preference changes this variable; all app controls, chart ticks,
and generated previews must respect it. Avoid remote font requests.

| Role          | Existing treatment            | Where                                       |
| ------------- | ----------------------------- | ------------------------------------------- |
| Primary total | `typography.total`            | Net-worth hero; tabular figures             |
| Page title    | `typography.headline`         | One h1 per app page; 25px on narrow layouts |
| Section title | `typography.title`            | Panel headings                              |
| Small heading | 15px, 600, −0.15px tracking   | h3 and subordinate groups                   |
| Body          | `typography.body`             | App text and basic inputs                   |
| Field label   | 13px, 500                     | Labels above controls                       |
| Button label  | `typography.label`            | Shared action buttons                       |
| Navigation    | 15px, 400; selected 600       | Sidebar rows                                |
| Caption       | 12px                          | Supporting copy and metadata                |
| Chart tick    | 11px, `--muted`, `--font-app` | Axes; full values also available elsewhere  |

Weight 600 establishes hierarchy; 700 is used selectively, including the
wordmark. Do not make every label bold. Use tabular numerals for aligned money
and changing totals. Right-align comparable amounts, preserve signs, and use
`money`, `compactMoney`, and calendar helpers from
[format.ts](src/lib/format.ts). Do not format cents as dollars directly.

### Public-site display type

The public site adds locally bundled **Bricolage Grotesque Variable** through
`--font-display`, with weight 520, tracking −0.028em, and optical/width axes set
in `.site h1/h2/h3`. Its hero scales from 40px to 76px; body copy is 16px/1.55.
These are marketing roles. Keep DM Sans in app headings, forms, and charts.
Do not apply the app's compact density to a reading page.

## Layout

### Spacing and composition

There is no universal runtime spacing scale yet. The frontmatter records reused
measurements; it does not introduce new CSS variables. Preserve the component's
own geometry rather than rounding every value to an invented grid.

| Pattern                       | Current geometry                                         |
| ----------------------------- | -------------------------------------------------------- |
| Expanded / collapsed sidebar  | 236px / 76px; user-controlled on desktop                 |
| Main content                  | Max 1800px, centered within the remaining area           |
| Desktop page padding          | 29px top, 28px sides, 50px bottom                        |
| Page header                   | Title left, actions right; 24px bottom separation; wraps |
| Header actions                | 10px gap; 8px in narrow layouts                          |
| Panel header                  | 18px top, 20px sides, 14px bottom; min-height 61px       |
| Form stack / field separation | 16px                                                     |
| Paired form fields            | Two columns, 14px gap; collapse when space requires      |
| Standard modal                | Max 520px, 23px padding, max-height 90dvh                |
| Wide modal                    | Max 940px                                                |
| Detail drawer                 | 520px, full height; sticky heading and footer            |
| Public-site container         | Max 1180px; gutter `clamp(20px, 4vw, 48px)`              |

Reuse [PageHeader.tsx](src/components/folio/PageHeader.tsx), `Panel`, the existing
toolbar classes, and the nearest feature layout. Put one primary action at the
top right when the page has a main creation/action task. Place secondary actions
beside it or within their relevant section. Empty-state actions are outline,
including dashboard widgets; an add action carries the plus icon and opens its
form directly. A section's own add action lives only in its empty state until
the section has items, then moves to the section heading.
Within a dialog, put its primary confirmation at the end of the action row.

### Responsive behavior

- At 1240px and below, existing layouts tighten selected gaps and controls.
- At 1000px and below, dense multicolumn app sections simplify. Inspect the
  feature stylesheet; not every panel shares one breakpoint.
- At 760px and below, the desktop sidebar gives way to an offcanvas menu and
  mobile bar. Content uses 16px horizontal padding; panels use 10px corners.
  Drawers use the viewport width and forms/actions wrap.
- At 440px and below, content uses 14px horizontal padding; header actions can
  take their own row. Keep action text and financial amounts legible.
- The public site has its own 960px and 760px adaptations.

Contain horizontal scrolling within a transaction/report region when needed.
Keep amounts available and avoid outer-page horizontal overflow. Settings keep
a lighter secondary rail that becomes horizontal navigation on small screens.
Coordinate sticky headings and rails with the demo banner.

The accessibility target is at least 44px for touch interactions. Compact mouse
controls currently vary (for example, 36px buttons and 32px icon buttons);
Picker and Select have coarse-pointer rules. Treat touch sizing as a check to
perform, not an assertion that every existing control already meets it.

## Elevation & Depth

The app uses tonal layering, thin edges, and small shadows. A panel sits quietly
on the canvas; stronger shadows belong to temporary surfaces that cover content.

| Surface                  | Source treatment                                                        |
| ------------------------ | ----------------------------------------------------------------------- |
| Panel                    | `--shadow`: small warm shadow in light mode, small black shadow in dark |
| Input / button           | Nearly invisible 1px lift plus a clear control border                   |
| Select menu              | Two soft shadows, with an edge and 10px corners                         |
| Calendar / color popover | `0 12px 36px #00000020`                                                 |
| Modal                    | `0 18px 80px #0003`                                                     |
| Drawer                   | `-8px 0 45px #0002`                                                     |

Demo workspaces disable vertical document rubber-banding so the sticky banner
cannot move independently of the fixed sidebar. Normal page scrolling remains enabled.

Overlay layers in the current implementation: desktop sidebar 30, demo banner 31, modal scrim 100,
dialog/drawer 101, date/color popovers 110, Select/Picker 120, tooltip 1200,
toast 1500. Reuse the owning component's stacking behavior. Raising z-index
alone does not fix a menu outside a dialog's scroll boundary.

Focus is visible and distinct from hover: app controls use a 2px `--blue`
outline with a 2px offset; compound date/search fields frame the whole control.
The public site uses its accent with a 3px offset. Do not remove focus outlines
without providing the shared equivalent.

## Shapes

Rounded rectangles establish a consistent family without making every component
identical. Existing radii are 6px for buttons/basic inputs, 7px for navigation
and date/color triggers, 8px for Select and segmented containers, 10px for Select
menus and mobile panels, 11px for desktop panels and date/color popovers, and
12px for dialogs. Avatars and status dots are circular. Reuse these components
instead of adding another corner style per feature.

The marten mark and category artwork use clear silhouettes. The original
category SVGs have a 32×32 viewBox, typically two to four flat colors, broad
interior detail, and optical sizing for recognition at 24px. Their contract
excludes gradients, texture, shadows, tiny lettering, and decorative sparkles.

## Components

### Shared component map

Import product controls from the paths below. The lower-level
`src/components/ui` primitives support them; using a raw primitive for an
ordinary Marten control can bypass its styling and behavior.

| Need                    | Reuse                                                                                              | Contract                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Action                  | `Button` in [ui.tsx](src/components/folio/ui.tsx)                                                  | `tone="default"`, `primary`, `quiet`, or `danger`; optional icon; default type is button, set submit explicitly in forms |
| Icon-only action        | `IconButton` in ui.tsx                                                                             | Required accessible `label`; tooltip; visible focus                                                                      |
| Section                 | `Panel` in ui.tsx                                                                                  | Shared heading/action row, edge and clipping                                                                             |
| Labeled form group      | `Field` in ui.tsx                                                                                  | Visible label, control and supporting content; wire labels to control IDs                                                |
| Short fixed choice      | [Select.tsx](src/components/folio/Select.tsx)                                                      | Radix keyboard/type-ahead behavior; labeled options; supports an empty filter value                                      |
| Long/searchable choice  | `Picker` in ui.tsx                                                                                 | Search, groups, current selection, scrolling and keyboard navigation                                                     |
| Calendar date           | [DatePicker.tsx](src/components/folio/DatePicker.tsx)                                              | DayPicker plus typed date entry and min/max validation                                                                   |
| Date range              | [DateRangeButton.tsx](src/components/folio/DateRangeButton.tsx)                                    | One calendar button: preset ranges first, then a custom From/Through pair; Transactions and Reports share it             |
| Category/tag color      | [ColorPicker.tsx](src/components/folio/ColorPicker.tsx)                                            | Shared swatches and validated custom hex entry                                                                           |
| View selection          | `Tabs` in ui.tsx / existing `.segments`                                                            | Underlined page tabs or compact segmented view controls; keep the established context                                    |
| Boolean preference      | `Toggle` in ui.tsx                                                                                 | Label and optional description; visible checked/disabled/focus states                                                    |
| Explaining a figure     | `InfoTip` in ui.tsx                                                                                | A small "i" beside the number or label it explains, with the note in its tooltip; never a freestanding footnote          |
| Dialog/detail panel     | `Modal` in ui.tsx                                                                                  | `wide` for complex forms, `drawer` for inspection/editing in context                                                     |
| Waiting / no data       | `Loading`, `Empty` in ui.tsx                                                                       | `Loading full` for whole-page waits; concise explanation and one useful empty-state action                               |
| Feedback                | `useTask`, `useToast` in ui.tsx                                                                    | Pending state and readable failures; local inline errors for field correction                                            |
| Identity                | `Avatar` in ui.tsx                                                                                 | Bundled merchant mark or clear initials; use existing logo lookup                                                        |
| Category illustration   | [CategoryIcon.tsx](src/components/folio/CategoryIcon.tsx)                                          | Theme-aware original SVG or saved system emoji preference                                                                |
| Changing total          | [AnimatedMoney.tsx](src/components/folio/AnimatedMoney.tsx)                                        | Integer cents, tabular figures, reduced-motion support                                                                   |
| Financial visualization | [charts.tsx](src/components/folio/charts.tsx), [MoneyFlow.tsx](src/components/folio/MoneyFlow.tsx) | Shared axes, tooltips, legends, palette and interaction                                                                  |

### Buttons, fields, and interaction states

Default buttons are outlined surfaces; primary buttons use the blue action
pair; quiet buttons remove the border; danger buttons use the negative pair
and destructive operations require confirmation. The shared mouse button is
36px high with 8px × 12px padding, 13px/500 text, and a 7px icon gap. Basic
inputs use min-height 38px and 8px × 11px padding. Modal fields have additional
shared sizing rules; reuse those instead of matching a screenshot by hand.

Every control needs its applicable default, hover, focus, active/selected,
disabled, pending, and error states. Keep the control's width and surrounding
geometry stable during saving or bulk-selection changes. An invalid value stays
editable and explains how to fix it. Do not show a disabled control as if it
saved successfully.

### Dates, pickers, and dialogs

Date values cross the component boundary as calendar strings (`YYYY-MM-DD`),
with `MM/DD/YYYY` typed presentation. Enter or blur validates a draft; ArrowDown
opens the calendar. Invalid dates keep an inline error and do not become valid
saved values. Month and year use the shared Select. Returning focus to the
input after closing is part of the control.

Use `Select` for short choices and `Picker` for searchable account, category,
merchant, or tag lists. Preserve full labels where practical, real wheel
scrolling, keyboard selection, and reachable selected values. Menus must fit
the viewport in both themes.

`Modal` provides `PickerPortalContext`. Nested Select, Picker, and DatePicker
content stays within the dialog's allowed scroll boundary; this prevents the
failure where a menu looks scrollable but ignores the wheel. Preserve focus
trapping, first-input focus, Escape dismissal, and return focus to the opener.
Check nested popover dismissal before the parent dialog, especially the year
menu and category picker.

For a dialog that offers several optional changes, such as the rule editor in
[Rules.tsx](src/features/settings/Rules.tsx), list each change as a row with a
switch in the row head and its controls unfolding beneath it (grid rows
animating from 0fr to 1fr over 240ms, disabled and invisible while off). This
keeps the dialog's shape stable, shows every capability at a glance, and avoids
"keep current" placeholder options. Reuse the `.toggle-row` switch visuals for
the row head; do not add a second switch style.

### Icon vocabulary

Use **Lucide outline** for interface actions and navigation. Navigation icons
currently render at 21px with a 1.7 stroke; controls generally use 15–17px icons,
with larger close/menu affordances where already established. Match the nearby
shared component rather than normalizing all SVGs to one size.

| Concept                  | Existing Lucide export                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| Dashboard                | `Home`                                                                  |
| Accounts                 | `WalletCards`                                                           |
| Transactions             | `List`                                                                  |
| Cash Flow                | `BarChart3`                                                             |
| Reports                  | `PieChart`                                                              |
| Recurring / calendar     | `CalendarDays`                                                          |
| Investments              | `ChartNoAxesCombined`                                                   |
| Forecast                 | `TrendingUp`                                                            |
| Credit scores            | `Gauge`                                                                 |
| Search                   | `Search`                                                                |
| Settings                 | `Settings2`                                                             |
| Bank connection actions  | `Link2` in Institutions; settings navigation currently uses `Building2` |
| Add / close / attachment | `Plus` / `X` / `Paperclip`                                              |

Lucide is the interface vocabulary, not a ban on the approved illustrated
category library or merchant logos. Preserve those separate roles. Category
aliases and the System emoji preference must keep their saved meaning; do not
replace unknown emoji by guessing from a category's name. Merchant marks use
the local catalog documented in [assets.md](docs/assets.md), with initials when
needed. Never send private transaction descriptions to an image service.

The project instruction's conceptual link/key vocabulary is guidance for bank
connections and tokens; existing settings navigation is not fully standardized
to it. Resolve the owning shared mapping when changing that surface rather
than documenting an unused icon export as already implemented.

### Charts and financial presentation

- Reuse `NetWorthChart`, `FlowChart`, `SpendingDonut`, `BreakdownLegend`,
  `BreakdownTreemap`, and `MoneyFlow` as applicable. Keep number/date formatting
  shared with the rest of the app.
- Show the period, units, meaningful totals, and completeness/loading state.
  Full financial values must remain available in labels, legends, tables, or
  accessible descriptions. Hover is supplemental.
- Link chart-shape and legend hover in both directions. Distinguish selection
  without hiding the rest of the financial context.
- Keep the treemap fixed while its value list scrolls. Keep axes outside the
  net-worth reveal clip, and leave space between the curve and right-axis labels.
- Keep net worth based on balances, reports based on their complete selected
  data, and model assumptions visible. Separate actual history, scheduled
  activity, and modeled outcomes. Empty or incomplete data is not zero.
- Forecast sliders retain exact numeric entry and units. Do not infer model
  defaults or safe bounds from a competitor screenshot.

### Motion

| Interaction             | Existing implementation / design contract                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| Hover/fade              | About 160ms; base CSS currently uses 150ms, Select 140ms                      |
| Select menu entry       | 120ms ease-out                                                                |
| Modal entry / scrim     | 200ms / 180ms                                                                 |
| Drawer entry            | 240ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`                                       |
| Sidebar change          | Explicit action only; 240ms snapshot transition                               |
| Theme change            | Explicit action only; 180ms root crossfade                                    |
| Changed financial total | `AnimatedMoney`: 420ms cubic ease-out, starting at the previous value         |
| Net-worth reveal        | 680ms, `cubic-bezier(0.22, 0.61, 0.36, 1)`, on mount or explicit range change |

The net-worth reveal never replays on resize or live balance updates; compact
sparklines render immediately. Other financial charts disable Recharts reveal
animation. Do not enable animation merely because an `animationDuration` prop
exists. Keep resizing geometry immediate to prevent a path crossing moved axes.

Existing route/settings entry fades and public-site scene transitions are
surface-specific. They are not permission to animate every panel, every update,
or every report calculation. Reuse [appearance.ts](src/lib/appearance.ts) and
[useReducedMotion.ts](src/lib/useReducedMotion.ts); reduced motion shows the
settled value/path and disables nonessential movement.

### Copy, feedback, and empty states

Use familiar sentence-case labels and specific verbs: “Add account,” “Import
latest,” “Save changes.” Keep product navigation names consistent and register
new screens/preferences in [searchCatalog.ts](src/lib/searchCatalog.ts), with
deep links to the exact setting or filter. New flows should remain findable by
ordinary terms such as font, dark mode, receipts, and bank connections.

Explain what will appear in an empty view and provide one next step; retain
navigation and the page's structure. Distinguish no records from no search
results, loading, incomplete data, a failed operation, and a disconnected bank.
Label all fictional previews as sample/demo data.

Errors should say what failed and what the person can do next. Preserve a
provider/action and safe diagnostic detail when useful, without raw backend
stacks, secrets, or vague “something went wrong” replacements. Saving feedback
belongs near the edited content. Provider coverage, prices, and freshness must
come from verified product documentation rather than decorative reassurance.

## Do's and Don'ts

### Do

- **Do** start from the nearest working screen and the shared component map.
- **Do** reuse semantic tokens, font preferences, icons, and formatting helpers.
- **Do** keep one clear primary action and retain full, useful labels.
- **Do** preserve focus, wheel scrolling, touch access, and reduced motion.
- **Do** inspect both themes at laptop, iPad, and narrow-phone sizes.
- **Do** distinguish implementation rules from historical references and actual QA evidence.

### Don't

- **Don't** create a second calendar, dialog, picker, button family, or icon vocabulary.
- **Don't** bring public-site display typography into dense application controls.
- **Don't** copy early concept measurements over the current shared styles.
- **Don't** make color or hover the only route to a financial value or status.
- **Don't** replay chart reveals on resize, refresh, or ordinary reactive updates.
- **Don't** publish fictional examples as real data or save private finances in design artifacts.

### Extending the system

Before adding a shared abstraction, identify concrete repeated behavior that the
existing components cannot express. Extend the existing API when that keeps its
call sites clear. Keep a pattern local while it serves one feature; promote it
when real reuse justifies a shared owner. Update this map when an approved
component replaces an older one, so both do not remain “standard.”

For each UI change, review normal, empty, loading, failure, and long-label states;
Tab/Shift+Tab, Enter, Escape, arrow keys and type-ahead where relevant; a nested
picker's wheel behavior; and actual touch-size layout. Check at approximately
1440×900, 820×1180, and 390×844 in both themes, plus the relevant breakpoint
boundaries. These are QA viewports, not new CSS breakpoints. Run checks required
by [development.md](docs/development.md) and record observed results in
[verification.md](docs/verification.md).

Update the CSS/component first, then the corresponding tokens/prose here and
the [.impeccable/design.json](.impeccable/design.json) preview metadata. That
sidecar contains small visual specimens, not alternate production components.
The existing [category review sheet](docs/design/category-icons/review.html)
remains the full artwork reference. Refresh any Claude Design copy after the
repository change is reviewed; an imported copy does not automatically make
this local file a live synchronization mechanism.

### Reordering and merchant identity

Category groups, categories, tags, rules, and dashboard customization share
[`SortableList`](src/components/folio/SortableList.tsx). Drag from the handle;
the row follows the pointer while siblings move into the proposed position
with a 240ms transform. Space/Enter picks up and drops, arrows move, Escape
cancels, and the existing move buttons remain available. Announcements use
item names and positions. Reduced motion removes the settling transition.
Ordering is optimistic while the existing owner-checked mutation saves it.

The merchant editor is shared by Settings, transaction details, and recurring
schedules. Logo actions align vertically with the avatar and stack on narrow
screens. Saving changes the shared merchant identity, not only the current row.

### Hide amounts

Preferences → Privacy offers a device-local Hide amounts toggle. Financial
amounts and holding quantities use a fixed four-dot mask (`••••`), with the same
font and alignment as the value. Never blur the original digits or reveal on
hover. Keep dates, counts, rates, merchants, logos and chart geometry visible.
Tooltips, chart axes and accessible amount labels use the same masking boundary.
Amount inputs render a disabled masked field, keeping their original draft in
React state. The two merchant actions in transaction details share 12px type.
The profile menu offers the same Hide/Show amounts action for presenting the
current page without navigating away.

Transaction details keep the review action visible and place Hide/Unhide and
eligible Delete in the adjacent overflow menu. Delete uses the negative color
and retains confirmation. Date uses a stacked label and full-width DatePicker,
consistent with the other editable fields; the merchant summary has a 16px top inset.

Public FAQ search applies the focus outline to the full search container via
`:focus-within`, with the inner input outline suppressed. Empty statement lists
use the shared `Empty` component; payment-checkmark guidance is shown only when
there are recurring occurrences or statements to act on. Reports initially opens
Cash Flow, while explicit saved-report links retain their selected report.

The public site's sticky header uses an opaque scene background, including the
night scene, so scrolling text and artwork cannot bleed through navigation.

## Bank connections and chart defaults

Add account leads with parallel SimpleFIN and Lunch Flow service choices. Eligible, configured Plaid installations retain Plaid, with its checking/investment product choice disclosed only after choosing that service. Use concise, left-aligned copy and the shared account-review flow. Unused providers do not each get an empty card; Institutions has one overall empty state and groups connected accounts by bank inside each service. Provider identity comes from data, without fabricated ratings. Avoid repeating a mask already present in an account name.

Preferences → Default charts uses shared selects for spending, income and cash flow. Saved reports preserve their chart; ordinary chart exploration does not overwrite the workspace default. Sankey is offered for cash flow only.

Use `InfoTip` with `disclosure` for secondary guidance such as PDF limits, chart defaults and connection maintenance. It opens on click or touch, has a 44px target, supports links, and closes with Escape or an outside click. Keep requirements needed to complete a form visible. Leave 16px between connection choices and their scope note. Recharts pointer focus must not draw a chart border; preserve visible keyboard focus and arrow-key navigation.

Starter categories are included at workspace creation and reset, organized into focused household groups, using the existing CategoryIcon artwork. Categories opens directly with the groups, without a suggestions banner. Bank-account hover rows have 12px horizontal padding and a minimum 44px height; grouped service rows retain their bank-heading indent.

### Import and connection refinements

Recognized expense sheets expose the year and destination account first; advanced mappings and migration/duplicate explanations remain expandable. Plaid uses a separate step with a Back action, consistent provider icons, and existing dark/light tokens. Institution avatars must keep width, height and min-width at 26px in grouped rows. Connection notices preserve the form beneath them and give recovery steps without a blocking overlay or forced reload.
