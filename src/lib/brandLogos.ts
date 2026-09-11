/**
 * Offline, exact-name brand artwork. See docs/assets.md for provenance.
 * A user-uploaded or institution-provided logo always takes precedence:
 *   const resolvedLogo = suppliedLogo || brandLogo(name);
 * The SVG assets include a white background and their own optical padding.
 */
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
] as const;

function normalizeBrandName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

const logoByName = new Map<string, string>(
  brands.flatMap(([slug, aliases]) =>
    aliases.map(
      (name) => [normalizeBrandName(name), `/brands/${slug}.svg`] as const,
    ),
  ),
);

/** Returns a bundled URL for a listed alias, or null. Never performs a lookup request. */
export function brandLogo(name: string): string | null {
  return logoByName.get(normalizeBrandName(name)) ?? null;
}
