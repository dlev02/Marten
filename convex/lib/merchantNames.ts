/**
 * Bank descriptors arrive shouting: "SQ *BLUE BOTTLE COFFEE #0421 ****1234".
 * These helpers turn them into a readable merchant name without guessing at
 * meaning. Users can still rename any merchant; rules run on the cleaned name.
 */
const PROCESSOR_PREFIX =
  /^(?:sq|tst|sp|py|pp|dd|dnh|ck|aplpay|apl\*?pay|paypal|amzn mktp|amazon mktp|amzn digital|google\s*\*|pos|pur|purchase|debit card purchase|checkcard|chkcard|visa dda pur|ach)\s*\*?\s*/i;
const MASKED_DIGITS = /(?:[x*#•·]{3,}\s*\d{0,4}|\b\d{0,4}[x*]{4,}\b)/gi;
const STORE_NUMBER = /\s#\s?\d{2,}\b|\bstore\s?#?\d+\b|\s\d{4,}(?=\s|$)/i;
const TRAILING_LOCATION =
  /\s+(?:[A-Z][A-Za-z.'-]+\s+)?(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\s+US(?:A)?)?$/;
const SMALL_WORDS = new Set([
  "of",
  "and",
  "the",
  "at",
  "in",
  "on",
  "for",
  "de",
]);

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((part, index) =>
      /^\s+$|^-$|^\/$/.test(part)
        ? part
        : index > 0 && SMALL_WORDS.has(part)
          ? part
          : part.replace(
              /^(['"(]?)(\p{L})/u,
              (_, open, letter) => open + letter.toUpperCase(),
            ),
    )
    .join("")
    .replace(/\bMc(\p{L})/gu, (_, letter) => `Mc${letter.toUpperCase()}`)
    .replace(/'S\b/g, "'s");
}

/** Cleans a raw bank descriptor into a display name. Returns "" if nothing readable remains. */
export function cleanMerchantName(raw: string): string {
  let name = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  name = name.replace(PROCESSOR_PREFIX, "");
  name = name.replace(MASKED_DIGITS, " ");
  name = name.replace(/[*|]+/g, " ").replace(/\s+/g, " ").trim();
  const withoutLocation = name.replace(TRAILING_LOCATION, "").trim();
  if (withoutLocation.length >= 3) name = withoutLocation;
  name = name.replace(STORE_NUMBER, " ").replace(/\s+/g, " ").trim();
  // Descriptors are often cut mid-word ("CASTAWAY HOSTEL HO"); drop a trailing
  // one- or two-letter fragment when at least two real words remain.
  name = name.replace(/^((?:\S{3,}\s+){1,}\S{3,})\s+[A-Za-z]{1,2}$/, "$1");
  name = name.replace(/[\s,.-]+$/, "").trim();
  if (!name) return "";
  const shouting = name === name.toUpperCase() && /[A-Z]/.test(name);
  return (shouting ? titleCase(name) : name).slice(0, 120);
}

/** Falls back to the raw text (trimmed) when cleaning strips everything. */
export function merchantDisplayName(
  raw: string,
  fallback = "Unknown merchant",
) {
  return (
    cleanMerchantName(raw) ||
    (/\p{L}/u.test(raw) ? raw.trim().slice(0, 120) : "") ||
    fallback
  );
}

/**
 * Some banks send the account holder's nickname (or just their first name) as
 * the account name. When the official product name is available and the name
 * is a lone word without digits, the official name is far more useful.
 */
export function preferredAccountName(
  name: string | null | undefined,
  officialName: string | null | undefined,
): string {
  const nickname = (name ?? "").trim();
  const official = (officialName ?? "").trim();
  const loneWord = nickname.split(/\s+/).length <= 1 && !/\d/.test(nickname);
  const lowercase = nickname.length > 0 && nickname === nickname.toLowerCase();
  const chosen =
    official && (!nickname || loneWord || lowercase) ? official : nickname;
  const readable =
    chosen === chosen.toUpperCase() && /[A-Z]/.test(chosen)
      ? titleCase(chosen)
      : chosen;
  return (readable || official || nickname || "Bank account").slice(0, 120);
}
