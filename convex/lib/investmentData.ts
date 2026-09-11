import { ConvexError, v, type Infer } from "convex/values";
import { bankCents } from "./plaidApi";

const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());
export const securityFields = {
  providerSecurityId: v.string(),
  name: v.string(),
  ticker: nullableString,
  type: v.string(),
  currency: v.string(),
  isCashEquivalent: v.boolean(),
  closePrice: nullableNumber,
  closePriceDate: nullableString,
  cusip: nullableString,
  isin: nullableString,
};
export const positionFields = {
  quantity: v.number(),
  valueCents: v.number(),
  basisCents: nullableNumber,
  price: nullableNumber,
  currency: v.string(),
  priceDate: nullableString,
};
export const investmentEventFields = {
  providerTransactionId: v.string(),
  date: v.string(),
  name: v.string(),
  type: v.string(),
  subtype: v.string(),
  amountCents: v.number(),
  feesCents: nullableNumber,
  quantity: nullableNumber,
  price: nullableNumber,
  currency: v.string(),
  cancelTransactionId: nullableString,
};
export const normalizedSecurity = v.object(securityFields);
export const normalizedPosition = v.object({
  ...positionFields,
  providerAccountId: v.string(),
  providerSecurityId: v.string(),
});
export const normalizedInvestmentEvent = v.object({
  ...investmentEventFields,
  providerAccountId: v.string(),
  providerSecurityId: nullableString,
});
export type SecurityData = Infer<typeof normalizedSecurity>;
export type PositionData = Infer<typeof normalizedPosition>;
export type InvestmentEventData = Infer<typeof normalizedInvestmentEvent>;

export const investmentLimits = {
  holdings: 1000,
  securities: 2000,
  events: 5000,
} as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ConvexError("The bank returned incomplete investment data.");
  return value as Record<string, unknown>;
}
function optionalText(value: unknown, max = 240) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}
function identifier(value: unknown) {
  const result = optionalText(value);
  if (!result || result !== value)
    throw new ConvexError(
      "The bank returned an invalid investment identifier.",
    );
  return result;
}
function numeric(value: unknown, nullable = false): number | null {
  if (value == null && nullable) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new ConvexError("The bank returned an invalid investment amount.");
  return value;
}
function amount(value: unknown, nullable = false) {
  const result = numeric(value, nullable);
  return result === null ? null : bankCents(result);
}
function currency(row: Record<string, unknown>) {
  return (
    optionalText(row.iso_currency_code, 20) ??
    optionalText(row.unofficial_currency_code, 20) ??
    "Unknown"
  );
}
function calendarDate(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new ConvexError("The bank returned an invalid investment date.");
  return value;
}
function optionalDate(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new ConvexError("The bank returned an invalid valuation date.");
  return value;
}
export function normalizeSecurity(value: unknown): SecurityData {
  const row = record(value);
  return {
    providerSecurityId: identifier(row.security_id),
    name: optionalText(row.name) ?? "Unnamed security",
    ticker: optionalText(row.ticker_symbol, 40),
    type: optionalText(row.type, 80) ?? "Unknown",
    currency: currency(row),
    isCashEquivalent: row.is_cash_equivalent === true,
    closePrice: numeric(row.close_price, true),
    closePriceDate: optionalDate(row.close_price_as_of),
    cusip: optionalText(row.cusip, 40),
    isin: optionalText(row.isin, 40),
  };
}
export function normalizePosition(value: unknown): PositionData {
  const row = record(value);
  return {
    providerAccountId: identifier(row.account_id),
    providerSecurityId: identifier(row.security_id),
    quantity: numeric(row.quantity)!,
    valueCents: amount(row.institution_value)!,
    basisCents: amount(row.cost_basis, true),
    price: numeric(row.institution_price, true),
    currency: currency(row),
    priceDate: optionalDate(
      row.institution_price_datetime ?? row.institution_price_as_of,
    ),
  };
}
export function normalizeInvestmentEvent(value: unknown): InvestmentEventData {
  const row = record(value);
  return {
    providerTransactionId: identifier(row.investment_transaction_id),
    providerAccountId: identifier(row.account_id),
    providerSecurityId:
      row.security_id == null ? null : identifier(row.security_id),
    date: calendarDate(row.date),
    name: optionalText(row.name) ?? "Investment activity",
    type: optionalText(row.type, 80) ?? "Unknown",
    subtype: optionalText(row.subtype, 80) ?? "Unknown",
    amountCents: amount(row.amount)!,
    feesCents: amount(row.fees, true),
    quantity: numeric(row.quantity, true),
    price: numeric(row.price, true),
    currency: currency(row),
    cancelTransactionId:
      row.cancel_transaction_id == null
        ? null
        : identifier(row.cancel_transaction_id),
  };
}

export function responseArray(response: unknown, field: string) {
  const value = record(response)[field];
  if (!Array.isArray(value))
    throw new ConvexError("The bank returned incomplete investment data.");
  return value as unknown[];
}
export function responseTotal(response: unknown) {
  const total = record(response).total_investment_transactions;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0)
    throw new ConvexError("The bank returned an invalid investment total.");
  return total;
}
