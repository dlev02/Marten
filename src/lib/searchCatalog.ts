export type SearchDestination = {
  id: string;
  title: string;
  section: string;
  path: string;
  keywords?: string;
};

// Add destinations here whenever a new screen or preference is introduced.
export const searchDestinations: SearchDestination[] = [
  {
    id: "hide-amounts",
    title: "Hide amounts",
    section: "Preferences",
    path: "/settings/preferences#privacy",
    keywords:
      "privacy private mask balances values numbers cost basis screen sharing presentation hide money",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    section: "Pages",
    path: "/dashboard",
    keywords: "home overview widgets customize",
  },
  {
    id: "accounts",
    title: "Accounts",
    section: "Pages",
    path: "/accounts",
    keywords:
      "net worth balance history assets liabilities manual bank brokerage retirement ira",
  },
  {
    id: "transactions",
    title: "Transactions",
    section: "Pages",
    path: "/transactions",
    keywords: "purchases spending split notes edit bulk export",
  },
  {
    id: "receipts",
    title: "Receipts & attachments",
    section: "Transactions",
    path: "/transactions?tab=receipts",
    keywords: "receipt attach upload photo pdf file",
  },
  {
    id: "import",
    title: "Import a spreadsheet",
    section: "Transactions",
    path: "/transactions?import=true",
    keywords:
      "excel xlsx csv upload columns merchant amount debit credit date notes duplicate monarch money migrate tags reviewed template format headers",
  },
  {
    id: "import-balances",
    title: "Import balance history",
    section: "Accounts",
    path: "/transactions?import=true",
    keywords:
      "monarch money balance history net worth csv export migrate accounts past",
  },
  {
    id: "cashflow",
    title: "Cash Flow",
    section: "Pages",
    path: "/cash-flow",
    keywords:
      "income expenses savings monthly quarterly yearly money flow sankey",
  },
  {
    id: "reports",
    title: "Reports",
    section: "Pages",
    path: "/reports",
    keywords: "analysis spending income filters charts save export",
  },
  {
    id: "recurring",
    title: "Recurring",
    section: "Pages",
    path: "/recurring",
    keywords:
      "bills payday subscriptions calendar upcoming payment statement due",
  },
  {
    id: "investments",
    title: "Investments",
    section: "Pages",
    path: "/investments",
    keywords:
      "portfolio holdings stocks bonds funds securities allocation brokerage ira cost basis unrealized gains returns activity",
  },
  {
    id: "forecast",
    title: "Forecast · retirement & travel",
    section: "Pages",
    path: "/forecast?view=long-term",
    keywords:
      "forecasting projection planning scenarios compare retire age annual returns inflation trips vacation saving savings money lasts future",
  },
  {
    id: "runway",
    title: "Near-term forecast",
    section: "Forecast",
    path: "/forecast?view=near-term",
    keywords:
      "forecasting cash runway checking balance upcoming bills payday lowest balance daily spending buffer next month",
  },
  {
    id: "credit-scores",
    title: "Credit score history",
    section: "Pages",
    path: "/credit-scores",
    keywords:
      "credit score fico vantage bureau experian equifax transunion report statement pdf import manual history",
  },
  {
    id: "categories",
    title: "Categories & groups",
    section: "Settings",
    path: "/settings/categories",
    keywords:
      "settings category groups reorder rename income expense transfer disable icon library artwork gaming transit suggested categories pharmacy accommodation hotels eSIM ferries video games",
  },
  {
    id: "support",
    title: "Support Marten",
    section: "Pages",
    path: "/support",
    keywords:
      "donate donation ko-fi kofi sponsor tip coffee thank you help the project",
  },
  {
    id: "feedback",
    title: "Send feedback",
    section: "Help",
    path: "/support?feedback=1",
    keywords:
      "bug report issue problem broken idea feature request suggestion question github contact",
  },
  {
    id: "merchants",
    title: "Merchants",
    section: "Settings",
    path: "/settings/merchants",
    keywords: "settings merchant logo merge rename stores",
  },
  {
    id: "rules",
    title: "Rules",
    section: "Settings",
    path: "/settings/rules",
    keywords:
      "settings automation automatically categorize conditions actions preview order",
  },
  {
    id: "tags",
    title: "Tags",
    section: "Settings",
    path: "/settings/tags",
    keywords: "settings labels colors reorder organize",
  },
  {
    id: "institutions",
    title: "Bank connections",
    section: "Settings",
    path: "/settings/institutions",
    keywords:
      "settings institutions plaid simplefin bridge chase amex schwab sync refresh reconnect disconnect",
  },
  {
    id: "simplefin",
    title: "SimpleFIN Bridge · connect banks",
    section: "Settings",
    path: "/settings/institutions#simplefin",
    keywords:
      "simplefin simple fin bridge setup token bank provider connect import accounts subscription",
  },
  {
    id: "agents",
    title: "AI connections · browser & MCP",
    section: "Settings",
    path: "/settings/agents",
    keywords:
      "assistant agent ai webmcp mcp chatgpt claude aside permissions read edit revoke connection subscription model",
  },
  {
    id: "preferences",
    title: "Preferences",
    section: "Settings",
    path: "/settings/preferences",
    keywords: "settings personalize",
  },
  {
    id: "profile",
    title: "Name & profile picture",
    section: "Preferences",
    path: "/settings/preferences#profile",
    keywords: "settings profile name avatar initials picture photo crop upload",
  },
  {
    id: "appearance",
    title: "Appearance · light & dark mode",
    section: "Preferences",
    path: "/settings/preferences#appearance",
    keywords:
      "settings preferences appearance theme dark mode light mode match system automatic",
  },
  {
    id: "font",
    title: "Interface font",
    section: "Preferences",
    path: "/settings/preferences#appearance",
    keywords:
      "settings preferences font typeface typography dm sans system text",
  },
  {
    id: "sidebar-labels",
    title: "Collapsed sidebar labels",
    section: "Preferences",
    path: "/settings/preferences#appearance",
    keywords: "sidebar collapsed labels tooltips hover navigation preferences",
  },
  {
    id: "category-icons",
    title: "Category icons · illustrated or emoji",
    section: "Preferences",
    path: "/settings/preferences#appearance",
    keywords:
      "category icons emoji illustration custom marten woodland system appearance",
  },
  {
    id: "review",
    title: "Review new transactions",
    section: "Preferences",
    path: "/settings/preferences#transaction-preferences",
    keywords:
      "settings preferences review new transactions unreviewed check categories",
  },
  {
    id: "pending",
    title: "Show pending transactions",
    section: "Preferences",
    path: "/settings/preferences#transaction-preferences",
    keywords: "settings preferences pending transactions authorization posted",
  },
  {
    id: "reminders",
    title: "Reminders & notifications",
    section: "Preferences",
    path: "/settings/preferences#reminders",
    keywords:
      "settings recurring bills due date browser email notifications time zone delivery reminder",
  },
  {
    id: "sample",
    title: "Sample workspace",
    section: "Preferences",
    path: "/settings/preferences#sample-workspace",
    keywords: "settings demo sample fictional clear delete reset workspace",
  },
  {
    id: "faq",
    title: "Help & FAQ",
    section: "Settings",
    path: "/settings/faq",
    keywords:
      "settings help faq questions password reset bank history 730 days syncing importing statements transfers refunds appearance",
  },
  {
    id: "delete-account",
    title: "Delete account",
    section: "Settings",
    path: "/settings/preferences#delete-account",
    keywords: "delete account remove data close erase privacy",
  },
];

export function searchMatches(items: SearchDestination[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items
    .filter((item) =>
      words.every((word) =>
        `${item.title} ${item.section} ${item.keywords ?? ""}`
          .toLocaleLowerCase()
          .includes(word),
      ),
    )
    .sort(
      (a, b) =>
        Number(
          b.title
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        ) -
        Number(
          a.title
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        ),
    );
}
