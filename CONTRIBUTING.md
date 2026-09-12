# Contributing to Marten

Thanks for helping. Marten is a free personal finance app maintained in spare
time, so small, well-explained changes are the easiest to review and merge.

## Before you start

- **Bugs, ideas, and questions** go through
  [GitHub issues](https://github.com/dlev02/marten/issues/new/choose). Open one
  before a large change so we can agree on the approach.
- Read [AGENTS.md](AGENTS.md) for the quality bar and consistency rules (shared
  controls, one icon per concept, plain copy, restrained motion), and
  [docs/architecture.md](docs/architecture.md) for the source map.

## Running the app

Node.js 22.12 or newer.

```sh
npm ci
npm run backend   # creates or connects a free Convex development deployment
npm run dev       # in a second terminal; open the URL Vite prints
```

`npm run backend` writes `.env.local` with your development deployment. Run
`npx @convex-dev/auth --web-server-url http://127.0.0.1:5173` once to set up
sign-in on that deployment. Full details are in the
[development guide](docs/development.md); `/demo` shows a fictional household
without any setup.

## Checks

Run the focused check for what you touched, then the full set before opening a
pull request:

```sh
npm test
npm run lint
npm run build
```

`npm run lint` and `npm run build` include the TypeScript check. Focused Vitest
commands per area are listed in
[development checks](docs/development.md#checks-and-formatting). Format the
files you changed with `npx prettier --write <files>`; do not sweep generated
code or unrelated files into a formatting edit.

For anything visible, open the screen in a browser after the change settles and
check both themes, desktop and narrow widths, keyboard focus, and loading, empty,
and error states. Use only fictional data in screenshots.

## Bank providers and test data

- Automated bank tests use **Plaid Sandbox** only. Never point tests at
  Production credentials: the free Trial allows 10 institution logins in total
  and removing one does not give the slot back.
- Do not commit credentials, tokens, `.env*` files, real account numbers, or
  real transaction exports. Sample data and fixtures are fictional.
- Real bank consent belongs to the account holder; a passing mocked test does
  not prove a live connection works. Say so in the pull request.

## Where documentation lives

Update the matching guide in the same change:

| Topic                                | File                                             |
| ------------------------------------ | ------------------------------------------------ |
| Setup, environment, checks           | [docs/development.md](docs/development.md)       |
| Running your own copy                | [docs/self-hosting.md](docs/self-hosting.md)     |
| Plaid                                | [docs/plaid.md](docs/plaid.md)                   |
| SimpleFIN                            | [docs/simplefin.md](docs/simplefin.md)           |
| Sign-in and password recovery        | [docs/authentication.md](docs/authentication.md) |
| Imports, forecast, investments, etc. | The rest of [docs/](docs/)                       |
| What was actually verified           | [docs/verification.md](docs/verification.md)     |

New screens and preferences must also be registered in the search catalog
(`src/lib/searchCatalog.ts`) so search can find them.

## Pull requests

Keep each pull request to one user-facing change. Fill in the template: what
changed, why, which checks ran, and what could not be verified. Retire
documentation for removed features instead of leaving it beside the replacement.
