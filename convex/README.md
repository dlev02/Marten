# Marten backend

This directory contains Marten's Convex functions, schema, scheduled work, and regression tests. Start with [the project development guide](../docs/development.md) and [architecture map](../docs/architecture.md).

Before changing Convex code, read [`_generated/ai/guidelines.md`](_generated/ai/guidelines.md). The project uses the installed Convex API and its generated bindings; do not copy unbounded or unauthenticated starter examples into a financial-data path.

## Where changes belong

| Module                                            | Responsibility                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `schema.ts`, `validators.ts`                      | Tables/indexes and reusable runtime validators                           |
| `lib/access.ts`                                   | Authenticated wrappers and ownership checks                              |
| `lib/finance.ts`, `lib/transactions.ts`           | Shared finance invariants, validation, rules, counts, and search text    |
| `workspace.ts`                                    | Profile/metadata, accounts, balance history, saved reports, sample reset |
| `transactions.ts`                                 | Transaction reads/edits/imports, receipts, activity cleanup              |
| `settings.ts`                                     | Categories/groups, merchants, tags, rules, ordering                      |
| `recurring.ts`                                    | Schedules, occurrence checkmarks, detection, payment cleanup             |
| `plaid.ts`, `plaidInternal.ts`, `lib/plaidApi.ts` | Server-only Plaid requests, normalization, sync, token handling          |
| `auth.ts`, `auth.config.ts`, `http.ts`            | Authentication and verified webhook routes                               |
| `crons.ts`                                        | Periodic catch-up scheduling                                             |
| `sample.ts`                                       | Fictional seed data and default categories                               |

Public business functions use `userQuery`, `userMutation`, or `userAction` from `lib/access.ts`. Validate owned relationship IDs as well as the primary record. Keep private operations internal, include argument/return validators, and use indexes and bounded reads. An action performs external work; mutations commit its database effects.

A schema change may need coordinated updates to validators, safe public views, imports, cleanup paths, and tests. New fields on populated tables should be optional until existing rows are migrated. Never expose a whole private `plaidItems` document through a public query.

## Validate

```sh
npx tsc -p convex/tsconfig.json --noEmit
npm test
```

`npm run backend` starts the watcher. `npx convex dev --once` validates and pushes once to the selected deployment; verify that target before running it. Neither a push nor mocked tests prove a real provider connection worked.

Non-obvious finance and sync behavior is documented in [architecture.md](../docs/architecture.md), [requirements.md](../docs/requirements.md), and [plaid.md](../docs/plaid.md). Record actual test, browser, and external validation separately in [verification.md](../docs/verification.md).
