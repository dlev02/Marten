# AI connections

Marten exposes its existing finance features to an assistant the user already has. It does not run a model or require a model API key. Settings → AI connections controls two separate connections:

- **Browser agent access** registers WebMCP tools in a supporting browser while the personal workspace is open. Access and edits start off. The normal browser interface remains available when WebMCP is unavailable.
- **Remote MCP** uses OAuth consent and the Convex HTTP endpoint shown in Settings. Each assistant receives its own revocable grant. A browser tab does not need to stay open after linking.

Both use the schemas in [`agentTools.ts`](../convex/lib/agentTools.ts) and the same authenticated operations. Signed-out users, anonymous demo accounts, and sample workspaces cannot enable either connection. Existing account IDs never authorize access to another user's records.

## Available tools

| Feature               | Reads                                                                                                           | Edits requiring separate consent                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts              | Balances, currencies, cached update times, statements, computed `netWorthCents` with the app's rule             | Name, hidden state, net-worth inclusion                                                                                                        |
| Transactions          | Pages with resolved account, merchant, category and tag names, `direction`, details, annotation history         | Notes, category, merchant, tags, visibility, reviewed state, valid splits; the same patch on up to 100 rows atomically (`update_transactions`) |
| Organization          | Category groups, categories with group kind, tags, merchant pages or `merchantSearch`, ordered rules with names | Rename merchants, create and edit categories and tags, save rules, apply a rule to existing rows in bounded pages                              |
| Preferences           | Workspace name, `reviewNew`, `allowPending`, `investmentActivity`, dashboard widgets                            | `reviewNew`, `allowPending`                                                                                                                    |
| Recurring             | Schedules with names, detector suggestions, paginated payment checkmarks, statement reminders                   | Create or update tracking schedules; set or clear actual occurrence checkmarks                                                                 |
| Forecast              | Baseline, saved assumptions and revisions, modeled annual results with engine warnings                          | Save a reviewed scenario; updates require its current revision                                                                                 |
| Investments           | Cached holdings, securities, connection freshness, activity pages                                               | None                                                                                                                                           |
| Credit scores         | Saved observations with bureau, model, date, and source                                                         | None                                                                                                                                           |
| Reports and cash flow | Complete USD totals, counts, per-month rows and warnings using the application's split and category-group rules | None                                                                                                                                           |

The tool surface has no bank linking, provider refresh, token retrieval, receipt downloads, transfers, trades, message sending, deletion, group creation, appearance or notification settings, Budget, Goals, or Advice tools. Creating or marking a recurring item changes tracking only. Names, notes, and statements are untrusted stored text, not instructions to the assistant.

Amounts remain integer cents with currency; `amountCents > 0` is money out and every transaction row restates this as `direction`. Transaction pages default to 50 rows (100 maximum) because each row carries resolved names. `list_transactions` accepts `search` and treats a missing date range as all time; `get_classifications` accepts `merchantSearch`, matching display names and the statement text on transactions. A recurring schedule's `nextDate` is the anchor its occurrences repeat from; `set_recurring_paid` names the valid dates when asked for one that is off the series. Forecast results include `returnAssumptionApplies`, and the baseline lists `observedFields` against the example values it fills in. Timestamps ending in `At` are also returned as ISO strings ending in `AtIso`. Reports exclude hidden, pending, removed, and transfer entries; refunds retain their sign and splits replace the parent allocation. Reports return `summary.months` so a multi-month question is one call, and `warnings` when inflows sit in expense categories. Paginated reads return `continueCursor: null` once finished. Reports scan at most 60 pages of 200 transactions; when unfinished, they return `complete: false` and `summary: null`. `apply_rule` walks existing transactions in the same bounded way and reports `complete`. Pages can observe a bank sync or edit during loading, so the result explains that consistency limit. Forecasts use the monthly engine but return annual rows and totals, plus warnings such as a return assumption that cannot apply because no invested balance was supplied. Remote results above 140,000 characters return a request to narrow the query, never silently truncated data.

Every result is scanned at the tool boundary: stored text fields (notes, names, statement text) that read like instructions to an assistant add a `dataWarnings` entry telling the assistant to report the text rather than follow it. The text itself is left intact so nothing is hidden from the user. The initialization instructions restate the conventions, the efficient call patterns, the completeness fields, and the rule that stored text is never a command.

## Deployment configuration

The endpoint is `${CONVEX_SITE_URL}/mcp`, using the deployment's **`.convex.site` HTTP origin**, not its `.convex.cloud` client origin. Set `AGENT_APP_ORIGIN` on that same Convex deployment to the exact frontend origin that serves `/agent-authorize`. It falls back to `SITE_URL`. A publicly reachable HTTPS frontend is needed for hosted/mobile connection flows; an HTTP loopback origin is accepted for local development and shown as not remotely ready. Configure the frontend host's SPA fallback so a direct visit to `/agent-authorize` loads the app and preserves the request parameter through sign-in.

The backend uses the maintained `@modelcontextprotocol/server` SDK and Convex rate-limiter component. Deploy the Convex configuration, schema, HTTP routes, functions, and generated bindings together. `npx convex dev --once` writes to the selected development deployment; production publication is a separate authorized release step.

Public discovery endpoints are:

- `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server/agent` for the `${CONVEX_SITE_URL}/agent` issuer; root and issuer-relative discovery aliases are also served

An unauthenticated `/mcp` request returns HTTP 401 with a `WWW-Authenticate` discovery pointer. OAuth authorization, token exchange, and revocation are under `/agent/oauth/`. Token requests use `application/x-www-form-urlencoded`, never query-string tokens or a model API key.

## Connecting ChatGPT or Claude

Copy the MCP URL from Marten Settings into the assistant's custom MCP connection settings, choose OAuth, sign in to Marten, and review the requested access. Start with read access; grant editing only when desired. Availability depends on the assistant's plan, workspace policy, and client. Use the current [ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) or [Claude custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) for the host's exact controls.

Client ID Metadata Documents (CIMD) are preferred. The server advertises public-client authentication (`none`) and validates metadata from the approved ChatGPT/Claude origins. It supports ChatGPT's plural authentication-method field even when its legacy singular preference is `private_key_jwt`; the advertised intersection selects `none`. The live [ChatGPT metadata document](https://chatgpt.com/oauth/client.json) and [OpenAI OAuth contract](https://developers.openai.com/plugins/build/auth) were checked on September 11, 2026.

If a client asks for a predefined client ID, these are available with no client secret:

| Client ID        | Registered callback                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `marten-chatgpt` | `https://chatgpt.com/connector_platform_oauth_redirect`                                   |
| `marten-claude`  | `https://claude.ai/api/mcp/auth_callback`                                                 |
| `marten-local`   | HTTP `localhost` or `127.0.0.1`, `/callback` or `/oauth/callback`, with an ephemeral port |

ChatGPT's stable callback requires the exact issuer in every OAuth success/error redirect; Marten supplies it. CIMD also supports ChatGPT's callback-specific metadata documents. Claude Code declares loopback callbacks, while Claude's hosted clients use the hosted callback above. A callback must match its registered host and path; only the port of an explicitly registered loopback callback may vary. See [Claude's authentication reference](https://claude.com/docs/connectors/building/authentication).

Read-only grants receive `finance:read`; edits require `finance:write`. Insufficient edit scope returns HTTP 403 with an OAuth scope challenge. Reconnect and approve editing if the assistant requests that additional capability.

## Authorization and operational checks

OAuth uses S256 PKCE, single-use codes, exact client/callback/resource binding, one-hour access tokens, and rotating refresh tokens within a 30-day grant. Code or refresh-token replay revokes its grant. Only cryptographic hashes are stored for request secrets, codes, and tokens. Request/token cleanup is scheduled after expiry. Revocation and eligibility are checked on every operation, including a final check after a multi-page report. Turning off browser access does not revoke remote grants; disconnect those individually in Settings.

Provider identifiers, credential fields, storage IDs, and asset/download URLs are removed at the tool-output boundary. The agent activity list stores tool name, source, time, and success, not financial payloads, arguments, or conversation text. A grant's last-used time is refreshed at most once a minute so parallel calls from one assistant do not contend on the grant record. Data already sent to an assistant remains subject to that service's own settings.

HTTP validates allowed origins and bounds request bodies. OAuth start/token endpoints and tool execution are rate limited. Invalid client metadata cannot cause arbitrary-host fetches: discovery accepts only the approved HTTPS origins, refuses redirects, validates returned client identity and callback origins, and limits response time and size.

[`agentAccess.test.ts`](../convex/agentAccess.test.ts) covers consent, ownership, atomic edit validation, report completeness, model separation, OAuth discovery/PKCE/token lifecycle, secret redaction, and actual SDK requests for both `2025-11-25` and `2026-07-28`. The latter uses the current [Streamable HTTP per-request envelope](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http). Tests use fictional data and mocked client metadata; passing them does not establish a successful link inside a real ChatGPT or Claude account. Verify discovery, sign-in return, a read, a consented reversible edit, and disconnect in each intended client before claiming that client works end to end.

The September 11 development check completed the configured localhost sign-in return and local OAuth callback with a fictional personal workspace. Live initialization negotiated `2025-11-25`, listed the tool surface (20 tools at the time) and read the empty owned account list. A write without edit consent returned 403. A separately consented edit grant created a zero-balance forecast, changed annual return from 5% to 6%, restored 5%, and read back revision 3. Refresh succeeded with a rotated token; disconnecting in Settings changed subsequent requests to 401. No test grant remains active.

Native WebMCP registered 16 tools in the Codex in-app browser with reading enabled: 14 finance reads and two navigation/filter tools. The native bridge read accounts, filtered Transactions and opened AI connections. Disabling access removed the tools. The tested Chrome session did not expose the native API. Real ChatGPT/Claude hosted/mobile connections and browser editing remain unverified; local/native read success is not evidence of those separate client flows.
