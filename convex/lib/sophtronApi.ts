import { ConvexError, v, type Infer } from "convex/values";
import { accountKind } from "../validators";

export const sophtronEnvironment = v.union(
  v.literal("production"),
  v.literal("preview"),
);
export const debtSign = v.union(v.literal("positive"), v.literal("negative"));
export const sophtronSelection = v.object({
  externalAccountId: v.string(),
  targetAccountId: v.optional(v.id("accounts")),
  confirmUsd: v.optional(v.boolean()),
  debtSign: v.optional(debtSign),
});
export const sophtronAccount = v.object({
  externalId: v.string(),
  memberId: v.string(),
  name: v.string(),
  institution: v.string(),
  mask: v.string(),
  kind: accountKind,
  subtype: v.string(),
  balanceCents: v.number(),
  currency: v.literal("USD"),
  availableCents: v.optional(v.number()),
  limitCents: v.optional(v.number()),
  dueDate: v.optional(v.string()),
  lastUpdated: v.optional(v.number()),
});
export const sophtronTransaction = v.object({
  externalId: v.string(),
  externalAccountId: v.string(),
  date: v.string(),
  amountCents: v.number(),
  name: v.string(),
  merchant: v.string(),
  category: v.string(),
});
export type SophtronAccount = Infer<typeof sophtronAccount>;
export type SophtronTransaction = Infer<typeof sophtronTransaction>;
export type SophtronSelection = Infer<typeof sophtronSelection>;
export type SophtronConfig = {
  apiUserId: string;
  accessKey: string;
  customerId: string;
  ownerUserId: string;
  environment: "production" | "preview";
};
type ConfigEnv = {
  SOPHTRON_USER_ID?: string;
  SOPHTRON_ACCESS_KEY?: string;
  SOPHTRON_CUSTOMER_ID?: string;
  SOPHTRON_OWNER_USER_ID?: string;
  SOPHTRON_ENV?: string;
};
export function sophtronConfiguration(
  values: ConfigEnv,
): SophtronConfig | null {
  const {
    SOPHTRON_USER_ID: apiUserId,
    SOPHTRON_ACCESS_KEY: accessKey,
    SOPHTRON_CUSTOMER_ID: customerId,
    SOPHTRON_OWNER_USER_ID: ownerUserId,
  } = values;
  const environment = values.SOPHTRON_ENV || "production";
  if (
    !apiUserId ||
    !accessKey ||
    !customerId ||
    !ownerUserId ||
    !isGuid(apiUserId) ||
    !isGuid(customerId) ||
    !["production", "preview"].includes(environment)
  )
    return null;
  try {
    if (atob(accessKey).length < 16) return null;
  } catch {
    return null;
  }
  return {
    apiUserId: apiUserId.toLowerCase(),
    accessKey,
    customerId: customerId.toLowerCase(),
    ownerUserId,
    environment: environment as SophtronConfig["environment"],
  };
}
export class SophtronFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function sophtronError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data;
  const code = error instanceof SophtronFailure ? error.code : "REQUEST_FAILED";
  const detail: Record<string, string> = {
    AUTH: "Sophtron rejected the server credentials. Check the API user ID and access key in deployment settings.",
    RATE_LIMIT:
      "Sophtron is limiting requests. Wait a few minutes before importing again.",
    OWNERSHIP:
      "Sophtron returned data outside the configured customer. Check the server's customer and owner mapping before retrying.",
    RESPONSE_LIMIT:
      "Sophtron returned more data than this import can safely process. Use a smaller linked-account set or a bank CSV export.",
    INVALID_RESPONSE:
      "Sophtron returned an unexpected data format. No unvalidated records were imported; check the provider account and try again.",
    REQUEST_FAILED:
      "The Sophtron import could not finish. Check Sophtron's connection status, then retry. Existing Marten data is retained.",
  };
  return detail[code] ?? detail.REQUEST_FAILED;
}
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isGuid(value: unknown): value is string {
  return typeof value === "string" && GUID.test(value);
}
export function providerId(value: unknown): string {
  if (!isGuid(value)) throw new SophtronFailure("INVALID_RESPONSE");
  return value.toLowerCase();
}
export type ProviderObject = Record<string, unknown>;
export function providerObject(value: unknown): ProviderObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SophtronFailure("INVALID_RESPONSE");
  return value as ProviderObject;
}
export function providerRows(value: unknown, limit: number): ProviderObject[] {
  if (!Array.isArray(value)) throw new SophtronFailure("INVALID_RESPONSE");
  if (value.length > limit) throw new SophtronFailure("RESPONSE_LIMIT");
  return value.map(providerObject);
}
function string(value: unknown, limit = 120): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
export function assertProviderOwner(
  row: ProviderObject,
  config: SophtronConfig,
) {
  if (providerId(row.userID) !== config.apiUserId)
    throw new SophtronFailure("OWNERSHIP");
}
// Official Sophtron directAuth.js signs the lower-cased final path segment.
// This adapter uses query-free V2 GETs so no undocumented query canonicalization is required.
export async function sophtronAuthorization(
  path: string,
  config: SophtronConfig,
): Promise<string> {
  const authPath = path.slice(path.lastIndexOf("/")).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(config.accessKey), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`GET\n${authPath}`),
    ),
  );
  return `FIApiAUTH:${config.apiUserId}:${btoa(String.fromCharCode(...signature))}:${authPath}`;
}
export async function sophtronRequest(
  config: SophtronConfig,
  path: string,
): Promise<unknown> {
  // Paths and origins are constructed here, never supplied by the browser or a response URL.
  if (
    !/^\/api\/v2\/(?:customers\/[0-9a-f-]+(?:\/members|\/accounts(?:\/[0-9a-f-]+\/transactions)?)?)$/i.test(
      path,
    )
  )
    throw new SophtronFailure("INVALID_RESPONSE");
  const origin =
    config.environment === "production"
      ? "https://api.sophtron.com"
      : "https://api.sophtron-prod.com";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(origin + path, {
      method: "GET",
      headers: {
        Authorization: await sophtronAuthorization(path, config),
        Accept: "application/json",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new SophtronFailure("AUTH");
    if (response.status === 429) throw new SophtronFailure("RATE_LIMIT");
    if (!response.ok) throw new SophtronFailure("REQUEST_FAILED");
    const reader = response.body?.getReader();
    if (!reader) throw new SophtronFailure("INVALID_RESPONSE");
    const decoder = new TextDecoder();
    let size = 0,
      body = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5_000_000) {
        await reader.cancel();
        throw new SophtronFailure("RESPONSE_LIMIT");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new SophtronFailure("INVALID_RESPONSE");
    }
  } finally {
    clearTimeout(timeout);
  }
}
export async function sophtronLinkedAccounts(
  config: SophtronConfig,
): Promise<ProviderObject[]> {
  const base = `/api/v2/customers/${config.customerId}`;
  const customer = providerObject(await sophtronRequest(config, base));
  assertProviderOwner(customer, config);
  if (providerId(customer.customerID ?? customer.id) !== config.customerId)
    throw new SophtronFailure("OWNERSHIP");
  const members = providerRows(
    await sophtronRequest(config, `${base}/members`),
    100,
  );
  const memberIds = new Set<string>();
  for (const member of members) {
    assertProviderOwner(member, config);
    if (providerId(member.customerID) !== config.customerId)
      throw new SophtronFailure("OWNERSHIP");
    memberIds.add(providerId(member.memberID ?? member.id));
  }
  const accounts = providerRows(
    await sophtronRequest(config, `${base}/accounts`),
    100,
  );
  const accountIds = new Set<string>();
  for (const account of accounts) {
    assertProviderOwner(account, config);
    if (
      !memberIds.has(providerId(account.memberID ?? account.userInstitutionID))
    )
      throw new SophtronFailure("OWNERSHIP");
    const id = providerId(account.accountID ?? account.id);
    if (accountIds.has(id)) throw new SophtronFailure("INVALID_RESPONSE");
    accountIds.add(id);
  }
  return accounts;
}
export function sophtronCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new SophtronFailure("INVALID_RESPONSE");
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 1e13)
    throw new SophtronFailure("INVALID_RESPONSE");
  return result === 0 ? 0 : result;
}
export function sophtronDate(value: unknown): string | undefined {
  const input = string(value, 40);
  const result = input.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(input)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    return undefined;
  return result;
}
export function sophtronKind(value: unknown): Infer<typeof accountKind> | null {
  const key = string(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (
    [
      "checking",
      "savings",
      "cash",
      "deposit",
      "depository",
      "moneymarket",
      "cd",
      "certificateofdeposit",
    ].includes(key)
  )
    return "cash";
  if (["credit", "creditcard", "chargecard"].includes(key)) return "credit";
  if (
    [
      "loan",
      "mortgage",
      "studentloan",
      "autoloan",
      "personalloan",
      "lineofcredit",
      "heloc",
    ].includes(key)
  )
    return "loan";
  if (
    [
      "investment",
      "investments",
      "brokerage",
      "retirement",
      "ira",
      "rothira",
      "traditionalira",
      "401k",
      "403b",
      "457b",
      "sepira",
      "simpleira",
    ].includes(key)
  )
    return "investment";
  return null;
}
export function currencyState(
  value: unknown,
): "usd" | "confirm" | "unsupported" {
  const key = string(value).toUpperCase();
  return ["USD", "US$"].includes(key)
    ? "usd"
    : ["", "$"].includes(key)
      ? "confirm"
      : "unsupported";
}
export function previewSophtronAccount(row: ProviderObject) {
  const kind = sophtronKind(row.accountType);
  const currency = currencyState(row.balanceCurrency);
  let balanceCents: number | null = null;
  try {
    balanceCents = sophtronCents(row.balance);
  } catch {
    /* Show an unsupported balance instead of inventing zero. */
  }
  const lastUpdated =
    typeof row.lastUpdated === "string" &&
    Number.isFinite(Date.parse(row.lastUpdated))
      ? Date.parse(row.lastUpdated)
      : null;
  const unsupportedReason =
    row.status === "Untracked"
      ? "This account is not tracked in Sophtron."
      : !kind
        ? "This account type is not yet supported."
        : currency === "unsupported"
          ? "Marten currently supports USD accounts."
          : balanceCents === null
            ? "Sophtron has not supplied a current balance."
            : undefined;
  return {
    externalId: providerId(row.accountID ?? row.id),
    memberId: providerId(row.memberID ?? row.userInstitutionID),
    name: string(row.accountName) || "Sophtron account",
    institution: "Sophtron",
    mask: string(row.accountNumber).replace(/\D/g, "").slice(-4),
    kind,
    balanceCents,
    currency: string(row.balanceCurrency, 10),
    lastUpdated,
    needsUsdConfirmation: currency === "confirm",
    needsDebtSign: kind === "credit" || kind === "loan",
    ...(unsupportedReason ? { unsupportedReason } : {}),
  };
}
export function normalizeSophtronAccount(
  row: ProviderObject,
  selection: SophtronSelection,
): SophtronAccount {
  const preview = previewSophtronAccount(row);
  if (
    preview.unsupportedReason ||
    !preview.kind ||
    preview.balanceCents === null
  )
    throw new ConvexError(
      preview.unsupportedReason ?? "This Sophtron account is unavailable.",
    );
  if (preview.needsUsdConfirmation && !selection.confirmUsd)
    throw new ConvexError(
      "Confirm that this Sophtron account uses US dollars before importing it.",
    );
  if (preview.needsDebtSign && !selection.debtSign)
    throw new ConvexError(
      "Choose whether Sophtron reports amounts owed as positive or negative for this account.",
    );
  const card = row.creditCardData ? providerObject(row.creditCardData) : {};
  const available = row.availableBalance ?? card.availableCredit;
  const dueDate = sophtronDate(row.dueDate);
  return {
    externalId: preview.externalId,
    memberId: preview.memberId,
    name: preview.name,
    institution: preview.institution,
    mask: preview.mask,
    kind: preview.kind,
    subtype: string(row.subType) || string(row.accountType),
    balanceCents:
      preview.balanceCents *
      (preview.needsDebtSign && selection.debtSign === "negative" ? -1 : 1),
    currency: "USD",
    ...(available !== null && available !== undefined
      ? { availableCents: sophtronCents(available) }
      : {}),
    ...(card.totalCreditLine !== null && card.totalCreditLine !== undefined
      ? { limitCents: sophtronCents(card.totalCreditLine) }
      : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(preview.lastUpdated !== null
      ? { lastUpdated: preview.lastUpdated }
      : {}),
  };
}
export function normalizeSophtronTransactions(
  rows: ProviderObject[],
  config: SophtronConfig,
  account: SophtronAccount,
  fromDate: string,
  toDate: string,
) {
  const transactions: SophtronTransaction[] = [];
  let skippedPending = 0,
    skippedUnsupported = 0;
  const ids = new Set<string>();
  for (const row of rows) {
    assertProviderOwner(row, config);
    if (providerId(row.userInstitutionAccountID) !== account.externalId)
      throw new SophtronFailure("OWNERSHIP");
    const status = string(row.status).toLowerCase();
    if (status === "pending") {
      skippedPending++;
      continue;
    }
    const date =
      sophtronDate(row.postDate) ??
      sophtronDate(row.date) ??
      sophtronDate(row.transactionDate);
    if (date && (date < fromDate || date > toDate)) continue;
    const direction = string(row.type).toUpperCase();
    if (
      status !== "posted" ||
      !date ||
      !["DEBIT", "CREDIT"].includes(direction) ||
      currencyState(row.currency) === "unsupported"
    ) {
      skippedUnsupported++;
      continue;
    }
    let amount: number;
    try {
      amount = sophtronCents(row.amount);
    } catch {
      skippedUnsupported++;
      continue;
    }
    const externalId = providerId(row.transactionID ?? row.id);
    if (ids.has(externalId)) throw new SophtronFailure("INVALID_RESPONSE");
    ids.add(externalId);
    const name =
      string(row.description, 300) ||
      string(row.merchant, 300) ||
      "Bank transaction";
    transactions.push({
      externalId,
      externalAccountId: account.externalId,
      date,
      amountCents: Math.abs(amount) * (direction === "CREDIT" ? -1 : 1),
      name,
      merchant: string(row.merchant) || name.slice(0, 120),
      category: string(row.category),
    });
  }
  return { transactions, skippedPending, skippedUnsupported };
}
