export type PositionValue = {
  valueCents: number;
  basisCents: number | null;
  currency: string;
};

export function investmentMetrics(positions: PositionValue[]) {
  const usd = positions.filter((position) => position.currency === "USD");
  const known = usd.filter((position) => position.basisCents !== null);
  const value = usd.reduce((sum, position) => sum + position.valueCents, 0);
  const grossValue = usd.reduce(
    (sum, position) => sum + Math.abs(position.valueCents),
    0,
  );
  const coveredValue = known.reduce(
    (sum, position) => sum + Math.abs(position.valueCents),
    0,
  );
  const basis = known.reduce((sum, position) => sum + position.basisCents!, 0);
  const gain = known.length
    ? known.reduce(
        (sum, position) => sum + position.valueCents - position.basisCents!,
        0,
      )
    : null;
  const gainPercent =
    gain !== null &&
    basis > 0 &&
    known.every(
      (position) => position.basisCents! >= 0 && position.valueCents >= 0,
    )
      ? (gain / basis) * 100
      : null;
  return {
    value,
    basis,
    gain,
    gainPercent,
    knownCount: known.length,
    totalCount: usd.length,
    coverage: grossValue > 0 ? (coveredValue / grossValue) * 100 : null,
    unsupportedCount: positions.length - usd.length,
  };
}

export function investmentRange(period: string, today: string) {
  if (period === "ALL") return "2000-01-01";
  if (period === "YTD") return today.slice(0, 4) + "-01-01";
  const date = new Date(today + "T12:00:00Z");
  const months =
    period === "1M" ? 1 : period === "3M" ? 3 : period === "1Y" ? 12 : 6;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function securityType(value: string | undefined, cash = false) {
  if (cash) return "Cash equivalents";
  if (!value || value.toLowerCase() === "unknown") return "Unclassified";
  if (value.toLowerCase() === "etf") return "ETFs";
  return value
    .split(/[ _]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function units(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function unitPrice(value: number, currency: string) {
  if (/^[A-Z]{3}$/.test(currency))
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  return `${units(value)} ${currency}`;
}
