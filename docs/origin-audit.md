# Origin interaction audit

Observed in the authenticated web application on September 10–11, 2026, using the user-authorized session. Forecast onboarding was completed with the existing inputs/defaults after the user explicitly authorized it. These observations describe interface behavior, not the accuracy of a personal financial plan. No real balances, account identifiers, demographic details, or private screenshots belong in this repository.

## Dashboard and investments

The dark dashboard uses a near-black page, subtly lighter bordered cards, small uppercase section labels, large monetary values, and secondary filters inside the cards. The main column carries net worth, spending and investments; a narrower column carries supporting content and promotions. Spending combines a calendar heatmap and recent activity. Credit is an unfinished connection/enrollment entry point; its data path was not exercised.

Invest has Overview, Holdings and Market Watch navigation. The overview combines a collapsible account list, connection timestamps, a balance/history chart, date ranges, and benchmark comparison in a single card. Holdings exposes search, account/date filtering, sortable columns, pagination, and a denser view. Risk assessment compares allocation with a model risk profile. Newly linked holdings/history had incomplete coverage during this audit, so visible balances did not establish verified portfolio performance.

For Marten, retain a common metric/chart/filter structure and explicit account coverage. Avoid showing an illustrative line as observed history, equating balance change with investment return, or assuming missing holdings mean no investments. Keep promotions and repeated AI calls away from the main planning work.

## Forecast onboarding, step by step

The introduction transitions into a full-screen wizard with Back, Close, a progress bar, a restrained form column, large serif headings, and nature photography. The photographs provide visual warmth but consume much of the desktop viewport; several forms require scrolling before Continue.

| Step             | Observed inputs and interaction                                                                              | Marten implication                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Personal context | Birth date, address, tax filing status, dependents, optional partner                                         | Ask only for facts required by the actual model; an after-tax model does not need an address.     |
| Accounts         | Institution-grouped balances and an Add account control                                                      | Explain which balances are liquid, restricted, excluded, or debt.                                 |
| Income           | Explicit annual gross income; optional growth rate/frequency and additional income with start/end years      | Make net versus gross unmistakable and expose the growth assumption.                              |
| Expenses         | Historical monthly spending chart, average, editable monthly baseline and source context                     | Show the averaging window and imported-data limits; do not silently assume blank months are zero. |
| Liabilities      | Linked debt list and editable amount in the inspected card                                                   | Debt balance alone does not establish a payment or amortization plan.                             |
| Retirement       | Lifestyle presets or custom monthly spending; retirement age with calendar-year helper; contributions dialog | Put age, spending and income next to the resulting balance and depletion date.                    |
| Horizon          | Planning age and optional legacy target                                                                      | Label the horizon as a planning assumption, not a prediction of lifespan.                         |

The contributions dialog has automatic and manual modes. Manual mode offers traditional/Roth 401(k) and IRA selections, dollars or percentage of salary, employer match and a limit summary. It was inspected without saving changes. This is stronger evidence of the current interface than conflicting older marketing claims about contribution support; calculation correctness was not independently tested.

## Generated forecast and scenario editing

The generated scenario has Net Worth, Cash Flow and Success views, an age/date control, event markers on the timeline, and a common Add events or customize entry point. An annual assets/liabilities ledger follows the net worth chart. Cash Flow separates salary, Social Security, living expenses, annual taxes, and event cash flows. Success shows an outcome band, end-balance statistics and an unavailable state when liquidity fails. Its explanation applies additional illiquidity penalties to the displayed success score. Marten should not imitate that score without a defined and tested stochastic model.

The event menu includes retirement, home purchase/sale, child, education, windfall, additional income, equity, and a custom event. The custom expense form accepts a name, amount, frequency, and start/end year. Frequencies include one time, monthly, annual and multi-year intervals. It has no dedicated trip-count/cost-per-trip controls. A draft was inspected and abandoned without saving.

Customize data groups financial inputs, personal facts and model assumptions. The portfolio-growth editor presents one global annual return; inflation and a today's-value switch are separate. The scenario menu exposes individual/joint type, title and default status. Scenario creation and comparison entry points were visible, but a second scenario was not saved, so the comparison result itself remains unverified.

The strongest transferable pattern is a single graph with nearby assumptions and inspectable annual accounting. The weakest pattern is hiding important assumptions behind nested dialogs while emphasizing an alarming forecast or ambiguous success score. The observed baseline was generated to inspect UI, and its spending assumptions were not validated as a personal budget.

## Practical Marten contract

Build an explicit deterministic scenario first: liquid cash, accessible investments, retirement assets and access age; current/retirement/planning ages; after-tax income and living spending; retirement income/spending; annual return, inflation and income growth; travel count times cost and years; a legacy target. Clearly separate this projection from actual activity and short-term scheduled cash flow.

Answer three concrete jobs: annual travel cost and savings needed; balances at alternative retirement ages and how long accessible funds last; how an assumed annual investment return changes the result. Compare saved input snapshots, show dollars in today's purchasing power, and offer an annual ledger. Extra savings must come from an explicit spending reduction or income increase rather than being added to a surplus already invested by the model.

Do not label assets as net worth while excluding debt; do not count retirement assets as immediately spendable; do not double count transfers, credit-card payments, dividends and modeled growth, or travel already in baseline spending. Effective after-tax assumptions are a practical first version. Federal/state tax calculation, legal withdrawal exceptions, optimization and Monte Carlo require separate research and verification.
