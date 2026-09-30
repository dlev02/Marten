/**
 * One wording for what an AI connection can and cannot do, shared by the
 * consent page, Settings → AI connections and the access-key dialog. Screens
 * show the short summary and keep the full lists one click away.
 */
export const agentScopeCopy = {
  readSummary: "Accounts, transactions, reports and more",
  readAll:
    "Accounts, transactions, categories, merchants, tags, rules, preferences, reports, recurring schedules, investments, forecasts and credit-score history.",
  editSummary: "Tidy categories, merchants and manual balances",
  editAll:
    "Transaction annotations, bulk recategorizing, merchant names and logos, categories, tags, rules, review and pending preferences, account display, manual account balances and statement dates, credit scores, recurring schedules and saved forecasts. Merging a duplicate merchant or category removes the duplicate.",
  never:
    "Bank payments, trades, deleting transactions or accounts, and bank connections.",
} as const;
