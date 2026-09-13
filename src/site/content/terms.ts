import type { SiteDocument } from "./types";

export const termsOfService: SiteDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary:
    "The plain-English agreement for using the hosted Marten site: a free tool provided as-is, by one person, with no financial advice attached.",
  effective: "September 13, 2026",
  sections: [
    {
      id: "the-service",
      heading: "The service",
      blocks: [
        {
          type: "p",
          text: "Marten is a free personal-finance web app hosted at {{SITE_URL}} and operated by Drew, an individual in the United States. It is a non-commercial passion project: there are no fees, no paid tiers, no ads, and no plan to add them. By creating an account or using the site you agree to these terms and to the [Privacy Policy]({{SITE_URL}}/privacy).",
        },
        {
          type: "p",
          text: "These terms cover the hosted site only. If you run your own copy from the [source on GitHub](https://github.com/dlev02/marten), the repository's license governs that copy and you are its operator.",
        },
      ],
    },
    {
      id: "not-financial-advice",
      heading: "Marten is not financial advice",
      blocks: [
        {
          type: "p",
          text: "Marten shows you information: balances your bank reports, transactions you or a provider entered, totals computed from them, and forecasts built from assumptions you typed in. It does not give investment, tax, legal, or financial advice, and the operator is not a fiduciary, adviser, broker, or accountant.",
        },
        {
          type: "ul",
          items: [
            "Forecasts follow your own growth and inflation assumptions. They do not predict markets, compute taxes or penalties, or account for every real-world rule.",
            "Statement balances, due dates, and minimum payments come from your bank when available. Check your bank's statement before paying.",
            "Detected subscriptions and category suggestions are proposals for you to review, not conclusions.",
            "Marten cannot move money, pay bills, or trade. Marking something paid in Marten does not pay it.",
          ],
        },
        {
          type: "p",
          text: "Decisions you make with Marten's help are yours.",
        },
      ],
    },
    {
      id: "your-account",
      heading: "Your account and responsibilities",
      blocks: [
        {
          type: "ul",
          items: [
            "You must be at least 13 years old to create an account, and old enough to hold the financial accounts you connect.",
            "Use a real email address you control. Password resets and reminder verification go there.",
            "Keep your password private. It must be at least 12 characters. You are responsible for activity under your account until you tell the operator it has been compromised.",
            "Connect only accounts you are entitled to access, and only your own SimpleFIN subscription.",
            "Follow the terms of any provider you connect through, including Plaid and SimpleFIN.",
            "Each account is one person's private workspace. There is no household sharing, so do not share credentials to work around that.",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      blocks: [
        {
          type: "p",
          text: "Do not:",
        },
        {
          type: "ul",
          items: [
            "Try to access another person's workspace, records, or bank connections.",
            "Probe, scan, overload, or otherwise attack the service, its backend, or the providers it connects to. If you find a security problem, please report it as described in the [Security overview]({{SITE_URL}}/security).",
            "Upload files that are unlawful, malicious, or not yours to share.",
            "Use Marten for anything unlawful, or to defraud anyone.",
            "Scrape, resell, or commercially redistribute the hosted service.",
          ],
        },
        {
          type: "p",
          text: "The operator may suspend or remove an account that breaks these rules or that puts the service or other users at risk.",
        },
      ],
    },
    {
      id: "bank-providers",
      heading: "Bank providers",
      blocks: [
        {
          type: "p",
          text: "Bank data reaches Marten only through a provider you choose. Each provider has its own agreement with you:",
        },
        {
          type: "ul",
          items: [
            "**Plaid** (Plaid, Inc.) is not offered to the public on the hosted site. It is available only to the operator's own household through an allow list, because Plaid's free Trial covers a limited number of institution logins for the whole deployment. Self-hosted copies of Marten can use their own Plaid credentials. When you use Plaid Link you agree to Plaid's terms and the [Plaid End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy).",
            "**SimpleFIN Bridge** is a subscription you purchase directly from [SimpleFIN](https://beta-bridge.simplefin.org/), under SimpleFIN's own terms and prices. Marten shows SimpleFIN's advertised price only as an approximation; SimpleFIN sets and can change it.",
            "**Lunch Flow** is a separate subscription you purchase directly from [Lunch Flow](https://lunchflow.app), under its own terms, coverage, limits and prices. You choose the accounts shared by your API destination and authorize Marten to read and store that data. Stop imports or remove the key in Marten and revoke the destination or bank consent in Lunch Flow when you no longer want access.",
          ],
        },
        {
          type: "p",
          text: "Providers decide which institutions they support, how often data refreshes, and what fields they return. Marten displays what a provider sends and does not guarantee its accuracy, completeness, or timeliness. A bank's balance is the bank's; Marten's copy may lag.",
        },
      ],
    },
    {
      id: "availability",
      heading: "Availability, changes, and your data",
      blocks: [
        {
          type: "p",
          text: "Marten is run by one person in their spare time. The hosted site may be updated, paused, or shut down. Features may change or be removed. The operator will try to give notice before ending the hosted service, through the app and the GitHub repository, but cannot promise uninterrupted availability or a particular notice period.",
        },
        {
          type: "p",
          text: "Your data is yours. You can export Transactions, Reports, Cash Flow, account balance history, and Forecast results as CSV at any time from inside the app, and you can disconnect any bank whenever you like. If the hosted site ever closes, the source stays available so you can run your own copy.",
        },
      ],
    },
    {
      id: "open-source",
      heading: "Open source and self-hosting",
      blocks: [
        {
          type: "p",
          text: "Marten's source code is published at [github.com/dlev02/marten](https://github.com/dlev02/marten) under the GNU AGPL v3 with an attribution term (see NOTICE.md in the repository). Anyone can read it, report issues, propose changes, or run their own copy with their own Convex backend and provider accounts. A self-hosted copy is entirely under its operator's control; these terms do not apply to it.",
        },
      ],
    },
    {
      id: "donations",
      heading: "Donations",
      blocks: [
        {
          type: "p",
          text: "You can support the project through [Ko-fi](https://ko-fi.com/dlev384895). Donations are voluntary gifts. They are not payments for the service, do not unlock features or priority support, and are non-refundable. Ko-fi's own terms apply to the transaction.",
        },
      ],
    },
    {
      id: "warranties",
      heading: "No warranties",
      blocks: [
        {
          type: "p",
          text: "Marten is provided **as is** and **as available**, without warranties of any kind, express or implied, including any warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement. The operator does not promise that the service will be error-free, secure, or available, or that the figures it shows are correct. Where the law does not allow a warranty to be excluded, it is limited to the shortest period the law permits.",
        },
      ],
    },
    {
      id: "liability",
      heading: "Limitation of liability",
      blocks: [
        {
          type: "p",
          text: "To the fullest extent permitted by law, the operator is not liable for any indirect, incidental, special, consequential, or punitive damages, or for lost money, lost data, missed payments, fees, or losses arising from decisions made using Marten, from provider data, from downtime, or from unauthorized access to your account. Because the service is free, the operator's total liability to you for any claim is limited to **$0**, or the smallest amount the law allows if it requires more. Some jurisdictions do not allow certain limitations, so some of these may not apply to you.",
        },
      ],
    },
    {
      id: "governing-law",
      heading: "Governing law",
      blocks: [
        {
          type: "p",
          text: "These terms are governed by the laws of the State of {{GOVERNING_STATE}}, United States, without regard to conflict-of-law rules. Any dispute that cannot be resolved informally will be handled in the courts located in {{GOVERNING_STATE}}. Before going that route, please just get in touch; almost anything can be sorted out with a message.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      blocks: [
        {
          type: "p",
          text: "When these terms change in a way that matters, the effective date at the top will change and the update will be noted in the GitHub repository. Continuing to use the hosted site after a change means you accept the updated terms.",
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: [
        {
          type: "p",
          text: "Questions about these terms: open a [GitHub issue](https://github.com/dlev02/marten/issues) or contact us through {{CONTACT_EMAIL}}.",
        },
      ],
    },
  ],
};
