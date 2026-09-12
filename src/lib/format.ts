export const money = (cents: number, decimals = true, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(cents / 100);
export const compactMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) => new Date(value + "T12:00:00").toLocaleDateString("en-US", options);
export const monthStart = (date = new Date()) =>
  localDate(new Date(date.getFullYear(), date.getMonth(), 1));
export const monthEnd = (date = new Date()) =>
  localDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
export const monthOffset = (month: string, delta: number) => {
  const d = new Date(month + "T12:00:00");
  return localDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
};
export const parseMoney = (s: string) => {
  const value = s.trim().replace(/[$,]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(value))
    throw new Error("Enter an amount with up to two decimal places.");
  return Math.round(Number(value) * 100);
};
/**
 * Turns any thrown value into a sentence a person can act on. Messages the
 * server wrote on purpose (ConvexError) pass through; everything else, such as
 * an unexpected server exception or a dropped connection, gets a plain
 * explanation instead of request IDs or stack text.
 */
export const message = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const convex = raw.match(/Uncaught ConvexError: ([\s\S]*?)(?:\n|$)/);
  if (convex?.[1]) return convex[1].trim();
  if (raw.includes("InvalidAccountId") || raw.includes("InvalidSecret"))
    return "The email or password is incorrect.";
  if (
    /Failed to fetch|NetworkError|Load failed|ECONNREFUSED|offline/i.test(raw)
  )
    return "Marten can’t reach the server right now. Check your connection and try again.";
  if (
    /\[CONVEX|Server Error|Request ID|Uncaught Error|InternalServerError/i.test(
      raw,
    )
  )
    return "Something went wrong on the server. Please try again in a moment.";
  const first = raw.split("\n")[0].trim();
  return first || "Something went wrong. Please try again.";
};
export const csv = (rows: (string | number)[][]) =>
  rows
    .map((r) =>
      r
        .map((v) => {
          let s = String(v);
          if (
            /^[=+@\t\r]/.test(s) ||
            (s.startsWith("-") && !/^-?\d+(\.\d+)?$/.test(s))
          )
            s = "'" + s;
          return '"' + s.replace(/"/g, '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
export function download(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("The CSV has an unclosed quote.");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
