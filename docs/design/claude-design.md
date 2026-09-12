# Using Marten's system in Claude Design

Reviewed September 12, 2026. The repository's [DESIGN.md](../../DESIGN.md) is the
maintained reference. This guide prepares a Claude Design copy; no system was
created, synced, or published in a Claude account as part of this documentation.

## What Claude Design provides

Claude Design extracts a reusable UI kit from code, documents, and brand assets.
Its setup guide recommends reviewing the generated palette, typography,
components, and layout in a test project. An organization's **Published** toggle
makes its system the default for new projects in that organization. Existing
systems can be opened and remixed from organization settings. See Anthropic's
[design-system setup guide](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design).

The current getting-started guide also documents GitHub/file imports and
`/design-sync` in Claude Code, plus an official Design MCP connection. A local
Markdown file by itself does not establish that connection or prove that a
remote system is synchronized. See
[Claude Design and Claude Code](https://support.claude.com/en/articles/14604416-get-started-with-claude-design).

## Marten source selection

Start with these materials; use source from the same revision as the guide:

| Material             | Include                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Main brief           | Root DESIGN.md                                                                                                                                  |
| Shared styles        | src/index.css and the CSS files in src/components/folio                                                                                         |
| Shared controls      | src/components/folio/ui.tsx, Select.tsx, DatePicker.tsx, dateInput.ts, ColorPicker.tsx, CategoryIcon.tsx, AnimatedMoney.tsx                     |
| Charts               | src/components/folio/charts.tsx, charts.css, MoneyFlow.tsx, moneyFlow.css; src/lib/constants.ts                                                 |
| Layout references    | src/features/Shell.tsx and representative Dashboard, Transactions, Reports, Recurring, and Preferences source                                   |
| Fonts and assets     | The locally installed DM Sans font files/license, public/marten-mark.png, the generated public/category-icons/marten catalog and its provenance |
| Illustration rules   | docs/design/category-icons/README.md and its review.html                                                                                        |
| Interaction research | docs/design/mobbin-review.md; links and written conclusions, not private competitor screenshots                                                 |
| Website extension    | src/site/site.css, Site.tsx, representative site components, and locally installed Bricolage Grotesque font files/license                       |
| Visual reference     | Fresh, clearly labeled fictional /demo captures of dashboard, drawer/calendar, reports, and preferences in both themes                          |

This is a design reference selection, not a standalone runnable app: the React
components import other modules. For runnable prototypes, let the normal
repository dependency graph supply those modules and use fictional data in
place of live account services.

Keep environment files, credentials, exports, receipts, database content, logs,
and screenshots of real finances out of the design materials. Use a reviewed
file selection rather than uploading the whole working folder by default.

## Setup and acceptance

1. Open [Claude Design](https://claude.ai/design) and select the intended account
   or organization. Import the reviewed Marten materials through its system
   setup flow. Name the system **Marten**.
2. Use the extraction brief below. Review the output against root DESIGN.md and
   the actual `/demo` app; an attractive approximation is insufficient.
3. Create a fictional dashboard and a transaction drawer with its nested date
   and category pickers. Include light/dark and iPad/narrow layouts.
4. Check the font boundary, semantic light/dark color pairs, primary/outline
   buttons, mark proportions, icon vocabulary, field geometry, and chart labels.
   Check keyboard focus, Escape, type-ahead, wheel scrolling in a dialog, and
   reduced motion. Static screenshots cannot prove those behaviors.
5. Keep the imported copy private while reviewing it. Only enable the
   organization default after its scope and output are intentional; that setting
   changes what other new projects inherit. Record the system URL and source
   revision here once verified.

### Extraction brief

> Extract the existing Marten design system from the attached source and
> DESIGN.md. Preserve its established identity and interaction contracts.
> Use semantic light/dark colors, DM Sans and its system-font preference,
> compact app controls, the original marten mark, Lucide interface icons,
> and Marten's theme-aware category illustrations. Keep Bricolage Grotesque
> display typography and editorial spacing scoped to the public site.
> Reuse the supplied React components wherever possible. Document gaps or
> conflicts explicitly instead of silently inventing a new standard. Build a
> review page showing control states, typography, colors, navigation, a
> financial chart, and a transaction drawer with a nested date/category picker.
> Use clearly labeled fictional finances. Follow DESIGN.md for chart motion,
> focus, keyboard behavior, responsive layouts, and reduced motion.

### Brief for future features

> Use the Marten design system and read the current repository DESIGN.md.
> Build [feature] for [user task] within the [app/public-site] surface.
> Start from [nearest existing screen]. Reuse its shared components, semantic
> tokens, icons, font preference, and money/date helpers. Include normal,
> empty, loading, failure, long-label, keyboard, and narrow-layout states.
> Keep financial assumptions and sample data explicit. List any proposed
> additions to the design system with their concrete reuse case. Return the
> component mapping and interaction notes with the design.

## Keep the copies aligned

The repo remains the maintainable record because its design changes can be
reviewed alongside implementation. Update source, DESIGN.md, and its preview
metadata together. Refresh the Claude Design copy through the supported import
or sync flow, then verify a representative screen. Record the revision and any
intentional differences. Do not treat a Claude Design handoff as permission to
replace existing controls with generated duplicates.

The original [launch article](https://www.anthropic.com/news/claude-design-anthropic-labs)
provides background; use the current help pages above for setup details.
