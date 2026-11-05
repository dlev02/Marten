# Security hardening — November 5, 2026

The adversarial source audit was followed by an implementation review and a
security release. This is a record of the changes and their limits, not a claim
of an independent penetration test.

| Audit concern                             | Disposition                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared-browser query cache                | Sign-out navigates to a fresh page. A session boundary suppresses workspace rendering and reloads when the authenticated subject changes, including another tab's sign-out; token refresh for the same session does not reload. The original disclosure scenario was a risk hypothesis, not a demonstrated exploit.                      |
| Vulnerable packages                       | Patched MCP server, Zod, Vite, Vitest and transitive packages. Scoped minimatch 11 override removes the remaining ESLint parser advisory without npm's suggested downgrade. Convex updated to 1.49.0 and its installed guidance refreshed.                                                                                               |
| Receipt bearer URLs / storage identifiers | Downloads check session and attachment ownership on every HTTP request, send private/no-store headers, and never return storage URLs/IDs. Existing receipt files are copied and atomically swapped before old files are deleted, revoking their old links. Photos and merchant logos still use bearer display URLs; policy text says so. |
| Arbitrary-blob imports                    | Removed public createUploadUrl/start. An authenticated streaming HTTP action stores the bytes itself and invokes internal start; no public argument accepts a stored blob. 20 MB, 50,000 rows, one active job per user.                                                                                                                  |
| Incomplete deletion / import races        | Job files and merchant aliases are swept. A workspace clearing marker and deletion marker fence every import batch. Missing jobs cannot be recreated by progress/failure callbacks. Jobs expire seven days after their last update.                                                                                                      |
| Outbound SSRF                             | SimpleFIN accepts only exact trusted bridge hosts and no custom ports/redirects. Merchant images use Node HTTPS, reject special-use IPv4 DNS answers, and pin the checked address while retaining hostname TLS verification; checks repeat per request/redirect. IPv6-only sites require catalog/upload fallback.                        |
| Webhook amplification                     | Streaming 100 KB body cap, bounded 60-second verification-key cache/coalescing, key-ID syntax checks, address/global request budgets. No invalid body is parsed or scheduled before signature verification.                                                                                                                              |
| Global OAuth denial of service            | Address/client budgets run before larger shared backstops. The closest forwarded hop is used, hashed. Forwarded headers are an abuse signal, not an authorization identity; platform header overwriting still matters.                                                                                                                   |
| Provider API abuse                        | Owner budgets cover Link creation, token exchange, manual sync and previews. Existing scheduled catch-up remains bounded. Production's Plaid allowlist is retained.                                                                                                                                                                      |
| Plaintext provider credentials            | All new Plaid/SimpleFIN/Lunch Flow credentials require a valid AES-256-GCM key. One-use SimpleFIN claims are rejected before claiming if the key is missing. The bounded migration seals legacy plaintext in place. Existing encrypted values and keys are preserved.                                                                    |
| Consent phishing                          | Unverified clients require explicit acknowledgement that the user initiated the connection; the complete callback URI is visible in the existing disclosure. Password/OTP step-up and mandatory verification at signup are separate future auth work; they were not added to this release.                                               |
| Anonymous resource growth                 | Guest creation has a global budget; an hourly bounded sweep deletes anonymous accounts older than 24 hours through the full account-deletion path. It never selects personal users.                                                                                                                                                      |
| Browser protections                       | Production CSP restricts scripts, frames, workers, connections and objects. A hash authorizes the exact theme bootstrap, without general inline JavaScript. Preview uses the same policy. HSTS applies to the current host only, without preload or subdomain commitments.                                                               |
| Other smaller findings                    | Passwords capped at 1,024 characters before hashing, including sign-in; agent output drops remaining provider IDs/accessUrl/apiKey; same-Plaid-Item exchange preserves the new sealed token instead of revoking the existing Item; security/privacy/provider docs corrected.                                                             |

## Upgrading an existing deployment

Keep the existing `CREDENTIALS_KEY`. Never overwrite a valid key during an
upgrade: existing encrypted credentials require that exact value. New
installations generate and securely retain a random 32-byte base64 key.

After deploying the backend, run these internal maintenance functions with
`npx convex run --prod --codegen disable`, passing the named JSON arguments:

| Function                                    | Initial arguments                                |
| ------------------------------------------- | ------------------------------------------------ |
| `securityMaintenance:sealStoredCredentials` | `{"table":"plaidItems","cursor":null}`           |
| `securityMaintenance:sealStoredCredentials` | `{"table":"simplefinConnections","cursor":null}` |
| `securityMaintenance:rotateReceiptUrls`     | `{"cursor":null}`                                |

Each call processes at most 25 rows and returns only a changed count, completion
flag and cursor. If `done` is false, repeat with the returned cursor; retain the
same table argument for credential pages. Operations are idempotent. Receipt
replacement checks the current pointer so a concurrent owner deletion or
replacement cannot resurrect a file. The previous file is deleted only after
its replacement is stored. Deleted or already-migrated rows are skipped.

Run `imports:cleanup` and `accountDeletion:expireGuests` once to bring retention
current, or allow their hourly schedules to do so. These act on expired records,
not active personal accounts. Historical backups age out under Convex retention;
a migration cannot erase old backups or a file somebody already downloaded.

SimpleFIN hosts beyond `bridge.simplefin.org` and `beta-bridge.simplefin.org`
require explicit `SIMPLEFIN_ALLOWED_HOSTS` configuration. Trusting an additional
host grants it outbound requests and potentially financial credentials.

CSP's theme hash is coupled to the `ThemeProvider` options and installed
`next-themes` output. Recompute it if either changes and check the built app in
preview. Custom Convex hosting also needs its exact HTTP/WebSocket origins in
CSP and `VITE_CONVEX_SITE_URL` for authenticated HTTP actions.

No paid API was introduced. Routine page views add no receipt file traffic;
100 downloads of 1 MB receipts transfer about 0.1 GB. Imports retain one active
file up to 20 MB per user; rotation temporarily duplicates at most one receipt
per sequential request. Keep originals out of public logs and screenshots.

## Verification and remaining boundaries

See [verification.md](verification.md) for observed checks and release evidence.
The focused file-security regression covers foreign-owner access, size/origin
checks, receipt rotation, session revocation and clearing with an active import.
The existing date-sensitive assistant fixture now freezes `Date` as well as
`Date.now`, so its future-date assertions do not expire with the calendar.

No real bank consent is created during QA. Provider parsing and signed webhook
checks use fictional fixtures. A controlled real-institution Link/reconnect is
still an account-holder check; automated checks do not establish live bank
coverage. OAuth consent remains vulnerable to a user knowingly approving a
malicious app; explicit acknowledgement is friction, not proof of intent.

Process: keep storage-capability, ownership and deletion-race regressions with
future file features; a safe-looking UUID or upload token is not ownership.
