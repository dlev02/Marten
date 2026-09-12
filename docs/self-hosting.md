# Self-hosting Marten

Marten is a static React site plus a Convex backend. One person (the operator)
runs the backend and publishes the site; everyone who signs in gets their own
private workspace. For a household, the free tiers of Convex and a static host
such as Netlify are enough, and the only bank-data cost is whichever provider
you choose. Bank data arrives through a provider each user chooses:

| Provider         | Who sets it up                            | Who can use it                                        | Cost                                          |
| ---------------- | ----------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| SimpleFIN Bridge | Each user, in their own SimpleFIN account | Anyone on this deployment, by pasting their own token | About $1.50/month or $15/year to SimpleFIN    |
| Plaid            | The deployment operator, once             | The operator's household (`PLAID_ALLOWED_EMAILS`)     | Free Trial covers 10 institution logins total |
| Manual and CSV   | Nobody                                    | Everyone                                              | Free                                          |

SimpleFIN is the recommended path for anyone other than the operator, because
it needs no deployment secrets and its connection quota belongs to each user.
Plaid credentials are shared across the whole deployment and its Trial quota
cannot be recovered once used, so a deployment that anyone can join should
restrict Plaid to specific accounts with `PLAID_ALLOWED_EMAILS` or leave it
unconfigured. See [bank provider options](bank-provider-options.md) and the
Trial explanation in the [README](../README.md#how-plaids-free-trial-works).

## What you need

- A GitHub account (to fork the repository) and Node.js 22.12 or newer.
- A [Convex](https://convex.dev) account. The free tier is enough for a
  household.
- A static host. This guide uses [Netlify](https://www.netlify.com), whose free
  tier is also enough; any host that serves `dist` with a single-page-app
  fallback to `index.html` works.
- Optional: a domain, a [Brevo](https://www.brevo.com) account for password-reset
  email, and a [Plaid](https://dashboard.plaid.com) developer account.

## 1. Fork and install

1. Fork [dlev02/marten](https://github.com/dlev02/marten) on GitHub and clone
   your fork. Netlify will build from this fork, and you can pull updates from
   the original repository later.
2. From the project root run:

   ```sh
   npm ci
   ```

## 2. Create the Convex backend

1. Run `npm run backend`. Sign in to Convex when prompted and choose **create a
   new project**. The CLI creates a **development** deployment, writes the
   ignored `.env.local` with `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`, and
   starts watching for backend changes. Leave it running while you work locally;
   press `Ctrl+C` when you are done.
2. Initialize authentication on the development deployment against the origin
   Vite prints (usually `http://127.0.0.1:5173`):

   ```sh
   npx @convex-dev/auth --web-server-url http://127.0.0.1:5173
   ```

   This sets `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` on that deployment.

3. Run `npm run dev` in a second terminal, open the printed URL, and create your
   account to confirm sign-in works locally. **Sample data** shows a fictional
   household without any provider.

Every Convex project has separate **development** and **production**
deployments with separate environment variables and data. Everything above
touched development; the next steps set up production.

## 3. Deploy the backend to production

1. Push the backend to the production deployment:

   ```sh
   npx convex deploy
   ```

   The command prints the production deployment name and its URL, which looks
   like `https://<name>.convex.cloud`. You will need that URL for Netlify.

2. Initialize authentication on production. Use the exact HTTPS origin the site
   will be served from. If you do not have a domain yet, use the Netlify
   subdomain for now and change it in step 6:

   ```sh
   npx @convex-dev/auth --prod --web-server-url https://your-site.netlify.app
   ```

3. Set the remaining variables on production with
   `npx convex env set --prod NAME value`, or in the Convex dashboard under
   **Settings → Environment variables**.

### Environment variables

| Variable                              | Required                          | Where it belongs                             | Meaning                                                                                                                                                                               |
| ------------------------------------- | --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_CONVEX_URL`                     | Required                          | Netlify build environment (and `.env.local`) | Public Convex client URL, `https://<name>.convex.cloud`. Not a secret.                                                                                                                |
| `CONVEX_DEPLOYMENT`                   | Local only                        | `.env.local`, written by the Convex CLI      | Which deployment the CLI targets. Never needed on Netlify.                                                                                                                            |
| `JWT_PRIVATE_KEY`, `JWKS`             | Required                          | Convex deployment                            | Convex Auth signing keys, set by the `@convex-dev/auth` initializer. Do not regenerate them on a live deployment: it signs everyone out.                                              |
| `SITE_URL`                            | Required                          | Convex deployment                            | Exact HTTPS origin of the site, with no trailing slash. Sign-in fails when it does not match.                                                                                         |
| `CREDENTIALS_KEY`                     | Recommended                       | Convex deployment                            | 32 random bytes, base64. Seals user-entered SimpleFIN access URLs so they never appear in plain form in the database, dashboard, or backups. Generate with `openssl rand -base64 32`. |
| `AUTH_BREVO_KEY`                      | Optional                          | Convex deployment                            | Brevo API key for transactional email. Enables **Forgot password?** and email reminders.                                                                                              |
| `AUTH_EMAIL_FROM`                     | Optional (with `AUTH_BREVO_KEY`)  | Convex deployment                            | Sender address verified in Brevo. The display name is `Marten`.                                                                                                                       |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`     | Optional                          | Convex deployment                            | Your Plaid credentials. Both are needed; the secret must match `PLAID_ENV`.                                                                                                           |
| `PLAID_ENV`                           | Optional (with Plaid credentials) | Convex deployment                            | `sandbox` or `production`, explicitly. Unset or invalid hides Plaid entirely.                                                                                                         |
| `PLAID_REDIRECT_URI`                  | Optional                          | Convex deployment                            | The redirect URI registered in Plaid's dashboard; required for OAuth banks such as Chase, American Express, and Schwab.                                                               |
| `PLAID_ALLOWED_EMAILS`                | Optional                          | Convex deployment                            | Comma-separated verified account emails allowed to see Plaid. Complete an emailed password reset once to verify an allowed account. When set, everyone else sees only SimpleFIN and manual options. Leave unset on a private household deployment. |
| `AGENT_APP_ORIGIN`                    | Optional                          | Convex deployment                            | Frontend origin for remote MCP consent when it differs from `SITE_URL`.                                                                                                               |
| `CONVEX_SITE_URL`, `CONVEX_CLOUD_URL` | Supplied by Convex                | —                                            | Do not set these yourself.                                                                                                                                                            |

Keep a copy of `CREDENTIALS_KEY` somewhere safe: losing it means users must
paste a new SimpleFIN token, though their imported history stays.

A minimal production setup, in one go:

   ```sh
npx convex env set --prod CREDENTIALS_KEY "$(openssl rand -base64 32)"
npx convex env set --prod AUTH_BREVO_KEY "..."
npx convex env set --prod AUTH_EMAIL_FROM "marten@your-domain.example"
   ```

Plaid variables can wait until you have Trial credentials; the site works with
SimpleFIN, spreadsheets, and manual accounts in the meantime.

## 4. Publish the site on Netlify

1. In Netlify, choose **Add new site → Import an existing project** and connect
   your fork.
2. Set the build command to `npm run build` and the publish directory to
   `dist`. The build runs the app typecheck and generates the brand-logo
   catalog before bundling.
3. Add one build environment variable: `VITE_CONVEX_URL` set to your
   **production** Convex URL from step 3.
4. Deploy. Netlify assigns a `something.netlify.app` address.

The repository's `netlify.toml` already handles the rest: it redirects every
path to `index.html` with a `200` status so deep links such as `/settings/faq`
and `/agent-authorize` load the app, and it sets the response headers the site
expects. You do not need to add redirect rules by hand.

To build somewhere other than Netlify, run the same build with the variable
set and host the `dist` folder with an SPA fallback:

   ```sh
VITE_CONVEX_URL=https://<name>.convex.cloud npm run build
   ```

## 5. Custom domain and HTTPS

1. In Netlify, open **Domain management → Add a domain** and follow its DNS
   instructions for your registrar. Netlify provisions a Let's Encrypt
   certificate automatically once DNS resolves.
2. Wait until the site loads over `https://` at the new domain before moving
   on. Sign-in will not work until step 6.

## 6. Point the backend at the final origin

Authentication and Plaid OAuth both check the exact origin, so finish by
updating them to the domain you will actually use:

1. Set `SITE_URL` on production to the final origin, for example
   `https://marten.your-domain.example`:

   ```sh
   npx convex env set --prod SITE_URL https://marten.your-domain.example
   ```

2. If you use Plaid, register that origin as an allowed redirect URI in the
   Plaid dashboard (**Developers → API → Allowed redirect URIs**) and set
   `PLAID_REDIRECT_URI` to the same value.
3. Open the site, sign in, and confirm a password reset email arrives if you
   configured Brevo.

## 7. Connect banks

- **Plaid** (operator's household): follow
  [How Plaid's free Trial works](../README.md#how-plaids-free-trial-works) and
  the [Plaid guide](plaid.md). Use `PLAID_ENV=sandbox` with Sandbox keys to
  try the flow with fictional banks first; switch to `production` and
  Production keys once approved. Set `PLAID_ALLOWED_EMAILS` if anyone outside
  your household can create an account.
- **SimpleFIN** (everyone): each user subscribes to SimpleFIN Bridge and pastes
  their own setup token under **Add account** or **Settings → Bank
  connections**. Nothing about a user's bank access lives in deployment
  settings. See the [SimpleFIN guide](simplefin.md).

## Costs

| Item                      | Typical cost                                                                   | Notes                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Convex backend            | Free tier                                                                      | A household's data, functions, and daily crons fit comfortably. Check Convex's current limits.  |
| Netlify hosting           | Free tier                                                                      | A static site with a handful of users stays well within the free build minutes and bandwidth.   |
| Domain                    | About $10–15 per year                                                          | Optional; the `netlify.app` subdomain works.                                                    |
| Plaid                     | Free Trial: 10 Production Items, ever                                          | Items are permanent; see the README. Pay-as-you-go pricing after that is on your Plaid account. |
| SimpleFIN Bridge          | About $1.50 + tax per month or $15 + tax per year, per user, paid to SimpleFIN | Each user subscribes for themselves. SimpleFIN sets the price.                                  |
| Brevo transactional email | Free tier                                                                      | Password resets and reminders send a handful of messages a month.                               |

## Keeping it running

- Pull updates from the original repository into your fork; Netlify rebuilds
  on push. Run `npx convex deploy` again whenever the `convex/` folder changes.
- `npm test`, `npm run lint`, and `npm run build` before deploying changes.
- The daily SimpleFIN catch-up and six-hour Plaid sweep run from
  `convex/crons.ts`; the Convex dashboard shows their logs.
- Back up the Convex deployment from the dashboard before schema changes.

## Browser framing protection

Serve every HTML route with `Content-Security-Policy: frame-ancestors 'none'`
and `X-Frame-Options: DENY`. The included Netlify configuration and Vite
local/preview servers set both headers. When using another static host, configure
them there too; a meta tag cannot enforce `frame-ancestors`. This prevents other
sites from disguising clicks on Marten's consent and settings pages and does not
stop Marten from opening Plaid's own frames. Verify the actual response headers
at the final origin after deployment.

## Troubleshooting

| Symptom                                                        | Check                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in or sign-up fails, or the session is rejected           | `SITE_URL` on the **production** deployment must equal the site's origin exactly: same scheme, host, and no trailing slash. After changing the domain, rerun step 6. Confirm `VITE_CONVEX_URL` on Netlify points at the production deployment, not development.                   |
| The site loads but every page is blank or shows a Convex error | `VITE_CONVEX_URL` is missing from Netlify's build environment or was added after the last build. Trigger a new deploy.                                                                                                                                                            |
| Deep links return Netlify's 404 page                           | `netlify.toml` is missing from the fork's root, or the publish directory is not `dist`.                                                                                                                                                                                           |
| The Plaid button is missing                                    | All three of `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` must be set on production, and `PLAID_ENV` must be exactly `sandbox` or `production`. If `PLAID_ALLOWED_EMAILS` is set, the signed-in account's email must be in it and verified through a completed emailed password reset. Requesting a code or verifying reminders alone does not qualify. Demo and sample workspaces never show Plaid. |
| A Chase or Schwab connection returns without finishing         | Register the site origin as a redirect URI in Plaid's dashboard and set `PLAID_REDIRECT_URI` to the same value.                                                                                                                                                                   |
| **Forgot password?** is missing or the email never arrives     | Both `AUTH_BREVO_KEY` and `AUTH_EMAIL_FROM` must be set on production; the sender must be verified in Brevo and the key must still be active. See [authentication](authentication.md).                                                                                            |
| SimpleFIN says the token was already claimed                   | Setup tokens work once. Create a new app connection in SimpleFIN Bridge and use **New token** on the connection card.                                                                                                                                                             |
| Users must re-paste SimpleFIN tokens after a change            | `CREDENTIALS_KEY` was changed or removed. Restore the original value if you have it.                                                                                                                                                                                              |
