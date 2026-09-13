import type { SiteDocument } from "./types";

export const privacyPolicy: SiteDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  summary:
    "What Marten stores, where it lives, who processes it, and what never happens to it. Written in plain English by the person who runs the site.",
  effective: "September 13, 2026",
  sections: [
    {
      id: "what-marten-is",
      heading: "What Marten is",
      blocks: [
        {
          type: "p",
          text: "Marten is a free personal-finance web app. You can add accounts by hand, import spreadsheets, or connect banks through a provider, and Marten shows your balances, transactions, recurring bills, investments, credit-score history, and a forecast in one place. The hosted site at {{SITE_URL}} is run by Drew, an individual in the United States, as a non-commercial passion project. Nobody at Marten sells anything, and there is no company behind it.",
        },
        {
          type: "p",
          text: "This policy describes the hosted site. If you run your own copy of Marten from the [source on GitHub](https://github.com/dlev02/marten), you are the operator and this policy does not apply to your deployment.",
        },
        {
          type: "callout",
          text: "The short version: your data is stored so Marten can show it back to you. It is never sold, never used for advertising, never used to train a model, and never shared with anyone except the services that make the app work.",
        },
      ],
    },
    {
      id: "data-you-provide",
      heading: "Data you give Marten",
      blocks: [
        {
          type: "p",
          text: "When you create an account and use the app, Marten stores:",
        },
        {
          type: "ul",
          items: [
            "**Sign-in details.** Your email address (trimmed and lowercased) and a hashed form of your password. Marten never stores the password itself.",
            "**Profile.** The name you choose (up to 80 characters), and either a built-in avatar choice or a profile photo. A photo is cropped in your browser to a 512-pixel JPEG before it is uploaded; only that cropped image (at most 1 MB) reaches the server, where it is kept in Convex file storage.",
            "**Financial records you enter or import.** Accounts, balances and balance history, transactions, categories, category groups, merchants, tags, notes, splits, ordered rules, recurring schedules and paid checkmarks, saved reports, forecast scenarios, and credit-score observations (score, date, bureau, model, source, and entry method).",
            "**Receipts and merchant logos.** Files you attach to a transaction (up to 20 per transaction, 5 MB each, in supported image and document types) and logos you upload for a merchant. These live in Convex file storage and belong only to your workspace.",
            "**Spreadsheet imports.** Rows from an Excel or CSV file you choose, including a Monarch Money export, become transactions or balance history in your workspace. The original file is read in your browser; only the reviewed rows are saved.",
            "**Preferences.** Settings such as whether new transactions need review, whether pending transactions are shown, which dashboard widgets and default report charts you use, and reminder timing.",
            "**Reminder consent.** If you enable email reminders, Marten stores a hash of the verification code you enter, your chosen timing and time zone, and a record of each reminder it attempted to deliver. Delivery records do not contain message contents.",
            "**AI-connection records.** If you enable an assistant connection, Marten stores your consent choices, hashed OAuth grant secrets, and an activity log with the tool name, source, time, and whether the call succeeded. The log never stores amounts, arguments, or conversation text.",
          ],
        },
        {
          type: "p",
          text: "Credit-score PDFs are read entirely in your browser to suggest fields. The document itself is never uploaded or stored.",
        },
      ],
    },
    {
      id: "data-from-providers",
      heading: "Data from bank providers",
      blocks: [
        {
          type: "p",
          text: "Marten never asks for your bank username or password, and never sees them. Bank data reaches Marten only through a provider you choose and consent to.",
        },
        {
          type: "p",
          text: "**Plaid** (Plaid, Inc.). Plaid is the bank connection for self-hosted copies of Marten, where you run your own backend with your own Plaid credentials, so your bank data stays on infrastructure you control. On the hosted site, Plaid is switched off for everyone except the operator's own family, because Plaid's free Trial covers a fixed number of institution logins for the whole deployment; everyone else can connect through SimpleFIN Bridge or Lunch Flow and never sees a Plaid option. When Plaid is used, you sign in to your bank inside Plaid Link and choose what to share. Marten then receives and stores: institution name and logo, account names, types, and masked identifiers; cached current and available balances; transactions with dates, amounts, statement text, pending status, and Plaid's category suggestions; for cards and loans, statement balances, minimum payments, and due dates when the institution provides them; and for brokerage and retirement accounts, holdings, securities, and investment activity. Marten stores a Plaid access token and sync cursor on the server so it can keep syncing. Plaid's own handling of your data is described in the [Plaid End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy).",
        },
        {
          type: "p",
          text: "**SimpleFIN Bridge.** You buy your own SimpleFIN subscription, link your banks there, and paste a one-time setup token into Marten. Marten exchanges that token once for an access URL and stores only that URL, sealed with AES-256-GCM encryption when the operator has configured a sealing key. From SimpleFIN, Marten receives institution names, account names and balances, posted transactions (dates, amounts, payee, description, and merchant category codes), and validated investment positions when supplied, including quantities and values. Total cost basis, gains, and security price history are not inferred when unavailable. Marten reads from SimpleFIN about once a day and when you choose **Import latest**.",
        },
        {
          type: "p",
          text: "**Lunch Flow.** You link banks in your own Lunch Flow account, create an API destination and choose which accounts it can expose. Marten stores the key on the server, sealed with AES-256-GCM when the operator has configured a sealing key, to read balances, posted transactions and available holdings. Marten also receives institution names and logos, account names, currency and the reported underlying provider. No raw API key is returned in a query or stored in browser preferences. Marten reads daily and when you request an import. Lunch Flow and its banking providers process the connected data under [Lunch Flow’s privacy policy](https://lunchflow.app/privacy).",
        },
        {
          type: "p",
          text: "Disconnecting a bank stops future syncing. For Plaid, Marten revokes the connection with Plaid and clears the stored access token. For SimpleFIN or Lunch Flow, **Stop imports** pauses reads and **Remove** forgets the stored access URL or API key. Revoke the app destination or bank consent with that provider separately. In all cases the transactions and balances already imported stay in your workspace until you delete them, so your history is not lost when a connection ends.",
        },
      ],
    },
    {
      id: "data-in-your-browser",
      heading: "Data stored in your browser",
      blocks: [
        {
          type: "p",
          text: "Marten sets no cookies of its own and uses no analytics or tracking scripts. It does keep a few values in your browser's local storage and session storage so the app works and remembers your choices on that device:",
        },
        {
          type: "table",
          head: ["Key", "Where", "Purpose"],
          rows: [
            [
              "__convexAuthJWT…, __convexAuthRefreshToken… (and related keys)",
              "Local storage",
              "Your sign-in session tokens, managed by the Convex Auth library. Signing out clears them.",
            ],
            [
              "theme",
              "Local storage",
              "Light, dark, or match-system appearance.",
            ],
            [
              "folio-font",
              "Local storage",
              "Whether to use Marten's typeface or your system font.",
            ],
            [
              "marten-category-icons",
              "Local storage",
              "Illustrated or system-emoji category icons.",
            ],
            [
              "folio-sidebar-collapsed",
              "Local storage",
              "Whether the sidebar is collapsed.",
            ],
            [
              "marten-browser-reminders:<your user id>",
              "Local storage",
              "Whether you turned on browser notifications for payment reminders on this device.",
            ],
            [
              "folio-demo-session and folio-demo-… auth keys",
              "Session storage",
              "Marks a tab as the fictional demo and keeps the demo's guest session separate from your real account. Cleared when you exit the demo or close the tab.",
            ],
            [
              "folio.plaid.link.v1",
              "Session storage",
              "A short-lived Plaid Link token and flow context so a bank's OAuth redirect can return to the right place. Cleared when linking finishes, is cancelled, or expires. It never contains a Plaid access token.",
            ],
          ],
        },
        {
          type: "p",
          text: "Third parties you interact with during a bank connection (Plaid Link, your bank's OAuth page, SimpleFIN Bridge) may set their own cookies on their own domains. Marten does not control those.",
        },
      ],
    },
    {
      id: "what-we-do-not-do",
      heading: "What Marten does not do",
      blocks: [
        {
          type: "ul",
          items: [
            "**No selling.** Your data is never sold, rented, or traded, to anyone, ever.",
            "**No advertising.** There are no ads, and your data is never used to target or measure advertising anywhere.",
            "**No tracking.** No analytics, no pixels, no fingerprinting, no third-party trackers.",
            "**No model training.** Your data is not used to train or fine-tune any AI model. Marten runs no model of its own.",
            "**No sharing** except with the processors listed below, which handle data only to run the service, and with a provider you explicitly connect.",
            "**No payments or trades.** Marten reads financial data. It cannot move money, pay a bill, or place a trade.",
          ],
        },
      ],
    },
    {
      id: "processors",
      heading: "Services that process your data",
      blocks: [
        {
          type: "p",
          text: "Marten is built from a small number of services. Each one sees only what it needs for its job.",
        },
        {
          type: "table",
          head: ["Service", "What it does", "What it handles"],
          rows: [
            [
              "[Convex](https://www.convex.dev) (Convex, Inc.)",
              "Hosts the database, file storage, and backend functions.",
              "Everything listed above. Convex hosts in the United States on AWS, and encrypts data in transit and at rest according to Convex's published security documentation.",
            ],
            [
              "[Plaid](https://plaid.com) (Plaid, Inc.)",
              "Bank connections for allow-listed accounts.",
              "Your bank login (inside Plaid Link, never seen by Marten), the accounts and transactions you consent to share, and an identifier derived from your Marten user ID.",
            ],
            [
              "[SimpleFIN Bridge](https://beta-bridge.simplefin.org)",
              "Bank connections you set up with your own subscription.",
              "Your bank links live in your SimpleFIN account. Marten holds only the access URL SimpleFIN issues to it.",
            ],
            [
              "[Lunch Flow](https://lunchflow.app)",
              "Bank connections chosen by you; API access to account, balance, transaction and holdings data",
              "Only if you connect your own Lunch Flow account",
            ],
            [
              "[Brevo](https://www.brevo.com)",
              "Sends transactional email when the operator has configured it.",
              "Your email address and the content of password-reset codes, reminder verification codes, and reminder emails. Reminder emails contain a count and the earliest due date, never merchant names, account numbers, or amounts.",
            ],
            [
              "[Netlify](https://www.netlify.com)",
              "Serves the static web app files.",
              "Ordinary web-server request data such as your IP address, as any host would. Your financial data does not pass through Netlify; the browser talks to Convex directly.",
            ],
          ],
        },
      ],
    },
    {
      id: "ai-connections",
      heading: "AI-assistant connections",
      blocks: [
        {
          type: "p",
          text: "Marten can expose your workspace to an assistant you already use, such as ChatGPT or Claude, either through a browser that supports WebMCP or through a remote MCP connection with OAuth sign-in. Both are **off by default**, start as **read-only**, need a separate consent for edits, and can be revoked in Settings → AI connections at any time. Signed-out users, demo guests, and sample workspaces cannot enable them.",
        },
        {
          type: "p",
          text: "Provider identifiers, credentials, storage IDs, and download links are stripped before anything is sent to an assistant. Data an assistant has already received is subject to that assistant's own privacy settings, not this policy.",
        },
      ],
    },
    {
      id: "demo-mode",
      heading: "Demo mode",
      blocks: [
        {
          type: "p",
          text: "Opening `/demo` creates an anonymous guest session with a fictional household. The demo uses invented data, cannot connect banks, and cannot send reminders. Its session is kept in the tab's session storage, separate from any real account. Guest records created while exploring are not automatically removed from the database when you exit; they contain no real financial information.",
        },
      ],
    },
    {
      id: "retention-and-deletion",
      heading: "Retention and deletion",
      blocks: [
        {
          type: "p",
          text: "Marten keeps your data for as long as your account exists so it can keep showing you your history. Within the app you can delete individual accounts, transactions, receipts, categories, rules, recurring items, saved reports, and forecast scenarios, and you can disconnect any bank. A sample workspace has a **Clear sample workspace** action in Preferences that removes everything in it.",
        },
        {
          type: "p",
          text: "To delete your account, open **Settings → Preferences → Delete account** and complete the confirmation. Deletion signs you out, revokes assistant access, and removes your account, files, and financial records from the live database in background batches. Marten attempts to revoke Plaid connections; if a provider cannot complete revocation, manage that consent with the provider. Backups kept by Convex age out on their own schedule. Do not post account details in a public GitHub issue.",
        },
        {
          type: "p",
          text: "A few housekeeping records expire on their own: password-reset and reminder verification codes after 15 minutes, expired AI OAuth requests and tokens shortly after they lapse, and reminder delivery records 32 days after their due date.",
        },
        {
          type: "p",
          text: "You can export your data at any time: Transactions, Reports, Cash Flow, account balance history, and Forecast results each offer a CSV export.",
        },
      ],
    },
    {
      id: "your-rights",
      heading: "Your rights, including under GDPR and similar laws",
      blocks: [
        {
          type: "p",
          text: "Marten is run by an individual in the United States and is not aimed at any particular country, but the same rights are offered to everyone, whether or not a law such as the EU GDPR, the UK GDPR, or a US state privacy law applies to you.",
        },
        {
          type: "ul",
          items: [
            "**Access and portability.** Everything Marten holds about you is visible in the app. Transactions and reports export as CSV from the app; if you want a complete copy of your account data in a machine-readable form, ask through {{CONTACT_EMAIL}} and it will be provided within 30 days.",
            "**Correction.** You can edit your name, email, profile picture, accounts, transactions, categories, and settings yourself at any time.",
            "**Deletion.** Settings → Preferences → Delete account removes your workspace, files, connections, and sign-in in one step; there is no waiting period and nothing is kept except short-lived server logs and backups that age out on their own. You can also ask for deletion through {{CONTACT_EMAIL}}.",
            "**Restriction and objection.** Marten performs no profiling, no automated decision-making with legal effect, no marketing, and no processing beyond running the app for you, so there is nothing to opt out of; disconnecting a bank or deleting your account stops processing entirely.",
            "**Withdrawal of consent.** Bank connections, AI-assistant access, and reminders are each opt-in and can be switched off in the app at any time.",
            "**Complaint.** If you believe your rights have been ignored, you may contact your local data-protection authority. Please raise it with Marten first; it is a one-person project and most problems can be fixed quickly.",
          ],
        },
        {
          type: "p",
          text: "Legal basis, for those who need it stated: processing is necessary to provide the service you asked for (your account and the features you enable), and bank data is processed on the basis of the consent you give in Plaid Link or SimpleFIN Bridge. The data controller is the operator named in the Contact section. Data is stored in the United States; if you use Marten from elsewhere, your data is transferred there.",
        },
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: [
        {
          type: "p",
          text: "Passwords must be at least 12 characters and are stored hashed. Every backend function checks that you own the records it touches. Bank tokens stay on the server and are never sent to the browser. Plaid webhooks are signature-verified before they trigger any work. The [Security overview]({{SITE_URL}}/security) describes all of this in more detail, including what is not offered yet.",
        },
      ],
    },
    {
      id: "children",
      heading: "Children",
      blocks: [
        {
          type: "p",
          text: "Marten is not directed at children under 13, and it does not knowingly collect information from them. In practice the financial accounts Marten works with require an adult account holder anyway. If you believe a child has created an account, contact {{CONTACT_EMAIL}} and it will be removed.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "If this policy changes in a way that matters, the effective date at the top will change and the update will be noted in the project's GitHub repository. Continuing to use Marten after a change means you accept the updated policy. The promises in the section titled “What Marten does not do” are not going to change.",
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: [
        {
          type: "p",
          text: "For privacy questions, contact us through {{CONTACT_EMAIL}}. Use the in-app export and account-deletion controls to retrieve or remove your data. Do not include financial or account details in public GitHub issues. The site is operated by Drew in the United States.",
        },
      ],
    },
  ],
};
