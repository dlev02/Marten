import { env } from "../_generated/server";
import { ConvexError, v, type Infer } from "convex/values";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";

export const environment = v.union(
  v.literal("sandbox"),
  v.literal("production"),
);
export type Environment = Infer<typeof environment>;
export const linkMode = v.union(
  v.literal("transactions"),
  v.literal("investments"),
);
export function configuration() {
  const selected = env.PLAID_ENV;
  const configured =
    !!env.PLAID_CLIENT_ID &&
    !!env.PLAID_SECRET &&
    (selected === "sandbox" || selected === "production");
  return {
    configured,
    environment:
      selected === "sandbox" || selected === "production" ? selected : null,
  } as const;
}
export class PlaidFailure extends Error {
  constructor(readonly code: string) {
    super(safeError(code));
  }
}
export function safeError(code: string): string {
  switch (code) {
    case "ITEM_LOGIN_REQUIRED":
    case "INVALID_ACCESS_TOKEN":
    case "ITEM_NOT_FOUND":
    case "PENDING_DISCONNECT":
    case "PENDING_EXPIRATION":
      return "Reconnect this bank to restore access.";
    case "USER_SETUP_REQUIRED":
      return "Sign in at your bank and complete its required account update, then reconnect here.";
    case "PRODUCTS_NOT_SUPPORTED":
    case "PRODUCT_NOT_SUPPORTED":
    case "ADDITIONAL_CONSENT_REQUIRED":
      return "This bank needs additional permission or does not support this data. Reconnect to review permissions.";
    case "PRODUCT_NOT_READY":
      return "Your bank is preparing data. Marten will try again automatically.";
    case "INSTITUTION_DOWN":
    case "INSTITUTION_NOT_RESPONDING":
    case "INSTITUTION_NOT_AVAILABLE":
      return "Your bank is temporarily unavailable. Marten will try again automatically.";
    case "INVALID_API_KEYS":
    case "INVALID_CLIENT_ID":
    case "UNAUTHORIZED":
      return "Bank connections need an administrator to finish Plaid setup.";
    case "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION":
      return "Bank data changed during sync. Marten will retry automatically.";
    case "RATE_LIMIT_EXCEEDED":
      return "Plaid is temporarily limiting requests. Marten will retry automatically.";
    case "UNSUPPORTED_CURRENCY":
      return "This connection includes unsupported currency or unavailable balances. Marten currently supports USD only; no currency conversion was applied.";
    default:
      return "Bank sync could not finish. Try again later, or reconnect if the problem continues.";
  }
}
export async function plaidRequest<T>(
  path: string,
  body: Record<string, unknown>,
  expectedEnvironment?: Environment,
): Promise<T> {
  const config = configuration();
  if (!config.configured || !config.environment)
    throw new ConvexError("Bank connections are not configured yet.");
  if (expectedEnvironment && config.environment !== expectedEnvironment)
    throw new ConvexError(
      "This connection belongs to a different Plaid environment. Switch the server configuration or disconnect it.",
    );
  let response: Response;
  try {
    response = await fetch(`https://${config.environment}.plaid.com${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Plaid-Version": "2020-09-14",
      },
      body: JSON.stringify({
        client_id: env.PLAID_CLIENT_ID,
        secret: env.PLAID_SECRET,
        ...body,
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new PlaidFailure("NETWORK_ERROR");
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    const code =
      data &&
      typeof data === "object" &&
      "error_code" in data &&
      typeof data.error_code === "string"
        ? data.error_code
        : "UNKNOWN";
    throw new PlaidFailure(code);
  }
  return data as T;
}
export async function publicRequest<T>(
  path: string,
  body: Record<string, unknown>,
  expectedEnvironment?: Environment,
): Promise<T> {
  try {
    return await plaidRequest<T>(path, body, expectedEnvironment);
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw new ConvexError(
      error instanceof PlaidFailure ? error.message : safeError("UNKNOWN"),
    );
  }
}
export type PlaidItem = {
  item_id: string;
  institution_id: string | null;
  institution_name?: string;
  products: string[];
  available_products: string[];
  consented_products?: string[];
  error?: { error_code: string } | null;
};
export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: {
    current: number | null;
    available: number | null;
    limit: number | null;
    iso_currency_code: string | null;
    unofficial_currency_code?: string | null;
  };
};
export type PlaidTransaction = {
  transaction_id: string;
  pending_transaction_id: string | null;
  account_id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  logo_url?: string | null;
  pending: boolean;
  iso_currency_code: string | null;
  personal_finance_category?: { primary: string; detailed: string } | null;
};
export type SyncPage = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
};
export const bankTransaction = v.object({
  transactionId: v.string(),
  pendingTransactionId: v.optional(v.string()),
  accountId: v.string(),
  date: v.string(),
  amountCents: v.number(),
  name: v.string(),
  merchant: v.string(),
  logoUrl: v.optional(v.string()),
  pending: v.boolean(),
  category: v.string(),
});
export type BankTransaction = Infer<typeof bankTransaction>;
export const bankAccount = v.object({
  accountId: v.string(),
  name: v.string(),
  mask: v.string(),
  kind: v.union(
    v.literal("cash"),
    v.literal("credit"),
    v.literal("investment"),
    v.literal("loan"),
    v.literal("asset"),
  ),
  subtype: v.string(),
  balanceCents: v.number(),
  currency: v.string(),
  availableCents: v.optional(v.number()),
  limitCents: v.optional(v.number()),
  statementCents: v.optional(v.number()),
  minimumCents: v.optional(v.number()),
  dueDate: v.optional(v.string()),
  statementDate: v.optional(v.string()),
});
export type BankAccount = Infer<typeof bankAccount>;
export function bankCents(value: number): number {
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 1e13)
    throw new PlaidFailure("INVALID_AMOUNT");
  return result;
}
export function safeLogo(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function normalizeAccount(a: PlaidAccount): BankAccount {
  if (a.balances.iso_currency_code !== "USD" || a.balances.current === null)
    throw new PlaidFailure("UNSUPPORTED_CURRENCY");
  return {
    accountId: a.account_id,
    name: (a.name || a.official_name || "Bank account").slice(0, 120),
    mask: a.mask ?? "",
    kind:
      a.type === "depository"
        ? "cash"
        : a.type === "credit"
          ? "credit"
          : a.type === "investment"
            ? "investment"
            : a.type === "loan"
              ? "loan"
              : "asset",
    subtype: a.subtype ?? a.type,
    balanceCents: bankCents(a.balances.current),
    currency: "USD",
    ...(a.balances.available !== null
      ? { availableCents: bankCents(a.balances.available) }
      : {}),
    ...(a.balances.limit !== null
      ? { limitCents: bankCents(a.balances.limit) }
      : {}),
  };
}
export function normalizeTransaction(t: PlaidTransaction): BankTransaction {
  if (t.iso_currency_code !== "USD")
    throw new PlaidFailure("UNSUPPORTED_CURRENCY");
  return {
    transactionId: t.transaction_id,
    ...(t.pending_transaction_id
      ? { pendingTransactionId: t.pending_transaction_id }
      : {}),
    accountId: t.account_id,
    date: t.date,
    amountCents: bankCents(t.amount),
    name: t.name.slice(0, 500),
    merchant: (t.merchant_name || t.name || "Unknown merchant").slice(0, 120),
    ...(safeLogo(t.logo_url) ? { logoUrl: safeLogo(t.logo_url) } : {}),
    pending: t.pending,
    category:
      t.personal_finance_category?.detailed ??
      t.personal_finance_category?.primary ??
      "",
  };
}

// A refund in an expense category reduces spending; a negative amount alone is
// not evidence of income. Use Plaid's category intent when it is available.
export function defaultBankCategory(
  category: string,
  amount: number,
): { name: string; kind: "income" | "expense" | "transfer" } {
  if (category.startsWith("TRANSFER") || category.startsWith("LOAN_PAYMENTS"))
    return {
      name: category.includes("CREDIT_CARD")
        ? "Credit card payment"
        : "Transfer",
      kind: "transfer",
    };
  if (category.startsWith("INCOME") || (!category && amount < 0))
    return {
      name: category.includes("WAGES")
        ? "Paycheck"
        : category.includes("INTEREST")
          ? "Interest"
          : "Other income",
      kind: "income",
    };
  const detailed: Record<string, string> = {
    FOOD_AND_DRINK_GROCERIES: "Groceries",
    FOOD_AND_DRINK_COFFEE: "Coffee",
    RENT_AND_UTILITIES_RENT: "Rent",
    RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet",
  };
  const broad: Record<string, string> = {
    FOOD_AND_DRINK: "Restaurants",
    GENERAL_MERCHANDISE: "Shopping",
    TRANSPORTATION: "Transport",
    TRAVEL: "Travel",
    MEDICAL: "Health",
    ENTERTAINMENT: "Entertainment",
    RENT_AND_UTILITIES: "Utilities",
  };
  return {
    name:
      detailed[category] ??
      Object.entries(broad).find(([prefix]) =>
        category.startsWith(prefix),
      )?.[1] ??
      "Uncategorized",
    kind: "expense",
  };
}

// Verify the signature and hash of the *original bytes*, before parsing the JSON.
export async function verifyWebhook(
  jwt: string,
  body: string,
): Promise<boolean> {
  try {
    const header = decodeProtectedHeader(jwt);
    if (
      header.alg !== "ES256" ||
      typeof header.kid !== "string" ||
      header.kid.length > 200
    )
      return false;
    const { key } = await plaidRequest<{
      key: JWK & { expired_at: number | null };
    }>("/webhook_verification_key/get", { key_id: header.kid });
    if (
      key.alg !== "ES256" ||
      key.kid !== header.kid ||
      key.expired_at !== null
    )
      return false;
    const verified = await jwtVerify(jwt, await importJWK(key, "ES256"), {
      algorithms: ["ES256"],
      maxTokenAge: "5 minutes",
      clockTolerance: 0,
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof verified.payload.iat !== "number" ||
      verified.payload.iat > now ||
      now - verified.payload.iat > 300
    )
      return false;
    const expected = verified.payload.request_body_sha256;
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))
      return false;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body),
    );
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    let difference = 0;
    for (let i = 0; i < 64; i++)
      difference |= hash.charCodeAt(i) ^ expected.charCodeAt(i);
    return difference === 0;
  } catch {
    return false;
  }
}
