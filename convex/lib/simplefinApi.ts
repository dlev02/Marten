import { ConvexError, v, type Infer } from "convex/values";
import { accountKind } from "../validators";
import { merchantDisplayName } from "./merchantNames";

/**
 * SimpleFIN protocol client (https://www.simplefin.org/protocol.html).
 *
 * A user creates a Setup Token in their SimpleFIN Bridge account. The token is
 * a base64 claim URL; one POST to it returns an Access URL whose embedded Basic
 * credentials authorize `GET /accounts`. The claim works exactly once, so the
 * Access URL is stored before anything else happens.
 */
export const simplefinSelection = v.object({
  externalAccountId: v.string(),
  targetAccountId: v.optional(v.id("accounts")),
  kind: accountKind,
});
export const simplefinAccount = v.object({
  externalId: v.string(),
  name: v.string(),
  institution: v.string(),
  mask: v.string(),
  kind: accountKind,
  subtype: v.string(),
  balanceCents: v.number(),
  currency: v.literal("USD"),
  availableCents: v.optional(v.number()),
  lastUpdated: v.optional(v.number()),
});
export const simplefinTransaction = v.object({
  externalId: v.string(),
  externalAccountId: v.string(),
  date: v.string(),
  amountCents: v.number(),
  name: v.string(),
  merchant: v.string(),
  category: v.string(),
});
export type SimplefinAccount = Infer<typeof simplefinAccount>;
export type SimplefinTransaction = Infer<typeof simplefinTransaction>;
export type SimplefinSelection = Infer<typeof simplefinSelection>;

export class SimplefinFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function simplefinError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data;
  const code =
    error instanceof SimplefinFailure ? error.code : "REQUEST_FAILED";
  const detail: Record<string, string> = {
    SETUP_TOKEN:
      "That doesn’t look like a SimpleFIN setup token. Copy the whole token from SimpleFIN Bridge and try again.",
    CLAIMED:
      "This setup token was already used or has expired. Create a new one in SimpleFIN Bridge.",
    AUTH: "SimpleFIN rejected the saved access token. Create a new setup token in SimpleFIN Bridge and connect again.",
    PAYMENT:
      "SimpleFIN Bridge reports that the subscription needs attention. Check your SimpleFIN account, then try again.",
    RATE_LIMIT:
      "SimpleFIN is limiting requests. Wait a while before importing again; the bridge updates about once a day.",
    RESPONSE_LIMIT:
      "SimpleFIN returned more data than this import can safely process. Choose a later start date or fewer accounts.",
    INVALID_RESPONSE:
      "SimpleFIN returned an unexpected data format. Nothing unvalidated was imported; try again later.",
    REQUEST_FAILED:
      "The SimpleFIN import could not finish. Check your SimpleFIN Bridge connections, then retry. Existing Marten data is retained.",
  };
  return detail[code] ?? detail.REQUEST_FAILED;
}

const MAX_BODY = 10_000_000;
const TIMEOUT_MS = 30000;
/** The bridge recommends at most 45 days per request and may cap longer ranges. */
export const WINDOW_DAYS = 45;
/** Repeat imports re-read a few days so late-posting records are not missed. */
export const OVERLAP_DAYS = 5;

function string(value: unknown, limit = 120): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function blockedHost(host: string) {
  return (
    !host.includes(".") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host.includes(":") ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(
      host,
    )
  );
}
/** Decodes a pasted setup token into its claim URL without following it. */
export function decodeSetupToken(token: string): string {
  const clean = token.trim();
  if (!clean || clean.length > 4096 || !/^[A-Za-z0-9+/=_-]+$/.test(clean))
    throw new SimplefinFailure("SETUP_TOKEN");
  let decoded: string;
  try {
    decoded = atob(clean.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw new SimplefinFailure("SETUP_TOKEN");
  }
  let url: URL;
  try {
    url = new URL(decoded.trim());
  } catch {
    throw new SimplefinFailure("SETUP_TOKEN");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    blockedHost(url.hostname)
  )
    throw new SimplefinFailure("SETUP_TOKEN");
  return url.href;
}
export type AccessCredentials = {
  /** Origin plus base path, without credentials or a trailing slash. */
  base: string;
  authorization: string;
  host: string;
};
/** Splits an access URL into a request base and a Basic Authorization header. */
export function parseAccessUrl(accessUrl: string): AccessCredentials {
  let url: URL;
  try {
    url = new URL(accessUrl.trim());
  } catch {
    throw new SimplefinFailure("INVALID_RESPONSE");
  }
  if (
    url.protocol !== "https:" ||
    !url.username ||
    !url.password ||
    url.search ||
    url.hash ||
    blockedHost(url.hostname)
  )
    throw new SimplefinFailure("INVALID_RESPONSE");
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const path = url.pathname.replace(/\/+$/, "");
  return {
    base: `${url.origin}${path}`,
    authorization: `Basic ${btoa(`${user}:${password}`)}`,
    host: url.hostname,
  };
}
async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new SimplefinFailure("INVALID_RESPONSE");
  const decoder = new TextDecoder();
  let size = 0,
    body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new SimplefinFailure("RESPONSE_LIMIT");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}
async function timedFetch(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
/** Exchanges a claim URL for an access URL. This succeeds at most once per token. */
export async function claimAccessUrl(claimUrl: string): Promise<string> {
  const response = await timedFetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });
  if (response.status === 403) throw new SimplefinFailure("CLAIMED");
  if (response.status === 402) throw new SimplefinFailure("PAYMENT");
  if (!response.ok) throw new SimplefinFailure("REQUEST_FAILED");
  const body = (await readBody(response)).trim();
  if (body.length > 2048) throw new SimplefinFailure("INVALID_RESPONSE");
  parseAccessUrl(body);
  return body;
}
export type AccountsQuery = {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  balancesOnly?: boolean;
};
function unixSeconds(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}
/** GET /accounts with the documented query parameters. */
export async function simplefinAccounts(
  accessUrl: string,
  query: AccountsQuery,
): Promise<unknown> {
  const credentials = parseAccessUrl(accessUrl);
  const params = new URLSearchParams();
  if (query.startDate)
    params.set("start-date", String(unixSeconds(query.startDate)));
  if (query.endDate)
    // end-date is exclusive, so include the whole final day.
    params.set("end-date", String(unixSeconds(query.endDate) + 86400));
  if (query.balancesOnly) params.set("balances-only", "1");
  for (const id of query.accountIds ?? []) params.append("account", id);
  const suffix = [...params].length ? `?${params.toString()}` : "";
  const response = await timedFetch(`${credentials.base}/accounts${suffix}`, {
    method: "GET",
    headers: {
      Authorization: credentials.authorization,
      Accept: "application/json",
    },
  });
  if (response.status === 401 || response.status === 403)
    throw new SimplefinFailure("AUTH");
  if (response.status === 402) throw new SimplefinFailure("PAYMENT");
  if (response.status === 429) throw new SimplefinFailure("RATE_LIMIT");
  if (!response.ok) throw new SimplefinFailure("REQUEST_FAILED");
  try {
    return JSON.parse(await readBody(response)) as unknown;
  } catch (error) {
    if (error instanceof SimplefinFailure) throw error;
    throw new SimplefinFailure("INVALID_RESPONSE");
  }
}

export type ProviderObject = Record<string, unknown>;
function object(value: unknown): ProviderObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SimplefinFailure("INVALID_RESPONSE");
  return value as ProviderObject;
}
function rows(value: unknown, limit: number): ProviderObject[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new SimplefinFailure("INVALID_RESPONSE");
  if (value.length > limit) throw new SimplefinFailure("RESPONSE_LIMIT");
  return value.map(object);
}
/** Parses a decimal string such as "-12.30" into integer cents without float drift. */
export function decimalCents(value: unknown): number {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? value.toFixed(2)
      : string(value, 40);
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.test(text)
    ? text.match(/^([+-])?(\d+)(?:\.(\d+))?$/)!
    : null;
  if (!match) throw new SimplefinFailure("INVALID_RESPONSE");
  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]);
  const fraction = (match[3] ?? "").padEnd(3, "0");
  // Round a third decimal half away from zero; providers rarely send one.
  const cents =
    whole * 100 +
    Number(fraction.slice(0, 2)) +
    (Number(fraction[2]) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(cents) || cents > 1e13)
    throw new SimplefinFailure("INVALID_RESPONSE");
  return cents === 0 ? 0 : sign * cents;
}
export function unixDate(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return undefined;
  const iso = new Date(value * 1000).toISOString().slice(0, 10);
  return iso >= "1970-01-01" ? iso : undefined;
}
export type ParsedTransaction = {
  id: string;
  posted?: string;
  transactedAt?: string;
  amountCents: number;
  description: string;
  payee: string;
  memo: string;
  pending: boolean;
  mcc: string;
  category?: string;
};
export type ParsedAccount = {
  id: string;
  name: string;
  institution: string;
  institutionDomain: string;
  currency: string;
  balanceCents: number | null;
  availableCents?: number;
  balanceDate?: number;
  holdings: number;
  holdingPositions?: SimplefinHolding[] | null;
  holdingsWarning?: string;
  transactions: ParsedTransaction[];
};
export const simplefinHolding = v.object({
  id: v.string(),
  name: v.string(),
  symbol: v.union(v.string(), v.null()),
  quantity: v.number(),
  valueCents: v.number(),
  price: v.union(v.number(), v.null()),
  currency: v.string(),
});
type SimplefinHolding = Infer<typeof simplefinHolding>;
/** Bridge's positions extension is not part of the base protocol. Never use purchase_price as a quote
 * or assume an undocumented cost_basis is total rather than per-share basis. */
export function parseSimplefinHoldings(
  value: unknown,
): SimplefinHolding[] | null {
  if (value === undefined || value === null) return null;
  const seen = new Set<string>();
  return rows(value, 1000).map((row) => {
    const id = string(row.id, 200),
      name = string(row.description, 240) || string(row.symbol, 40);
    const rawQuantity = String(row.shares ?? "");
    const quantity = /^[+-]?\d+(?:\.\d+)?$/.test(rawQuantity)
      ? Number(rawQuantity)
      : NaN;
    const valueCents = decimalCents(row.market_value);
    const currency = string(row.currency, 20);
    if (
      !id ||
      seen.has(id) ||
      !name ||
      !currency ||
      !Number.isFinite(quantity) ||
      Math.abs(quantity) > 1e15
    )
      throw new SimplefinFailure("INVALID_RESPONSE");
    seen.add(id);
    const price = quantity !== 0 ? valueCents / 100 / quantity : null;
    if (price !== null && (!Number.isFinite(price) || price < 0))
      throw new SimplefinFailure("INVALID_RESPONSE");
    return {
      id,
      name,
      symbol: string(row.symbol, 40) || null,
      quantity,
      valueCents,
      price,
      currency,
    };
  });
}
export type AccountSet = { errors: string[]; accounts: ParsedAccount[] };
/** Validates the documented account-set shape; nothing else is trusted. */
export function parseAccountSet(value: unknown): AccountSet {
  const set = object(value);
  const errorList = set.errors ?? set.errlist;
  const errors = rows(
    Array.isArray(errorList) ? errorList.map((row) => ({ message: row })) : [],
    50,
  ).map((row) =>
    typeof row.message === "string"
      ? row.message.slice(0, 300)
      : string(object(row.message).message, 300),
  );
  const accounts: ParsedAccount[] = [];
  const seen = new Set<string>();
  for (const row of rows(set.accounts, 200)) {
    let holdingPositions: SimplefinHolding[] | null = null;
    let holdingsWarning = "";
    try {
      holdingPositions = parseSimplefinHoldings(row.holdings);
    } catch {
      holdingsWarning =
        "Investment positions could not be read completely. Previous holdings are kept; reconnect or try another sync.";
    }
    const id = string(row.id, 200);
    if (!id || seen.has(id)) throw new SimplefinFailure("INVALID_RESPONSE");
    seen.add(id);
    const org = row.org ? object(row.org) : {};
    let balanceCents: number | null = null;
    try {
      balanceCents = decimalCents(row.balance);
    } catch {
      /* Preview shows an unavailable balance instead of inventing zero. */
    }
    const available = row["available-balance"];
    const transactions: ParsedTransaction[] = [];
    const ids = new Set<string>();
    for (const tx of rows(row.transactions, 20000)) {
      const txId = string(tx.id, 200);
      if (!txId || ids.has(txId))
        throw new SimplefinFailure("INVALID_RESPONSE");
      ids.add(txId);
      let amountCents: number;
      try {
        amountCents = decimalCents(tx.amount);
      } catch {
        continue;
      }
      // Extra data is provider-specific and optional; malformed hints must not
      // prevent otherwise valid transactions from importing.
      const extra =
        tx.extra && typeof tx.extra === "object" && !Array.isArray(tx.extra)
          ? (tx.extra as ProviderObject)
          : {};
      transactions.push({
        id: txId,
        posted: unixDate(tx.posted),
        transactedAt: unixDate(tx.transacted_at),
        amountCents,
        description: string(tx.description, 300),
        payee: string(tx.payee, 120),
        memo: string(tx.memo, 300),
        pending: tx.pending === true,
        mcc: parseMcc(tx.mcc) || parseMcc(extra.mcc),
        category: string(tx.category) || string(extra.category),
      });
    }
    accounts.push({
      id,
      name: string(row.name) || "Bank account",
      institution:
        string(org.name, 80) || string(org.domain, 80) || "SimpleFIN",
      institutionDomain: string(org.domain, 120),
      currency: string(row.currency, 40),
      balanceCents,
      ...(available !== undefined && available !== null
        ? (() => {
            try {
              return { availableCents: decimalCents(available) };
            } catch {
              return {};
            }
          })()
        : {}),
      ...(typeof row["balance-date"] === "number"
        ? { balanceDate: row["balance-date"] * 1000 }
        : {}),
      holdings: Array.isArray(row.holdings) ? row.holdings.length : 0,
      holdingPositions,
      holdingsWarning,
      transactions,
    });
  }
  return { errors, accounts };
}
/**
 * Card product names that do not say "card": issuers name cards after rewards
 * ("Blue Cash Everyday", "Double Cash", "Aeroplan"), so these must be checked
 * before the generic deposit words, or a cash-back card reads as a cash account.
 */
const CARD_PRODUCTS =
  /\b(blue cash|double cash|custom cash|active cash|cash rewards|cash back|cashback|cash wise|cash magnet|quicksilver|savor|venture|sapphire|freedom|slate|ink|aeroplan|prime visa|amazon prime|bonvoy|hilton honors|skymiles|aadvantage|mileageplus|rapid rewards|world of hyatt|ihg|platinum card|gold card|green card|apple card|discover it|simplicity|diamond preferred|strata|prestige|costco anywhere|bilt|autograph|marriott|united explorer|southwest)\b/;
/** Generic card words; "credit union" is a bank, not a card. */
const CARD_WORDS = /\b(card|visa|mastercard|amex|credit(?! union))\b/;
/** Deposit words are the strongest signal: "Platinum Savings" and "Freedom Checking" are not cards. */
const DEPOSIT_WORDS =
  /\b(checking|savings|saving|money market|deposit|certificate|cd)\b/;
const LOAN_WORDS = /\b(mortgage|loan|heloc|line of credit)\b/;
const INVESTMENT_WORDS =
  /\b(ira|401\(?k\)?|403b|roth|brokerage|invest|investment|investments|retirement|hsa|stocks?|mutual funds?|securities)\b/;
/** Institutions that mainly issue cards; their deposit products say so in the name. */
const CARD_ISSUERS =
  /american express|amex|discover|synchrony|barclays|comenity/;
/**
 * SimpleFIN reports no account type, so the name, the institution, and the
 * sign of the balance have to reveal it. Balances are signed from the owner's
 * view, so a negative balance with no deposit words is almost always a card.
 */
export function guessKind(
  account: Pick<ParsedAccount, "name" | "holdings"> &
    Partial<Pick<ParsedAccount, "institution" | "balanceCents">>,
): Infer<typeof accountKind> {
  const key = account.name.toLowerCase();
  const institution = (account.institution ?? "").toLowerCase();
  if (LOAN_WORDS.test(key)) return "loan";
  if (DEPOSIT_WORDS.test(key)) return "cash";
  if (CARD_PRODUCTS.test(key) || CARD_WORDS.test(key)) return "credit";
  if (/\bcash\b/.test(key)) return "cash";
  if (account.holdings > 0 || INVESTMENT_WORDS.test(key)) return "investment";
  if (CARD_ISSUERS.test(institution)) return "credit";
  if (typeof account.balanceCents === "number" && account.balanceCents < 0)
    return "credit";
  return "cash";
}
/**
 * Merchant category codes (ISO 18245) the bridge passes through. Only broad,
 * unambiguous groups map to a default category name; user rules still win.
 */
function parseMcc(value: unknown): string {
  const code =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  return /^\d{4}$/.test(code) ? code : "";
}
export function mccCategory(mcc: string): string {
  const code = Number(mcc);
  if (!Number.isInteger(code)) return "";
  if (code === 5411 || code === 5422 || code === 5499) return "Groceries";
  if (code === 5812 || code === 5813 || code === 5814) return "Restaurants";
  if (code === 5541 || code === 5542 || code === 5983) return "Fuel";
  if (code === 4121 || code === 4111 || code === 4131) return "Transport";
  if (code >= 3000 && code <= 3299) return "Travel";
  if ((code >= 3501 && code <= 3999) || code === 7011) return "Travel";
  if (code === 4900) return "Utilities";
  if (code === 4814 || code === 4816 || code === 4899) return "Internet";
  if (code === 5912 || code === 8011 || code === 8021 || code === 8062)
    return "Health";
  if (code === 7832 || code === 7922 || code === 7941 || code === 7996)
    return "Entertainment";
  if (code === 5311 || code === 5310 || code === 5331 || code === 5399)
    return "Shopping";
  return "";
}
export function previewSimplefinAccount(account: ParsedAccount) {
  const currency = account.currency.toUpperCase();
  const unsupportedReason =
    currency !== "USD"
      ? "Marten currently supports USD accounts."
      : account.balanceCents === null
        ? "SimpleFIN has not supplied a current balance."
        : undefined;
  return {
    externalId: account.id,
    name: account.name,
    institution: account.institution,
    mask: (account.name.match(/(\d{4})\D*$/)?.[1] ?? "").slice(-4),
    kind: guessKind(account),
    balanceCents: account.balanceCents,
    currency: account.currency,
    lastUpdated: account.balanceDate ?? null,
    holdings: account.holdings,
    ...(unsupportedReason ? { unsupportedReason } : {}),
  };
}
/**
 * SimpleFIN balances are signed from the owner's perspective (debt is negative).
 * Marten keeps credit and loan balances as the amount owed, so they are inverted.
 */
export function normalizeSimplefinAccount(
  account: ParsedAccount,
  selection: SimplefinSelection,
): SimplefinAccount {
  const preview = previewSimplefinAccount(account);
  if (preview.unsupportedReason || account.balanceCents === null)
    throw new ConvexError(
      preview.unsupportedReason ?? "This SimpleFIN account is unavailable.",
    );
  const debt = selection.kind === "credit" || selection.kind === "loan";
  return {
    externalId: account.id,
    name: account.name,
    institution: account.institution,
    mask: preview.mask,
    kind: selection.kind,
    subtype:
      selection.kind === "cash"
        ? "checking"
        : selection.kind === "credit"
          ? "credit card"
          : selection.kind === "investment"
            ? "brokerage"
            : selection.kind === "loan"
              ? "loan"
              : "other",
    balanceCents: debt ? -account.balanceCents : account.balanceCents,
    currency: "USD",
    ...(account.availableCents !== undefined
      ? { availableCents: account.availableCents }
      : {}),
    ...(account.balanceDate !== undefined
      ? { lastUpdated: account.balanceDate }
      : {}),
  };
}
/** Positive SimpleFIN amounts are deposits; Marten stores outflows as positive. */
export function normalizeSimplefinTransactions(
  account: ParsedAccount,
  fromDate: string,
  toDate: string,
) {
  const transactions: SimplefinTransaction[] = [];
  let skippedPending = 0,
    skippedUnsupported = 0;
  for (const row of account.transactions) {
    if (row.pending) {
      skippedPending++;
      continue;
    }
    const date = row.transactedAt ?? row.posted;
    if (!date) {
      skippedUnsupported++;
      continue;
    }
    if (date < fromDate || date > toDate) continue;
    const name = row.description || row.payee || row.memo || "Bank transaction";
    transactions.push({
      externalId: row.id,
      externalAccountId: account.id,
      date,
      amountCents: -row.amountCents,
      name,
      merchant: merchantDisplayName(row.payee || name),
      category: mccCategory(row.mcc) || row.category || "",
    });
  }
  return { transactions, skippedPending, skippedUnsupported };
}
/** Splits a date range into bridge-sized windows, oldest first. */
export function importWindows(fromDate: string, toDate: string) {
  const windows: { from: string; to: string }[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    const end = new Date(`${cursor}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + WINDOW_DAYS - 1);
    const to =
      end.toISOString().slice(0, 10) < toDate
        ? end.toISOString().slice(0, 10)
        : toDate;
    windows.push({ from: cursor, to });
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return windows;
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
