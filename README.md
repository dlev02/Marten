# Marten

Marten is a personal finance web app for a family's own use. It combines a React interface, authenticated Convex data, Plaid bank connections, and an optional Sophtron personal-import pilot. Each signed-in user owns a separate workspace; a shared family-access model is not implemented.

Chase, American Express, and Charles Schwab are the intended institutions. Brokerage and IRA balances belong in net worth; Investments adds available holdings, allocation, cost basis, and activity. Forecast compares retirement ages, annual travel, required savings, and near-term cash balances. Trading and automated financial advice are outside the app’s scope.

## Start here

| Document                                                 | Purpose                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Development guide](docs/development.md)                 | Install, configure authentication, run locally, and choose the right checks |
| [Architecture](docs/architecture.md)                     | Source map, data flow, finance conventions, and change boundaries           |
| [Requirements](docs/requirements.md)                     | Product scope and acceptance criteria                                       |
| [Plaid integration](docs/plaid.md)                       | Credentials, OAuth, sync invariants, and bank-data limitations              |
| [Authentication](docs/authentication.md)                 | Email sign-in, password recovery, delivery setup, and request limits        |
| [Importing spreadsheets](docs/importing.md)              | Excel/CSV columns, previews, duplicate handling, and account mapping        |
| [Forecast guide](docs/forecasting.md)                    | Saved scenarios, travel, savings, cash runway, and model limitations        |
| [Investments](docs/investments.md)                       | Holdings, valuation, cost-basis coverage, and investment sync               |
| [Agent access](docs/agent-access.md)                     | Browser WebMCP, remote MCP, consent and assistant setup                     |
| [Reminders](docs/reminders.md)                           | Opt-in browser and email notifications                                      |
| [Bank-provider options](docs/bank-provider-options.md)   | Plaid connection limits and personal hosting alternatives                   |
| [Sophtron pilot](docs/sophtron.md)                       | Personal deployment setup, reviewed import and data limits                  |
| [Brand and category artwork](docs/assets.md)             | Offline logo catalog and illustrated category icons                         |
| [Recurring schedules](docs/recurring-schedules.md)       | Precise subscription matching and manual statement reminders                |
| [Forecasting research](docs/forecasting-research.md)     | Competitor evidence, user needs, and model requirements                     |
| [Credit-score history & research](docs/credit-scores.md) | Provider access, free consumer sources, and practical import options        |
| [Verification record](docs/verification.md)              | Observed checks and remaining release work                                  |
| [Design system](docs/design/system.md)                   | Layout, typography, color, responsive behavior, and visual references       |

## Run locally

Use Node.js **22.12 or newer**, as required by `package.json`, and the committed npm lockfile:

```sh
npm ci
npm run backend
```

In a second terminal:

```sh
npm run dev
```

The backend command starts the Convex development watcher and pushes backend changes to the selected development deployment. The frontend command starts Vite at `http://127.0.0.1:5173` when that port is available; use the URL printed by Vite.

The Convex CLI configures the ignored `.env.local`. The browser needs `VITE_CONVEX_URL`. The intended development deployment is `stoic-narwhal-224.convex.cloud`; confirm the CLI's selected deployment before changing remote settings. Authentication and Plaid setup are explained in the [development guide](docs/development.md).

Open `/demo` to explore a fictional household in an isolated browser tab. **Profile → Open demo** keeps an existing account signed in; **Exit demo** returns to the normal account or sign-in screen. Guest accounts cannot connect banks.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests use Vitest, the edge runtime, and `convex-test`. They exercise isolated backend functions and shared finance/UI state logic. The Plaid tests mock provider responses; they do not contact banks or spend live Trial connections. Typecheck and build do not prove that sign-in, a browser interaction, or a bank connection works.

Formatting uses the installed Prettier configuration. Format files you change; generated code, dependencies, builds, and other workstreams should not be swept into a formatting edit. See [development checks](docs/development.md#checks-and-formatting).

## Deployment boundary

The React build goes to `dist`; Convex hosts the backend separately. Netlify publication is a separate release step that requires the chosen backend, final HTTPS origin, SPA fallback routing, authentication configuration, and Plaid OAuth settings to agree.

Keep signing keys and Plaid secrets in Convex deployment configuration. Never place them in browser `VITE_*` variables or tracked files. A working development deployment does not establish a public release or live bank consent. Track those outcomes separately in [verification.md](docs/verification.md).
