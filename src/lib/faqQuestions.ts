export const faqQuestions = [
  {
    question: "Can I show Marten without showing my balances?",
    answer:
      "Turn on Hide amounts in Preferences → Privacy. Financial amounts and holding quantities become four dots, including chart amounts and tooltips. Merchants, dates, proportions and chart shapes stay visible. You can also hide or show amounts from the profile menu. The choice stays on this device after reload. Amount fields cannot be edited while hidden. This changes the display only: receipts, notes, statement text, exports and connected assistants still contain original information.",
    to: "/settings/preferences#privacy",
    linkLabel: "Open privacy preferences",
  },
  {
    question: "Can I use ChatGPT, Claude or a browser assistant with Marten?",
    answer:
      "Open Settings → AI connections. A browser with WebMCP support can use Marten’s tools while the page is open. A custom MCP connection can work from a supported AI app without that tab. You approve access to your own workspace, with reading as the default and a separate choice for edits. You can disconnect an assistant at any time. Marten does not need a model API key; availability depends on your assistant’s plan and client support. Remote setup also needs Marten hosted at an HTTPS address.",
    to: "/settings/agents",
    linkLabel: "Manage AI connections",
  },
  {
    question: "Can Marten notify me before a payment is due?",
    answer:
      "Preferences → Reminders offers browser notifications while a Marten tab is open and email reminders when it is closed. Browser delivery requires your permission. Email requires verification of your signed-in address and a configured email provider. Choose the lead time and delivery time. Paid items, paused schedules and past due dates do not create new reminders. Neither option makes a payment, and demo workspaces do not send reminders.",
    to: "/settings/preferences#reminders",
    linkLabel: "Set up reminders",
  },
  {
    question: "What happens when I hide a transaction?",
    answer:
      "The transaction stays in your list with its notes, tags and attachments. It is excluded from cash flow, spending reports and automatic recurring payment matches; your bank balance and net worth do not change. Use Transactions → Filters → Visibility to find hidden rows and Unhide to include them again. In Edit multiple, select transactions and choose Edit selected to hide or restore them together. Bank transactions are hidden rather than deleted so later syncs retain their identity.",
    to: "/transactions",
    linkLabel: "Open transactions",
  },
  {
    question: "Are recurring payments marked paid automatically?",
    answer:
      "Yes. An active schedule is marked paid or received when exactly one visible, posted transaction matches its merchant, account, amount tolerance and date within three days. Pending, hidden, removed, ambiguous or unmatched transactions do not check off a schedule. One transaction cannot pay two schedules. A manual paid or unpaid choice overrides automatic matching. Checkmarks update when a transaction changes and never send a payment.",
    to: "/recurring",
    linkLabel: "Review recurring payments",
  },
  {
    question: "Which investment figures can Marten show?",
    answer:
      "Plaid holdings can include institution prices, quantities, position values and total cost basis. Unrealized gain is shown only where basis is available. SimpleFIN positions show reported quantities and values, with unit price calculated as value divided by quantity. SimpleFIN quote dates, total basis and gains remain unavailable where their meaning has not been verified. The historical chart shows saved account value, including deposits and withdrawals; it is not a security price chart or investment return. Data is cached and depends on your institution.",
    to: "/investments",
    linkLabel: "View investments",
  },
  {
    question: "What if a subscription changes cards, price, or gets canceled?",
    answer:
      "Edit the existing recurring schedule to change its account or amount. These changes apply to the whole schedule; Marten does not keep dated versions or automatically move subscriptions between cards. Pause a canceled service to keep the schedule saved; its posted charges stay in Transactions. Resume the schedule and update its start date when you subscribe again. A renewal within three days can match the existing date. Future price changes need a manual update when they take effect. Keep introductory and renewal prices in Notes. Separate subscriptions at one merchant can have their own names, amounts, and statement filters.",
    to: "/recurring",
    linkLabel: "Review schedules",
  },
  {
    question:
      "Can I change a merchant logo from a transaction or recurring schedule?",
    answer:
      "Yes. In transaction details, choose Edit merchant. In a recurring schedule, choose Edit merchant and logo. The same editor is available in Settings → Merchants, with a local logo catalog, website lookup, and image upload. Save merchant to apply the name, color, and logo everywhere that merchant appears.",
    to: "/settings/merchants",
    linkLabel: "Open merchants",
  },
  {
    question: "How does Marten find recurring subscriptions?",
    answer:
      "Marten looks for repeated posted charges from the same merchant and account, with similar amounts and consistent weekly, biweekly, monthly, quarterly or yearly timing. It shows the evidence and any history limit before you add a schedule. Suggestions need your review; an ordinary repeat purchase should not become a subscription automatically. No paid AI service is required for detection.",
    to: "/recurring",
    linkLabel: "Review recurring items",
  },
  {
    question: "Can I connect banks without Plaid?",
    answer:
      "Yes. SimpleFIN Bridge is a low-cost subscription that links up to 25 institutions. Link your banks there, create a setup token, and paste it into Marten. Balances and posted transactions import daily; Marten never sees your bank passwords.",
    to: "/settings/institutions#simplefin",
    linkLabel: "Connect SimpleFIN",
  },
  {
    question: "How far back can Marten get my bank transactions?",
    answer:
      "With Plaid, Marten requests up to 730 days—about two years—when you first connect a bank. The amount your bank provides can be shorter. Recent transactions often arrive first, with older history following as the connection finishes syncing. Marten keeps the history it has already imported as new transactions arrive.",
    source: "https://plaid.com/docs/transactions/",
    sourceLabel: "Plaid transaction history",
  },
  {
    question: "Can I bring in my old Excel spreadsheet?",
    answer:
      "Yes. Open Transactions and choose Import. Select an Excel workbook (.xlsx) or CSV file, choose a worksheet, and match its date, description, and amount columns. Files support up to 50,000 rows and 25 MB, with background validation and small save batches. You can preview the rows and review each account before saving. Separate money-in and money-out columns are supported. A Monarch Money transaction export is recognized automatically: its merchants, categories, accounts, notes, tags, review status, and IDs carry over, and rows that match a transaction your bank already synced update that transaction instead of duplicating it.",
    to: "/transactions",
    linkLabel: "Open transactions",
  },
  {
    question: "What columns does my spreadsheet need?",
    answer:
      "Three are required: a date (YYYY-MM-DD or month/day/year), a description, and an amount, either one signed column or separate money-out and money-in columns. Optional columns are merchant, category, account, notes, tags (comma-separated), reviewed, and a transaction ID. Headers are matched by name, such as Date, Description or Original Statement, Amount or Debit and Credit, so bank downloads and hand-kept spreadsheets work without renaming; anything unmatched can be picked by hand. Category and account names are matched to yours, and an account label ending in its last digits, like “Checking (...1234)”, matches by those digits. Missing accounts can be created as manual accounts, including closed historical accounts. Missing categories keep their file names with a suggested icon and type you can review. Creation happens only when you import. The dialog shows all Monarch mappings together and offers a template CSV to download.",
    to: "/transactions?import=true",
    linkLabel: "Open import",
  },
  {
    question: "Will importing transactions change my account balance?",
    answer:
      "No. Transaction history and balance history are separate. A bank supplies the current balance for a connected account. You can set a manual account’s balance yourself and import dated balances from its account details. To rebuild net worth history, import a balance export such as Monarch Money’s Date, Balance, Account file from Transactions → Import; each day’s balance is added to the matching account so the net worth chart reaches back through the file.",
  },
  {
    question: "Does Marten support Chase, American Express, and Schwab?",
    answer:
      "Marten connects through Plaid. Choose checking and credit cards for everyday transactions, or investments for brokerage and retirement accounts. The accounts and details available depend on your bank’s connection and your consent. Brokerage and IRA balances count toward net worth. The Investments page shows available holdings, allocation, cost basis, and investment activity.",
    to: "/settings/institutions",
    linkLabel: "Manage bank connections",
  },
  {
    question: "How often do my accounts update?",
    answer:
      "Marten checks connected accounts periodically and also responds to updates from Plaid. Bank transaction checks typically happen one to four times a day, depending on the institution. Sync now requests a fresh update, but your bank may still take time to provide a new transaction or balance. Each connection shows its latest sync status.",
    source: "https://plaid.com/docs/transactions/",
    sourceLabel: "How Plaid updates transactions",
  },
  {
    question: "Where do credit-card due dates and statement amounts come from?",
    answer:
      "Marten shows statement balances, minimum payments, and due dates when your bank makes them available through Plaid. In Recurring, you can add a manual statement reminder with its own date and amounts; it is labeled Entered by you and remains separate from bank data. A current card balance is different from the statement balance and can change after the statement closes. Check your bank’s statement for the final payment amount and date. Recurring items you add yourself are reminders; marking one paid does not send a payment.",
  },
  {
    question: "Why don’t transfers and card payments count as spending?",
    answer:
      "Moving money between your accounts is a transfer. Your card purchases count as spending when they occur; paying the card is another transfer, so the same expense is not counted twice. Refunds reduce spending in their category. Pending authorizations stay out of cash flow and reports until they post.",
  },
  {
    question: "Can I correct a transaction or divide it between categories?",
    answer:
      "Open a transaction to change its merchant, category, notes, tags, or review status. You can also change dates on manual transactions; bank-managed dates stay with the provider. Split an amount across categories when one purchase covers several things; the pieces must add up to the transaction total. Attach a receipt if you want it alongside the transaction. Rules can apply your choices to future matching transactions, and Preview shows what a rule would change.",
  },
  {
    question: "What happens if I disconnect a bank?",
    answer:
      "Marten revokes its Plaid connection and stops syncing that bank. Your cached accounts, balances, transactions, and edits remain available. Use Reconnect to repair an existing connection before disconnecting and adding a bank again. Marten never needs to see your bank’s password.",
  },
  {
    question: "How do I reset my password?",
    answer:
      "Choose Forgot password on the sign-in screen. Marten emails a one-time code to your account’s address. Enter that code and a new password of at least 12 characters. The code expires after 15 minutes. A successful reset signs out your other sessions.",
  },
  {
    question: "Can I plan for retirement and trips each year?",
    answer:
      "Open Forecast to adjust retirement age, income, living spending, investment growth, and inflation. Add a travel plan with trips per year, cost per trip, and an age range. Marten models its full annual cost in the selected budget month. Save copies to compare plans. The savings result is the total monthly spending reduction needed before retirement; ordinary unspent income is already invested by the model. Review the starting data and remove travel already included in living spending.",
    to: "/forecast?view=long-term",
    linkLabel: "Open forecast",
  },
  {
    question: "What does a forecast leave out?",
    answer:
      "A long-term scenario follows your entered growth and inflation assumptions. It does not predict market volatility or calculate taxes, early-withdrawal penalties, debt payoff, or benefits eligibility. Cash and investments fund the plan; property and other illiquid assets do not. Retirement funds become available at the chosen access age. Marten shows the first period with unmet spending even if restricted funds remain. Today's dollars remove modeled inflation, while future dollars show nominal amounts.",
  },
  {
    question: "Can I see whether checking will run low before payday?",
    answer:
      "The near-term forecast starts with current cash-account balances and adds future unpaid recurring items assigned to those accounts. Choose one account to see its lowest projected balance, or view all included cash accounts together. An optional daily allowance adds variable spending. Credit-card purchases, unassigned reminders, and variable spending beyond that allowance are not automatically added. Mark a recurring occurrence paid when it is already included in the starting balance.",
    to: "/forecast?view=near-term",
    linkLabel: "Open near-term forecast",
  },
  {
    question: "Are investment gains the same as my return over time?",
    answer:
      "No. Unrealized gain compares a holding's current value with its available cost basis. The value-history chart shows account balances over time, which also change with deposits and withdrawals. Neither is a time-weighted or money-weighted return. Missing cost basis stays unknown. Prices and holdings reflect the dates supplied by the institution, rather than a live market feed.",
    to: "/investments",
    linkLabel: "Open investments",
  },
  {
    question: "Can I track my credit score?",
    answer:
      "Credit scores keeps the values you enter or review from a PDF. Import a supported text PDF to suggest available fields, then confirm the score, date, bureau, model, and source. The document is read in your browser and is not stored. Histories stay separate by bureau and scoring model. Scores are not pulled automatically from a bank or credit bureau.",
    keywords:
      "credit score fico vantage pdf discover report bureau model history",
  },
  {
    question: "How do I show someone the app without my accounts?",
    answer:
      "Choose Open demo in your profile menu to open a separate tab with a fictional household. You can try the working screens and save changes in that demo. Your signed-in account stays separate. Exit demo returns to your normal account or the sign-in screen. Bank connections are disabled in demo mode.",
    keywords: "guest demo sample fictional privacy explore",
  },
  {
    question: "Can I choose a custom category icon?",
    answer:
      "Yes. Open Categories, add or edit a category, and select its icon. Search the Marten collection by name or browse groups such as Transport, Travel, and Health & care. You can also paste your own emoji. In Preferences, choose Illustrated for Marten’s custom artwork or System emoji for your device’s emoji.",
    keywords:
      "category icons artwork library gaming pharmacy dentist hotel emoji custom",
    to: "/settings/categories",
    linkLabel: "Open categories",
  },
  {
    question: "Can Marten match my device’s appearance?",
    answer:
      "In Preferences, choose Match system for light and dark mode, System font to use your device’s familiar typeface, and Illustrated or System emoji for category icons. Appearance and sidebar choices are saved for this browser. Your name and profile picture belong to your account. Marten also respects your device’s reduced-motion setting.",
    to: "/settings/preferences",
    linkLabel: "Open preferences",
  },
  {
    question: "Why don’t my stock purchases show up as transactions?",
    answer:
      "Trades, dividends and cash sweeps from brokerage and retirement accounts stay out of Transactions unless you turn on Preferences → Transactions → Investment account activity. Off is the default so buying shares never counts as spending in cash flow or reports and never fills the Merchants list; balances and holdings for those accounts still update. When you turn it on, daily imports include the activity and you can fetch what SimpleFIN already holds. Turning it off again offers to remove the rows an earlier import brought in.",
    to: "/settings/preferences#transaction-preferences",
    linkLabel: "Open transaction preferences",
  },
];
