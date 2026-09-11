/** Calendar dates stay local; never round-trip them through UTC timestamps. */
export function readCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

export function displayCalendarDate(value: string) {
  const date = readCalendarDate(value);
  return date
    ? `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`
    : "";
}

export function parseCalendarInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const iso = match
    ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
    : trimmed;
  return readCalendarDate(iso) ? iso : null;
}
