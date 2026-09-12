# Development guide

## Before changing code

Read [AGENTS.md](../AGENTS.md), then the relevant source and the [architecture map](architecture.md). For Convex changes, read [the generated Convex guidelines](../convex/_generated/ai/guidelines.md) before editing functions or schema.

Use the existing feature modules and shared helpers. Preserve unrelated work in a shared checkout. Do not edit `convex/_generated`, `dist`, or `node_modules` to fix application behavior.

For UI work, start with [DESIGN.md](../DESIGN.md): it maps the current tokens,
shared components, typography, layout, icons, charts, and interaction rules.
Update the design reference alongside approved shared-style changes. For
prototyping outside the repo, use the [Claude Design handoff](design/claude-design.md).

## First local run

1. Install Node.js 22.12 or newer and run `npm ci` from the project root.
2. Run `npm run backend`. Authenticate with Convex if needed and select the intended **development** deployment. The watcher generates API bindings and pushes backend changes.
3. Confirm the ignored `.env.local` contains `VITE_CONVEX_URL` for that deployment. This is a public endpoint, not an API secret.
4. In another terminal, run `npm run dev`. Open the exact origin Vite prints. The usual origin is `http://127.0.0.1:5173`; if the port is occupied Vite may select another one.
5. Configure authentication for that deployment if it has not already been initialized, then create a local test login. Start with **Sample data** to inspect fictional finances, or a personal workspace for manual/Sandbox accounts.

The current intended development backend is `stoic-narwhal-224.convex.cloud`. Treat that as project context, not a reason to overwrite another selected deployment. Development and production have separate environment variables and data.

## Environment and authentication

| Variable                              | Where it belongs                                        | Meaning                                                                     |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `VITE_CONVEX_URL`                     | Ignored local frontend env / frontend hosting build env | Public Convex client endpoint                                               |
| `CONVEX_DEPLOYMENT`                   | CLI-managed local configuration                         | Identifies the deployment used by the Convex CLI                            |
| `SITE_URL`                            | Convex deployment environment                           | Exact frontend origin used by authentication                                |
| `AGENT_APP_ORIGIN`                    | Convex deployment environment                           | Optional exact frontend origin for MCP consent; falls back to `SITE_URL`    |
| `JWT_PRIVATE_KEY`, `JWKS`             | Convex deployment environment                           | Convex Auth signing configuration                                           |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`     | Convex deployment environment                           | Matching Plaid credentials; never client build variables                    |
| `PLAID_ENV`                           | Convex deployment environment                           | Explicit `sandbox` or `production`; unset disables links                    |
| `PLAID_REDIRECT_URI`                  | Convex deployment environment                           | Optional registered OAuth callback; required for redirect-based flows       |
| `PLAID_ALLOWED_EMAILS`                | Convex deployment environment                           | Optional comma-separated verified emails allowed to link Plaid; others use SimpleFIN |
| `CREDENTIALS_KEY`                     | Convex deployment environment                           | Optional 32-byte base64 key that seals user-entered provider tokens         |
| `CONVEX_SITE_URL`, `CONVEX_CLOUD_URL` | Supplied by Convex                                      | HTTP-action and client origins; do not redefine them in app config          |

The installed Convex Auth initializer can configure a new development deployment:

```sh
npx @convex-dev/auth --web-server-url http://127.0.0.1:5173
```

Use the actual frontend origin. For this freshly created workspace, the CLI also supports `--skip-git-check` if it has not yet been initialized as a Git repository. The initializer may update local configuration and deployment signing keys. Do not overwrite existing keys merely to repair a frontend issue; first inspect [auth.ts](../convex/auth.ts), [auth.config.ts](../convex/auth.config.ts), and the masked settings for the selected deployment.

Email/password authentication normalizes email addresses and requires passwords of at least 12 characters. Password recovery uses an eight-digit email code valid for 15 minutes. Configure `AUTH_BREVO_KEY` and `AUTH_EMAIL_FROM` on the selected Convex deployment; see [authentication and recovery](authentication.md) for limits, sender setup, session behavior, and the recorded live delivery check.

Private values should be entered through the selected deployment's environment settings or another authorized credential mechanism. Do not paste them into issues, documentation, screenshots, browser bundles, or command output shared for debugging.

[AI connections](agent-access.md) require no model API key. The remote MCP URL uses the selected deployment's HTTP origin (`CONVEX_SITE_URL`), and its consent flow needs the matching frontend origin and `/agent-authorize` SPA route. Browser tools and OAuth grants start disabled until a real personal-workspace owner explicitly enables them.

## Sample data and bank testing

- Sample data is deterministic fictional application data. It is suitable for UI checks and does not use Plaid.
- Plaid Sandbox also uses fictional data, but exercises the actual Link and provider API path. It requires Sandbox credentials and `PLAID_ENV=sandbox` on the development backend.
- A sample workspace cannot create Link tokens or exchange bank tokens. Use the explicit Preferences reset to remove sample data before connecting accounts in a personal workspace.
- Automated bank tests must use Sandbox rather than the limited live Trial connections. Real institution consent belongs to the authorized account holder.

Follow [plaid.md](plaid.md) for OAuth registration, reconnect behavior, supported fields, and the sync protocol. The frontend displays when it is connected to Sandbox; that does not establish that a real institution supports the required account/product combination.

## Checks and formatting

| Change                                                  | Focused check                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Money, categories, splits, recurrence                   | `npx vitest run convex/finance.test.ts convex/reporting.test.ts`    |
| Ownership, mutations, account flags, attachments        | `npx vitest run convex/backend.test.ts convex/accounts.test.ts`     |
| Plaid ingestion, retries, webhooks, OAuth session state | `npx vitest run convex/plaid.test.ts convex/plaidLinkState.test.ts` |
| Transaction notes draft behavior                        | `npx vitest run convex/notesDraft.test.ts`                          |
| Any TypeScript change                                   | `npm run typecheck`                                                 |
| Assembled application                                   | `npm test`, `npm run lint`, and `npm run build`                     |

`npm run lint` and `npm run build` already run the app typecheck. Backend-only validation is also available with `npx tsc -p convex/tsconfig.json --noEmit`. A one-time backend validation/push is `npx convex dev --once`; this changes the selected deployment and is not a read-only check.

The test runner includes `convex/**/*.test.ts` and `src/**/*.test.ts`. Backend tests use isolated Convex functions; shared frontend logic tests do not substitute for a browser interaction check.

Prettier is installed, with settings in [.prettierrc](../.prettierrc) and generated-file exclusions in [.prettierignore](../.prettierignore). For example:

```sh
npx prettier --write convex/plaid.ts docs/plaid.md
npx prettier --check convex/plaid.ts docs/plaid.md
```

Prefer small functions with named inputs and explicit domain types. Comments should explain an invariant, a race, or a provider constraint rather than narrating obvious assignments. A new abstraction should serve a concrete shared path; do not move working feature code merely to make files symmetrical.

For UI changes, inspect the actual page and perform the affected interaction after it settles. Check desktop and narrow layouts, light/dark appearance where relevant, keyboard focus, errors, and loading/empty states. Save only fictional-data screenshots. Report build evidence separately from browser evidence.

## Common setup failures

| Symptom                                                   | Check                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Missing `VITE_CONVEX_URL` error                           | The selected deployment's public URL is present in `.env.local`; restart Vite after changing it                              |
| Sign-in fails or authenticated queries reject the session | Auth signing variables, `auth.config.ts`, HTTP auth routes, and the exact `SITE_URL` belong to the same deployment/origin    |
| New backend API is missing                                | The Convex watcher successfully pushed and regenerated bindings; do not hand-edit the generated API                          |
| Bank connection unavailable                               | All three required Plaid settings exist and the environment is explicit; sample workspaces intentionally cannot link         |
| OAuth returns without completing Link                     | The registered callback, `PLAID_REDIRECT_URI`, authenticated Shell's `PlaidLinkFlow`, and same-session storage are available |
| A report is still calculating                             | Transaction pagination has not reached `Exhausted`; a partial result must not be labeled a complete total                    |
| Historical balance range is incomplete                    | The response's `complete` flag is false; use a shorter range rather than silently charting a partial history                 |

## Preparing a release

1. Finish the relevant checks and record observed results in [verification.md](verification.md).
2. Choose the intended backend explicitly. Set that deployment's auth and Plaid configuration separately from development.
3. Build the frontend with the intended public `VITE_CONVEX_URL`. Configure the final HTTPS origin and a SPA fallback to `index.html` on the static host.
4. Register the final Plaid callback and verify Link/reconnect, actual supported data, and disconnect behavior with an authorized account holder.
5. Obtain authorization for public publication, publish the frontend, and recheck deep links, authentication, and bank callbacks at the final URL.

The repository contains no assertion that those production steps have been completed. A local preview, backend push, successful test, and public website deployment are distinct outcomes.

## Category artwork

Edit `scripts/category-icon-art.mjs` for Marten category shapes, color tokens, labels, keywords, and compatibility aliases. Run `npm run assets:categories`, then `npx vitest run src/lib/categoryIcons.test.ts`. Generated SVGs and `src/lib/categoryIcons.json` are committed, so production builds do not need image generation or network access. Open `/docs/design/category-icons/review.html` on the Vite dev server to review every pictogram at 24px and 64px in both palettes, then exercise the actual category picker in `/demo`. See [the visual contract](design/category-icons/README.md).

## Reorder controls

Settings and dashboard customization use `@dnd-kit/core`, `@dnd-kit/sortable`,
and `@dnd-kit/utilities` through `SortableList`. Keep each ordering scope in its
own context. Category ordering cannot cross groups; rule ordering while filtered
preserves hidden rules in their slots. Check pointer dragging, keyboard pickup,
Escape cancellation, saved order after reload, and reduced-motion CSS.
