import type { SiteDocument } from "./types";

export const securityOverview: SiteDocument = {
  slug: "security",
  title: "Security Overview",
  summary:
    "How sign-in, bank connections, encryption, and access control work in Marten today, what is not offered yet, and how to report a problem.",
  effective: "September 12, 2026",
  sections: [
    {
      id: "sign-in",
      heading: "Signing in",
      blocks: [
        {
          type: "p",
          text: "Marten uses email and password sign-in through the Convex Auth library. Passwords must be at least 12 characters and are stored only as a hash. Email addresses are trimmed and lowercased so one address maps to one account. Session tokens are kept in your browser's local storage and cleared when you sign out.",
        },
        {
          type: "p",
          text: "**Password reset** sends an eight-digit one-time code to your account's email address (when the operator has configured email delivery). The code is valid for 15 minutes, works only for the account it was issued to, and is consumed on use. A successful reset replaces the password and removes your other session records, so devices that were signed in will need to sign in again. Reset requests are limited to one per minute and five per hour per address.",
        },
      ],
    },
    {
      id: "where-data-lives",
      heading: "Where your data lives and how it is encrypted",
      blocks: [
        {
          type: "p",
          text: "All of your data is stored by [Convex](https://www.convex.dev), which hosts in the United States on AWS and encrypts data in transit and at rest according to Convex's published security documentation. Your browser talks to Convex over HTTPS. The static web app is served by Netlify, also over HTTPS; financial data never passes through it.",
        },
        {
          type: "p",
          text: "Receipts, merchant logos, and profile photos are kept in Convex file storage. The app hands out their unguessable file URLs only to the signed-in owner.",
        },
      ],
    },
    {
      id: "bank-credentials",
      heading: "Your bank credentials never touch Marten",
      blocks: [
        {
          type: "p",
          text: "Marten has no form for a bank username or password, and no code path that accepts one.",
        },
        {
          type: "ul",
          items: [
            "**Plaid.** You sign in to your bank inside Plaid Link, a component Plaid controls. Depending on the institution, that is either your bank's own OAuth page or Plaid's credential form; either way Marten sees only the result. The browser holds a short-lived Link token and a bit of flow context in session storage so an OAuth redirect can resume, and never a Plaid access token or secret.",
            "**SimpleFIN Bridge.** You link banks inside your own SimpleFIN account. Marten receives a one-time setup token, exchanges it once, and keeps only the resulting access URL. The token must be an HTTPS claim URL; Marten refuses embedded credentials, query strings, IP addresses, and local hostnames.",
          ],
        },
      ],
    },
    {
      id: "tokens",
      heading: "How provider tokens are stored",
      blocks: [
        {
          type: "ul",
          items: [
            "Plaid access tokens and sync cursors are stored on the server in a private table. Public API responses build a redacted view and never include them. Disconnecting revokes the token with Plaid and clears it from the database.",
            "The SimpleFIN access URL is sealed with **AES-256-GCM** when the operator has set a `CREDENTIALS_KEY`, so it does not appear in plain form in the database, dashboard, or backups. Status responses report only the host and whether the URL is sealed.",
            "Plaid client credentials, Convex Auth signing keys, the sealing key, and the email provider key live only in Convex deployment configuration, never in the browser build or the repository.",
          ],
        },
      ],
    },
    {
      id: "webhooks",
      heading: "Webhook verification",
      blocks: [
        {
          type: "p",
          text: "Plaid notifies Marten of new data through a webhook. Every webhook request must pass Plaid's ES256 JWT signature check, a key-state check, an issued-at time no more than five minutes old, and a SHA-256 match against the request body before Marten schedules any work. Unsigned requests are rejected with HTTP 401.",
        },
      ],
    },
    {
      id: "ownership",
      heading: "Ownership checks on every request",
      blocks: [
        {
          type: "p",
          text: "Every public backend function derives your user ID from the authenticated session, not from anything the browser sends. Record IDs are validated against that owner before a read or write, and relationship targets (an account on a transaction, a category on a rule) are checked the same way. Knowing an ID grants nothing. Anonymous demo guests are limited to their fictional workspace and cannot connect banks, enable reminders, or convert into a real account.",
        },
      ],
    },
    {
      id: "rate-limits",
      heading: "Rate limits",
      blocks: [
        {
          type: "p",
          text: "Sensitive actions are throttled so a mistake or a script cannot hammer them: password-reset and reminder-verification codes (one per minute, five per hour), SimpleFIN connection attempts (a small per-user hourly budget), and AI-connection OAuth and tool calls. Uploads are bounded by size and type on the server.",
        },
      ],
    },
    {
      id: "ai-access",
      heading: "AI-assistant access",
      blocks: [
        {
          type: "p",
          text: "Assistant connections are off until you turn them on in Settings → AI connections. Reading and editing are separate consents; an assistant with read access gets HTTP 403 if it tries to write. Remote connections use OAuth with PKCE, single-use authorization codes, one-hour access tokens, and rotating refresh tokens inside a 30-day grant; replaying a code or refresh token revokes the grant. Only hashes of codes and tokens are stored. Each assistant has its own grant you can revoke individually. Provider identifiers, credentials, storage IDs, and download URLs are stripped from every tool result, and the tool surface has no bank linking, token retrieval, transfer, trade, or deletion actions.",
        },
      ],
    },
    {
      id: "not-yet",
      heading: "What is not offered yet",
      blocks: [
        {
          type: "ul",
          items: [
            "**Two-factor authentication** is planned but not yet available. Choose a long, unique password and use a password manager.",
            "**Self-service account deletion** is not built yet; deletion is done on request (see the [Privacy Policy]({{SITE_URL}}/privacy)).",
            "The sign-in screen shows the same next step for an unknown email address, but that is a UI choice, not a guarantee against account enumeration.",
            "A password reset removes other session records; it does not instantly invalidate an access token that was already issued before that token expires.",
            "No independent security audit or penetration test has been performed.",
          ],
        },
      ],
    },
    {
      id: "self-hosting",
      heading: "Self-hosting for maximum control",
      blocks: [
        {
          type: "p",
          text: "If you would rather not trust anyone else's deployment, run your own. The [self-hosting guide](https://github.com/dlev02/marten/blob/main/docs/self-hosting.md) walks through creating a Convex project, generating auth keys, setting a sealing key, and publishing the site. You then hold every credential and can inspect every byte the app stores.",
        },
      ],
    },
    {
      id: "reporting",
      heading: "Reporting a security problem",
      blocks: [
        {
          type: "p",
          text: "If you find a vulnerability, please report it privately rather than in a public issue: use [GitHub's private security advisory](https://github.com/dlev02/marten/security/advisories/new) for the repository, or email {{CONTACT_EMAIL}}. Include steps to reproduce. You will get a reply from the operator, a fix as quickly as one person can manage, and credit if you want it. Please do not access other people's data while testing.",
        },
      ],
    },
  ],
};
