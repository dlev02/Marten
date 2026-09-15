import { categoryDefinitions } from "../../convex/lib/categoryDefaults";
import { categoryIcons } from "./categoryIcons";
import {
  detectExportFormat,
  matchAccount,
  matchCategory,
  previewImport,
  previewBalanceImport,
  type ImportLookup,
  type ImportOptions,
  type ImportSheet,
} from "./transactionImport";

export type NewImportAccount = {
  name: string;
  kind: "cash" | "credit" | "investment" | "loan" | "asset";
  closed: boolean;
};
export type NewImportCategory = {
  name: string;
  emoji: string;
  kind: "expense" | "income" | "transfer";
  /** Starter group name the category should join; created when missing. */
  group: string;
};
export type ImportChoices = {
  accounts: Record<string, Omit<NewImportAccount, "name">>;
  categories: Record<
    string,
    Omit<NewImportCategory, "name" | "group"> & { group?: string }
  >;
};
export const newImportId = (name: string) =>
  `new:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
export const isNewImportId = (id: string) => id.startsWith("new:");
const words = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/);
/** Keyword families, in priority order, that place an imported category in a starter group. */
const groupKeywords: [string, RegExp][] = [
  [
    "Health & wellness",
    /\b(medical|doctors?|pharmacy|health|fitness|gym|dental|dentist|vision|toiletries|haircuts?|salon|therapy|wellness|hospital)\b/,
  ],
  [
    "Education",
    /\b(tuition|courses?|school|textbooks?|education|educational|learning|student)\b/,
  ],
  [
    "Travel",
    /\b(flights?|hotels?|hostels?|bnbs?|airbnb|lodging|accommodation|e?sim|roaming|souvenirs?|tours?|travel|trips?|vacation|luggage|ferry|ferries|cruise)\b/,
  ],
  [
    "Food & drink",
    /\b(grocery|groceries|restaurants?|bars?|coffee|cafe|meals?|delivery|kits?|snacks?|vending|edibles?|dining|food|drinks?|convenience|takeout|lunch|dinner|breakfast|alcohol|liquor)\b/,
  ],
  [
    "Auto & transport",
    /\b(gas|fuel|transit|subway|trains?|bus|parking|tolls?|rideshare|rides?|uber|lyft|taxis?|scooters?|bikes?|car|auto|vehicle|transport|transportation|metro|commute)\b/,
  ],
  [
    "Housing",
    /\b(rent|mortgage|home|house|housing|cleaning|hoa|repairs?|maintenance|lawn|garden)\b/,
  ],
  [
    "Bills & utilities",
    /\b(utilities|utility|electric|electricity|water|garbage|trash|internet|phone|mobile|cell|wifi|cable|domains?|hosting|apis?|software|apps?|digital|ai|assistants?)\b/,
  ],
  [
    "Entertainment",
    /\b(entertainment|games?|video|movies?|theat(?:er|re)|concerts?|music|hobby|hobbies|activities|activity|fun|bowling|performances?|streaming|subscriptions?)\b/,
  ],
  ["Family & pets", /\b(child|children|childcare|kids?|baby|pets?|daycare)\b/],
  ["Gifts & giving", /\b(gifts?|charity|donations?|giving|church|tithe)\b/],
  [
    "Financial",
    /\b(tax|taxes|fees?|bank|loans?|insurance|atm|cash|adjustments?|financial|investments?|brokerage)\b/,
  ],
  [
    "Shopping",
    /\b(shop|shopping|clothing|clothes|apparel|shoes|electronics|amazon|target|walmart|furniture|housewares|postage|shipping|misc|miscellaneous)\b/,
  ],
];
/** Picks the starter group whose vocabulary matches the imported name; "Other" when none does. */
export function suggestImportGroup(
  name: string,
  kind: NewImportCategory["kind"],
) {
  if (kind === "income") return "Income";
  if (kind === "transfer") return "Transfers";
  const key = words(name).join(" ");
  return groupKeywords.find(([, pattern]) => pattern.test(key))?.[0] ?? "Other";
}
export function suggestImportCategory(name: string): NewImportCategory {
  const key = words(name).join(" ");
  for (const [group, kind, categories] of categoryDefinitions) {
    const preset = categories.find(([label]) => words(label).join(" ") === key);
    if (preset) return { name, kind, emoji: preset[1], group };
  }
  // Never infer income from the sign: refunds also have negative amounts.
  const kind =
    /\b(transfer|transfers|credit card payments?|balance adjustments?)\b/.test(
      key,
    )
      ? "transfer"
      : /\b(income|paychecks?|salary|wages|interest|dividends)\b/.test(key)
        ? "income"
        : "expense";
  const tokens = words(name).filter((w) => w.length > 2);
  const scored = categoryIcons
    .map((icon) => {
      const names = words(icon.name);
      const keywords = words(icon.keywords);
      return {
        icon,
        score: tokens.reduce(
          (sum, token) =>
            sum +
            (names.includes(token) ? 3 : keywords.includes(token) ? 1 : 0),
          0,
        ),
      };
    })
    .sort((a, b) => b.score - a.score);
  const emoji = /\b(ferry|ferries)\b/.test(key)
    ? "⛴️"
    : scored[0]?.score
      ? scored[0].icon.emoji
      : "📁";
  return { name, kind, emoji, group: suggestImportGroup(name, kind) };
}
export function suggestImportAccount(name: string): NewImportAccount {
  const label = name.toLowerCase();
  const kind = /\b(card|credit|visa|mastercard|amex)\b/.test(label)
    ? "credit"
    : /\b(loan|mortgage)\b/.test(label)
      ? "loan"
      : /\b(ira|401k|brokerage|investment)\b/.test(label)
        ? "investment"
        : "cash";
  return { name, kind, closed: /\b(closed|archived)\b/.test(label) };
}

/** The worker plans destinations without writing anything. Real IDs replace these only on Import. */
export function planImport(
  sheet: ImportSheet,
  options: ImportOptions,
  accounts: ImportLookup[],
  categories: ImportLookup[],
  choices: ImportChoices,
) {
  const balanceMode =
    detectExportFormat(sheet.rows[options.headerRow - 1] ?? []) ===
    "monarch-balances";
  const accountColumn = balanceMode
    ? (sheet.rows[options.headerRow - 1] ?? []).findIndex(
        (c) => String(c).trim().toLowerCase() === "account",
      )
    : options.mapping.account;
  const names = (column: number) =>
    column < 0
      ? []
      : [
          ...new Set(
            sheet.rows
              .slice(options.headerRow)
              .map((r) => String(r[column] ?? "").trim())
              .filter(Boolean),
          ),
        ];
  const accountNames = names(accountColumn);
  const categoryNames = balanceMode ? [] : names(options.mapping.category);
  if (accountNames.length > 200 || categoryNames.length > 500) {
    const error =
      "This file has more than 200 account names or 500 category names. Combine duplicate names in the file before importing.";
    const empty = {
      rows: [sheet.rows[options.headerRow - 1] ?? []],
      date1904: sheet.date1904,
    };
    return {
      newAccounts: [],
      newCategories: [],
      preview: balanceMode
        ? null
        : {
            ...previewImport(
              empty,
              { ...options, headerRow: 1 },
              accounts,
              categories,
            ),
            error,
          },
      balancePreview: balanceMode
        ? {
            ...previewBalanceImport(
              empty,
              {
                headerRow: 1,
                dateOrder: options.dateOrder,
                accountMap: {},
                invertDebts: true,
              },
              accounts,
            ),
            error,
          }
        : null,
    };
  }
  const newAccounts = accountNames
    .filter((name) => {
      const mapped = options.accountMap[name];
      return mapped === undefined
        ? !matchAccount(name, accounts)
        : isNewImportId(mapped);
    })
    .map((name) => ({
      ...suggestImportAccount(name),
      ...choices.accounts[name],
    }));
  const newCategories = categoryNames
    .filter((name) => {
      const mapped = options.categoryMap[name];
      return mapped === undefined
        ? !matchCategory(name, categories)
        : isNewImportId(mapped);
    })
    .map((name) => {
      // A changed type moves the group unless the person picked one.
      const suggested = suggestImportCategory(name),
        choice = choices.categories[name];
      return {
        ...suggested,
        ...choice,
        group:
          choice?.group ??
          (choice && choice.kind !== suggested.kind
            ? suggestImportGroup(name, choice.kind)
            : suggested.group),
      };
    });
  const plannedAccounts = [
    ...accounts,
    ...new Map(
      newAccounts.map((a) => [
        newImportId(a.name),
        { ...a, _id: newImportId(a.name) },
      ]),
    ).values(),
  ];
  const plannedCategories = [
    ...categories,
    ...new Map(
      newCategories.map((c) => [
        newImportId(c.name),
        { ...c, _id: newImportId(c.name) },
      ]),
    ).values(),
  ];
  const resolved = {
    ...options,
    accountMap: {
      ...options.accountMap,
      ...Object.fromEntries(
        newAccounts.map((a) => [a.name, newImportId(a.name)]),
      ),
    },
    categoryMap: {
      ...options.categoryMap,
      ...Object.fromEntries(
        newCategories.map((c) => [c.name, newImportId(c.name)]),
      ),
    },
  };
  const preview = balanceMode
    ? null
    : previewImport(sheet, resolved, plannedAccounts, plannedCategories);
  const balancePreview = balanceMode
    ? previewBalanceImport(
        sheet,
        {
          headerRow: options.headerRow,
          dateOrder: options.dateOrder,
          accountMap: resolved.accountMap,
          invertDebts: true,
        },
        plannedAccounts,
      )
    : null;
  // Do not create destinations whose every row was rejected.
  const usedAccounts = new Set(
    (preview?.valid ?? balancePreview?.valid ?? []).map((r) => r.accountId),
  );
  const usedCategories = new Set(
    (preview?.valid ?? []).map((r) => r.categoryId),
  );
  return {
    preview,
    balancePreview,
    newAccounts: newAccounts.filter((a) =>
      usedAccounts.has(newImportId(a.name)),
    ),
    newCategories: newCategories.filter((c) =>
      usedCategories.has(newImportId(c.name)),
    ),
  };
}
