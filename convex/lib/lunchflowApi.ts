import { ConvexError } from "convex/values";
import { date } from "./access";
import {
  decimalCents,
  type ParsedAccount,
  type ParsedTransaction,
} from "./simplefinApi";

// Personal API: https://www.lunchflow.app/docs/api/personal-api-overview
// Only this origin receives user keys. Redirects and custom origins are forbidden.
const BASE = "https://lunchflow.app/api/v1";
export const LUNCHFLOW_NOTICE =
  "Lunch Flow supplies balances, posted transactions and available investment positions. Marten checks daily; bank refresh times and history vary. Statement amounts, due dates and transaction categories are not supplied by this API.";
export class LunchflowFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function lunchflowError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data
      .replace(/SimpleFIN Bridge/g, "Lunch Flow")
      .replace(/SimpleFIN/g, "Lunch Flow");
  const code =
    error instanceof LunchflowFailure ? error.code : "REQUEST_FAILED";
  const messages: Record<string, string> = {
    KEY: "Paste the API key from Lunch Flow → Destinations → API.",
    AUTH: "Lunch Flow rejected this API key. Check the API destination and account access settings, or create a new key.",
    RATE_LIMIT:
      "Lunch Flow is limiting requests. Wait a few minutes and try again.",
    INCOMPLETE:
      "Lunch Flow returned incomplete or too much data. Choose fewer accounts or a shorter date range and try again.",
    INVALID:
      "Lunch Flow returned data Marten could not validate. Check the connection in Lunch Flow and try again. Your saved history stays.",
    REQUEST_FAILED:
      "The Lunch Flow request could not finish. Check your connections and subscription in Lunch Flow, then retry. Your saved history stays.",
  };
  return messages[code] ?? messages.REQUEST_FAILED;
}
export function lunchflowKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 4096 || !/^[\x21-\x7e]+$/.test(key))
    throw new LunchflowFailure("KEY");
  return key;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LunchflowFailure("INVALID");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (typeof value === "string" && value.length > 0 && value.length <= 200)
    return value;
  throw new LunchflowFailure("INVALID");
}
function list(body: Record<string, unknown>, field: string, limit: number) {
  const rows = body[field];
  if (!Array.isArray(rows)) throw new LunchflowFailure("INVALID");
  if (
    rows.length > limit ||
    (body.total !== undefined && body.total !== rows.length)
  )
    throw new LunchflowFailure("INCOMPLETE");
  return rows.map(object);
}
function cents(value: unknown) {
  try {
    return decimalCents(value);
  } catch {
    throw new LunchflowFailure("INVALID");
  }
}
function safeLogo(value: unknown): string | undefined {
  try {
    const url = new URL(text(value, 2000));
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
  } catch {
    /* An absent or malformed logo never prevents importing an account. */
  }
  return undefined;
}
async function request(
  key: string,
  path: string,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": key, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 401 || response.status === 403)
      throw new LunchflowFailure("AUTH");
    if (response.status === 429) throw new LunchflowFailure("RATE_LIMIT");
    if (!response.ok) throw new LunchflowFailure(`HTTP_${response.status}`);
    if (Number(response.headers.get("content-length")) > 10_000_000)
      throw new LunchflowFailure("INCOMPLETE");
    const reader = response.body?.getReader();
    if (!reader) throw new LunchflowFailure("INVALID");
    const decoder = new TextDecoder();
    let size = 0,
      body = "";
    try {
      let reading = true;
      while (reading) {
        const chunk = await reader.read();
        reading = !chunk.done;
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 10_000_000) {
          await reader.cancel();
          throw new LunchflowFailure("INCOMPLETE");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
    return object(JSON.parse(body + decoder.decode()));
  } catch (error) {
    if (error instanceof LunchflowFailure) throw error;
    throw new LunchflowFailure("REQUEST_FAILED");
  }
}
export function parseLunchflowAccounts(value: unknown): ParsedAccount[] {
  const seen = new Set<string>();
  return list(object(value), "accounts", 100).map((row) => {
    const accountId = `lunchflow:${id(row.id)}`;
    if (seen.has(accountId)) throw new LunchflowFailure("INVALID");
    seen.add(accountId);
    const currency = text(row.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || !text(row.name))
      throw new LunchflowFailure("INVALID");
    return {
      id: accountId,
      name: text(row.name, 120),
      institution: text(row.institution_name, 120) || "Lunch Flow",
      institutionDomain: "",
      currency,
      balanceCents: null,
      holdings: 0,
      transactions: [],
      logoUrl: safeLogo(row.institution_logo),
      connectionProvider: text(row.provider, 40) || undefined,
    };
  });
}
export function parseLunchflowBalance(
  value: unknown,
  currency: string,
): number {
  const row = object(object(value).balance);
  if (text(row.currency).toUpperCase() !== currency)
    throw new LunchflowFailure("INVALID");
  return cents(row.amount);
}
export function parseLunchflowTransactions(
  value: unknown,
  account: ParsedAccount,
): ParsedTransaction[] {
  const seen = new Set<string>();
  return list(object(value), "transactions", 20000).map((row) => {
    const transactionId = `lunchflow:${id(row.id)}`;
    if (
      seen.has(transactionId) ||
      `lunchflow:${id(row.accountId)}` !== account.id ||
      text(row.currency).toUpperCase() !== account.currency
    )
      throw new LunchflowFailure("INVALID");
    seen.add(transactionId);
    const posted = text(row.date);
    try {
      date(posted);
    } catch {
      throw new LunchflowFailure("INVALID");
    }
    if (row.isPending !== undefined && typeof row.isPending !== "boolean")
      throw new LunchflowFailure("INVALID");
    return {
      id: transactionId,
      posted,
      amountCents: cents(row.amount),
      description: text(row.description),
      payee: text(row.merchant),
      memo: "",
      pending: row.isPending === true,
      mcc: "",
    };
  });
}
export function parseLunchflowHoldings(
  value: unknown,
  currency: string,
): NonNullable<ParsedAccount["holdingPositions"]> {
  const body = object(value);
  if (text(body.currency).toUpperCase() !== currency)
    throw new LunchflowFailure("INVALID");
  const seen = new Set<string>();
  return list(body, "holdings", 1000).map((row) => {
    const security = object(row.security);
    const key =
      text(security.figi) ||
      text(security.isin) ||
      text(security.cusp) ||
      text(security.tickerSymbol) ||
      text(security.name);
    if (
      !key ||
      seen.has(key) ||
      text(row.currency).toUpperCase() !== currency ||
      (security.currency &&
        text(security.currency).toUpperCase() !== currency) ||
      typeof row.quantity !== "number" ||
      !Number.isFinite(row.quantity)
    )
      throw new LunchflowFailure("INVALID");
    seen.add(key);
    const price = row.price == null ? null : row.price;
    if (
      price !== null &&
      (typeof price !== "number" || !Number.isFinite(price) || price < 0)
    )
      throw new LunchflowFailure("INVALID");
    return {
      id: key,
      name: text(security.name, 120) || key,
      symbol: text(security.tickerSymbol, 40) || null,
      quantity: row.quantity,
      valueCents: cents(row.value),
      price,
      currency,
    };
  });
}
export async function lunchflowAccounts(
  key: string,
  options?: {
    accountIds: string[];
    fromDate: string;
    toDate: string;
    investmentIds: string[];
  },
) {
  const accounts = parseLunchflowAccounts(await request(key, "/accounts"));
  const selected = options
    ? accounts.filter((row) => options.accountIds.includes(row.id))
    : accounts;
  for (const account of selected) {
    if (account.currency !== "USD") continue;
    const path = `/accounts/${encodeURIComponent(account.id.slice("lunchflow:".length))}`;
    account.balanceCents = parseLunchflowBalance(
      await request(key, `${path}/balance`),
      account.currency,
    );
    if (options) {
      account.transactions = parseLunchflowTransactions(
        await request(
          key,
          `${path}/transactions?include_pending=false&from=${options.fromDate}&to=${options.toDate}`,
        ),
        account,
      );
      if (options.investmentIds.includes(account.id)) {
        try {
          account.holdingPositions = parseLunchflowHoldings(
            await request(key, `${path}/holdings`),
            account.currency,
          );
          account.holdings = account.holdingPositions.length;
        } catch (error) {
          account.holdingsWarning =
            error instanceof LunchflowFailure && error.code === "HTTP_501"
              ? "Lunch Flow does not provide positions for this account. Saved holdings are kept."
              : "Lunch Flow positions could not be refreshed. Saved holdings are kept; try importing again.";
        }
      }
    }
  }
  return { accounts: selected, errors: [] as string[] };
}
