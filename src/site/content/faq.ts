import type { FaqEntry } from "./types";

export const publicFaq: FaqEntry[] = [
  {
    id: "what-is-marten",
    category: "Getting started",
    question: "What is Marten?",
    answer:
      "Marten is a free personal-finance web app. Connect your banks or import a spreadsheet, and it shows your accounts and net worth, transactions with categories and receipts, cash-flow reports, recurring bills, investment holdings, a credit-score history you keep yourself, and a forecast of the years ahead. It is built and hosted by one person for his family and friends, and the [source is open](https://github.com/dlev02/marten).",
  },
  {
    id: "is-it-free",
    category: "Getting started",
    question: "Is it really free?",
    answer:
      "Yes. There are no fees, no paid tier, and no ads, and your data is never sold. The only cost you might choose to pay is a SimpleFIN Bridge subscription if you want automatic bank connections; that goes to SimpleFIN, not to Marten. Manual accounts and spreadsheet imports cost nothing.",
  },
  {
    id: "why-built",
    category: "Getting started",
    question: "Why did you build it?",
    answer:
      "Drew uses Monarch Money and is happy with it, but his parents and friends wanted something simpler and free: better than a spreadsheet, without opening four or five bank apps. In the United States there is no free plug-and-play way to read your own bank data, so he built Marten and shares it. The [About page]({{SITE_URL}}/about) has the longer story.",
  },
  {
    id: "how-different",
    category: "Getting started",
    question: "How is Marten different from Monarch, Mint, or a spreadsheet?",
    answer:
      "Compared with a spreadsheet: balances and transactions arrive on their own, categories and rules do the sorting, and reports, recurring detection, and forecasts are built in. Compared with a paid app such as Monarch Money: Marten is free, open source, has no ads or data sharing, and you can run it yourself. It is also smaller: one private workspace per person, no household sharing, no budgets or goals, and no native mobile app yet. If you already pay for a full-featured app and love it, keep it; Marten is for people who want the basics done well for nothing.",
  },
  {
    id: "which-banks",
    category: "Banks & data",
    question: "Which banks work?",
    answer:
      "Any institution your chosen provider supports. Through SimpleFIN Bridge that is the banks you link in your SimpleFIN account. Through Plaid it is Plaid's US and Canadian catalog, including OAuth institutions such as Chase, American Express, and Charles Schwab. Marten itself is currently USD-only. Accounts no provider covers can be added by hand and updated from a spreadsheet.",
  },
  {
    id: "how-connections-work",
    category: "Banks & data",
    question: "How do bank connections work?",
    answer:
      "Marten never sees your bank password. With SimpleFIN, you link banks inside SimpleFIN Bridge and paste a one-time setup token into Marten; balances and posted transactions import daily and whenever you choose Import latest. With Plaid, you sign in to your bank inside Plaid Link and choose what to share; Marten keeps a server-side token and syncs from Plaid's cached data, usually within hours of the bank updating. Disconnecting stops syncing and keeps the history you already imported.",
  },
  {
    id: "what-is-simplefin",
    category: "Banks & data",
    question: "What is SimpleFIN and what does it cost?",
    answer:
      "[SimpleFIN Bridge](https://beta-bridge.simplefin.org/) is a small subscription service that connects to your banks once and shares balances and posted transactions with apps you approve. At the time of writing it advertises about $1.50 plus tax per month or $15 plus tax per year for up to 25 institutions and 25 apps; SimpleFIN sets the price and can change it. You buy it directly, link your banks there, create an app connection, and paste the setup token into Marten. SimpleFIN does not yet send investment holdings to Marten, so brokerage accounts show balances but not positions.",
  },
  {
    id: "why-not-plaid",
    category: "Banks & data",
    question: "Why can't I use Plaid on the hosted site?",
    answer:
      "Plaid credentials belong to the whole deployment, and Plaid's free Trial allows 10 institution logins in total, ever; removing one does not give the slot back. Sharing that with the public would use it up in an afternoon, and Plaid's developer policy does not allow pooling keys. So on the hosted site Plaid is limited to the operator's own household through an allow list, and everyone else uses SimpleFIN or spreadsheets. If you self-host, you can apply for your own Plaid Trial and use it freely.",
  },
  {
    id: "self-host",
    category: "Hosting & open source",
    question: "Can I run Marten myself?",
    answer:
      "Yes. Marten is a static React site plus a [Convex](https://www.convex.dev) backend. The [self-hosting guide](https://github.com/dlev02/marten/blob/main/docs/self-hosting.md) takes about ten minutes: create a free Convex project, generate auth keys, set a sealing key, optionally add email and Plaid credentials, and publish the built site on any static host. You then control every credential and every byte of data.",
  },
  {
    id: "data-sold",
    category: "Privacy & security",
    question: "Is my data sold or used for ads?",
    answer:
      "No. Never sold, never used for advertising, never used to train a model, never shared except with the services that run the app (Convex for storage, your chosen bank provider, Brevo for email) and an AI assistant you explicitly connect. There are no analytics or trackers on the site. The [Privacy Policy]({{SITE_URL}}/privacy) lists everything Marten stores.",
  },
  {
    id: "where-stored",
    category: "Privacy & security",
    question: "Where is my data stored?",
    answer:
      "In a Convex database and file store hosted in the United States on AWS, encrypted in transit and at rest according to Convex's published security documentation. Bank tokens stay on the server and are never sent to your browser; the SimpleFIN access URL is additionally sealed with AES-256-GCM. Your browser keeps only your sign-in session and appearance preferences. See the [Security overview]({{SITE_URL}}/security).",
  },
  {
    id: "delete-everything",
    category: "Privacy & security",
    question: "Can I delete everything?",
    answer:
      "You can delete any account, transaction, receipt, rule, report, or scenario inside the app, and disconnect any bank at any time. A sample workspace has a Clear sample workspace button that wipes it. There is not yet a self-service button that deletes your whole account, so for that open a [GitHub issue](https://github.com/dlev02/marten/issues) or email {{CONTACT_EMAIL}} from your sign-in address and the operator will remove the account and all its data.",
  },
  {
    id: "import-spreadsheet",
    category: "Banks & data",
    question: "Can I import from Monarch Money or Excel?",
    answer:
      "Yes. Open Transactions and choose Import. Select an Excel workbook (.xlsx) or CSV file, choose a worksheet, and match its date, description, and amount columns. A Monarch Money transaction export is recognized automatically: merchants, categories, accounts, notes, tags, review status, and IDs carry over, and rows that match a transaction your bank already synced update that transaction instead of duplicating it. A Monarch balance export rebuilds your net-worth history.",
  },
  {
    id: "phone-tablet",
    category: "Getting started",
    question: "Does it work on my phone or tablet?",
    answer:
      "Marten is a responsive web app, checked at phone, tablet, and desktop widths, so it works in a mobile browser. There is no native iOS or Android app yet, and browser reminders only appear while a Marten tab is open; email reminders cover the rest.",
  },
  {
    id: "ai-assistants",
    category: "Privacy & security",
    question: "Can I use ChatGPT, Claude, or a browser assistant with Marten?",
    answer:
      "Yes, if you want to. Settings → AI connections lets a browser with WebMCP support use Marten's tools while the page is open, or lets a supported AI app connect through a remote MCP connection with OAuth sign-in. Both are off by default, start as read-only, need a separate choice for edits, and can be disconnected at any time. Marten runs no model and needs no model API key; availability depends on your assistant's plan and client support.",
  },
  {
    id: "reminders",
    category: "Getting started",
    question: "Can Marten remind me before a payment is due?",
    answer:
      "Yes. Preferences → Reminders offers browser notifications while a Marten tab is open and email reminders when it is closed. Browser delivery needs your permission; email needs a one-time verification of your sign-in address. Choose the lead time and delivery time. Reminders contain a count and the earliest due date, never merchant names or amounts. Paid items, paused schedules, and past due dates do not create reminders, and nothing is ever paid on your behalf.",
  },
  {
    id: "payments",
    category: "Banks & data",
    question: "Does Marten make payments or trades?",
    answer:
      "No. Marten is read-only toward your banks. It cannot move money, pay a bill, or place a trade, and the AI-assistant tools have no such actions either. Marking a recurring item paid only records that fact in Marten.",
  },
  {
    id: "demo",
    category: "Getting started",
    question: "Can I try it without connecting anything?",
    answer:
      "Yes. Open [the demo]({{SITE_URL}}/demo) to explore a fictional household in a separate tab. You can use the working screens and save changes there. Nothing about the demo touches a real account, bank connections are disabled, and Exit demo returns you to sign-in or to your own account.",
  },
  {
    id: "bugs-features",
    category: "Support the project",
    question: "How do I report a bug or request a feature?",
    answer:
      "Open an issue at [github.com/dlev02/marten/issues](https://github.com/dlev02/marten/issues) and pick the bug, feature request, or question template. Include what you expected and what happened; screenshots help. Please do not include account numbers or real financial details. For security problems, use the private reporting path in the [Security overview]({{SITE_URL}}/security).",
  },
  {
    id: "support",
    category: "Support the project",
    question: "How can I support Marten?",
    answer:
      "Use it, tell someone who would rather not pay for a finance app, and star or contribute on [GitHub](https://github.com/dlev02/marten). If it saves you a subscription and you want to say thanks, there is a [Ko-fi page](https://ko-fi.com/dlev384895). Donations are optional gifts that cover the domain; they never unlock features.",
  },
];
