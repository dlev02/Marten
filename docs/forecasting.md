# Forecasting

Forecast has two views: **Long term** explores retirement and travel choices; **Near term** shows expected cash balances around upcoming income and bills. Both use explicit assumptions and keep projected activity separate from posted transactions.

## Long-term scenarios

Review the example ages and financial assumptions before interpreting a new plan. Starting funds come from eligible USD accounts; cash, accessible investments, and retirement investments remain separate. Property and other illiquid assets cannot fund spending. Debt balances are disclosed separately; include required loan payments in living spending because the model does not calculate amortization.

Income and spending estimates use recorded activity in the preceding twelve complete calendar months, with split allocations and transfer exclusions. Sparse coverage is disclosed and the average uses months with observed activity. Complete reading of the selected records does not prove complete bank coverage. Review refunds, missing accounts, and one-time expenses.

- Change retirement age, planning horizon, annual investment return, and inflation. Retirement age, return and inflation pair draggable sliders with exact numeric entry; arrow keys adjust the focused slider. Changes update the model immediately and are persisted with **Save scenario**.
- Add travel plans with trips per year, cost per trip, an age range, and an annual budget month. Remove any duplicated travel cost from living spending.
- Enter after-tax income and spending before/after retirement, starting funds, access age, and a desired ending balance.
- Save a scenario to freeze its inputs and starting date. **Save a copy** creates a comparison. Comparisons require the same starting date and current age.
- Switch between today's dollars and future dollars. Inspect a planning year or export its complete ledger to CSV.

The primary result identifies the first month when available money cannot cover spending, even if restricted retirement funds remain. The savings solver finds the smallest monthly reduction in pre-retirement living spending that covers every period and the ending target. Ordinary unspent income is already invested; applying the savings result does not create extra income.

## Calculation contract

The engine runs monthly, anchored to the starting calendar day. January 31 advances to February's last day and then returns to March 31. Income and living spending follow the applicable growth/inflation assumptions. Each annual travel budget is charged in full in the planning period starting in the selected month, while the starting age lies in the travel plan's inclusive-start/exclusive-end range.

Cash earns no return. Accessible and retirement investments compound at the entered nominal annual return. Surplus income goes to accessible investments. Spending uses cash, then accessible investments, then retirement funds after the entered access age. Uncovered spending is recorded separately; no assumed loan fills the gap. The annual ledger sums the monthly flows and shows closing balances. Real-dollar flows are adjusted when they occur; closing balances use inflation at the period end.

This is one deterministic path. It does not calculate tax brackets, withdrawal taxes/penalties, Social Security eligibility, market volatility, or a probability of success. The entered income and spending should already account for taxes and debt payments.

## Near-term cash

The runway begins with the current balances of the selected open USD cash accounts. It projects tomorrow through 30, 90, or 365 days using unpaid recurring income/expenses assigned to those cash accounts. The variable-spending allowance defaults to zero and is shown explicitly. The view reports the lowest balance, first negative day, final balance, and scheduled activity.

Credit-card schedules, investment accounts, non-USD accounts, unassigned schedules, and manual card-statement reminders are excluded from cash movements. A statement reminder does not identify a paying account or prove autopay is enabled. Add an appropriate cash-account schedule if that movement should appear in the runway. Marking a schedule paid does not initiate a bank payment.

## Persistence and verification

Saved scenarios belong to their authenticated user and use revision checks to reject stale overwrites. Loading another scenario offers to keep, discard, or save unsaved changes. Resetting a sample workspace removes its saved scenarios.

The implementation is in [the engine](../convex/lib/forecast.ts), [scenario functions](../convex/forecasting.ts), [long-term UI](../src/features/Forecast.tsx), and [cash-runway helper](../src/features/forecast/cashRunway.ts). [Verification](verification.md) records focused arithmetic tests and actual browser save, comparison, export, and responsive checks. [Research](forecasting-research.md) and the [Origin audit](origin-audit.md) explain the product choices.

## Scenario review — September 12, 2026

Independent annuity formulas agree with monthly accumulation at -20%, 0%, 5%,
and 12% effective annual return, within the rounding difference from monthly
integer cents. Income/spending replay, earlier retirement, inflation, lower
returns, added travel, access restrictions, and the savings solver are covered
by the scenario and engine tests. In the demo, a $10,000 starting balance plus
12 months of $1,000 surplus and 12 months of $1,000 withdrawals finishes at
$10,000. Reducing working spending by $100/month finishes at $11,200; both
scenarios are saved for comparison.

These checks validate arithmetic and deterministic scenarios. They are not a
historical market backtest or evidence of prediction accuracy. The most useful
next additions are dated income/spending phases (such as benefits starting
after retirement and a loan payment ending), and sequence-of-returns stress
cases. A constant return cannot represent the damage from losses early in
withdrawal years; see [Schwab's explanation](https://workplace.schwab.com/story/timing-matters-understanding-sequence-returns-risk).
Those would require explicit new inputs and ledger tests, so they were not
added during this bounded review. Current inputs assume one working phase and
one retirement phase; retirement income rises with modeled inflation.
