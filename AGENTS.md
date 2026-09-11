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
  value. Respect reduced motion and avoid repeated chart reflow or startup animation.
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

AI is a separate future capability. Forecasting must expose assumptions and
distinguish actual data, expected activity, and modeled outcomes.
