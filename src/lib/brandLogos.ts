import brandCatalog from "./brandCatalog.json";

/** Offline identification artwork. Catalog generation and provenance: docs/assets.md. */
const brands = [
  ["target", ["Target", "Target Store", "Target Stores"]],
  ["netflix", ["Netflix", "Netflix.com", "Netflix Streaming"]],
  ["spotify", ["Spotify", "Spotify Premium", "Spotify USA"]],
  ["apple", ["Apple", "Apple Store", "Apple.com/bill"]],
  ["amazon", ["Amazon", "Amazon.com", "Amazon Marketplace", "Amazon Prime"]],
  ["starbucks", ["Starbucks", "Starbucks Coffee"]],
  ["shell", ["Shell", "Shell Oil", "Shell Oil Company"]],
  ["wholefoods", ["Whole Foods Market", "Whole Foods", "Wholefoods"]],
  ["amc", ["AMC Theatres", "AMC Theaters", "AMC", "AMC Entertainment"]],
  ["uber", ["Uber", "Uber Eats"]],
  ["unitedairlines", ["United Airlines"]],
  [
    "chase",
    [
      "Chase",
      "Chase Bank",
      "JPMorgan Chase",
      "JPMorgan Chase Bank",
      "JP Morgan Chase",
      "Chase interest",
    ],
  ],
  ["americanexpress", ["American Express", "Amex", "American Express Bank"]],
  ["traderjoes", ["Trader Joe's", "Trader Joes"]],
  ["walgreens", ["Walgreens", "Walgreens Pharmacy"]],
] as const;

function normalizeBrandName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

const logoByName = new Map<string, string>();
const ambiguous = new Set<string>();
for (const [slug, aliases] of brandCatalog as [string, string[]][]) {
  for (const name of aliases) {
    const key = normalizeBrandName(name);
    const url = `/brands/catalog/${slug}.svg`;
    if (logoByName.has(key) && logoByName.get(key) !== url) ambiguous.add(key);
    else logoByName.set(key, url);
  }
}
for (const key of ambiguous) logoByName.delete(key);
// Reviewed aliases take precedence over the generated catalog.
for (const [slug, aliases] of brands) {
  for (const name of aliases)
    logoByName.set(normalizeBrandName(name), `/brands/${slug}.svg`);
}

/** Returns a bundled URL for a listed alias, or null. Never performs a lookup request. */
export function brandLogo(name: string): string | null {
  return logoByName.get(normalizeBrandName(name)) ?? null;
}
