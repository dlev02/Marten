import type { SiteDocument } from "./types";

export const securityOverview: SiteDocument = {
  slug: "security",
  title: "Security Overview",
  summary:
    "How sign-in, bank connections, encryption, and access control work in Marten today, what is not offered yet, and how to report a problem.",
  effective: "November 5, 2026",
  sections: [
    {
      id: "sign-in",
      heading: "Signing in",
      blocks: [
        {
          type: "p",
          text: "Marten uses email and password sign-in through the Convex Auth library. Passwords must be between 12 and 1,024 characters and are stored only as a hash. Email addresses are trimmed and lowercased so one address maps to one account. Session tokens are kept in your browser's local storage and cleared when you sign out. Signing out or switching accounts recreates the page and its query caches before another workspace is shown. Every request also checks that its session still exists on the server, so a password reset or an account deletion ends other sessions immediately rather than when their tokens expire.",
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
          text: "Receipts, merchant logos, and profile photos are kept in Convex file storage. Receipt downloads require a live signed-in session and an ownership check on every request; their file IDs and reusable download URLs are not returned to the browser. Profile photos and merchant logos use unguessable bearer URLs: anyone you share one with can view that image until it is deleted or replaced.",
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
            "**SimpleFIN Bridge.** You link banks inside your own SimpleFIN account. Marten receives a one-time setup token, exchanges it once, and keeps only the resulting access URL. The token must be an HTTPS claim URL; Marten refuses embedded credentials, query strings, IP addresses, and local hostnames. Only the standard SimpleFIN Bridge hosts, or additional hosts explicitly trusted by a self-hosted server operator, are accepted.",
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
            "Plaid access tokens are sealed with AES-256-GCM on the server; sync cursors stay in a private table. Public API responses build a redacted view and never include them. Disconnecting revokes the token with Plaid and clears it from the database.",
            "SimpleFIN access URLs and Lunch Flow API keys are sealed with **AES-256-GCM**. New bank connections require a valid server sealing key; a missing or malformed key cannot silently store a new credential in plain text. Status responses report only the host and whether the credential is sealed.",
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
          text: "Sensitive actions are throttled so a mistake or a script cannot hammer them: failed password sign-ins (ten per hour per account, then one more try every six minutes), password-reset and reminder-verification codes (one per minute, five per hour), bank connection attempts, previews and manual syncs (per-user hourly budgets), Plaid webhooks, demo account creation, and AI-connection OAuth and tool calls. Uploads are bounded by size and type on the server.",
        },
      ],
    },
    {
      id: "ai-access",
      heading: "AI-assistant access",
      blocks: [
        {
          type: "p",
          text: "Assistant connections are off until you turn them on in Settings → AI connections. Reading and editing are separate consents; an assistant with read access gets HTTP 403 if it tries to write. Remote connections use OAuth with PKCE, single-use authorization codes, one-hour access tokens, and rotating refresh tokens. You choose whether a connection lasts while it is in use (ending after 90 days without use), for 30 days, or until you disconnect it. Replaying a code, or a refresh token outside a two-minute retry window, revokes the connection. Apps that register themselves are labeled as unverified on the approval screen. Personal access keys for assistants that cannot sign in are shown once and can be revoked. Only hashes of codes, tokens and keys are stored. Each assistant has its own connection you can revoke individually. Provider identifiers, credentials, storage IDs, and download URLs are stripped from every tool result, and the tool surface has no bank linking, token retrieval, transfer, trade, or account-deletion actions. Explicit merchant and category merges can remove the duplicate record while preserving its financial history.",
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
            "The sign-in screen shows the same next step for an unknown email address, but that is a UI choice, not a guarantee against account enumeration.",
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
          text: "If you find a vulnerability, please report it privately rather than in a public issue: use [GitHub's private security advisory](https://github.com/dlev02/marten/security/advisories/new) for the repository, or contact us through {{CONTACT_EMAIL}}. Include steps to reproduce. You will get a reply from the operator, a fix as quickly as one person can manage, and credit if you want it. Please do not access other people's data while testing.",
        },
      ],
    },
  ],
};
