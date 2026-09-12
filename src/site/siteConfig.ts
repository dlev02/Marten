/**
 * Facts the public site and in-app support screens share. Keep URLs here so a
 * domain or donation change is one edit. `contactEmail` stays empty until the
 * project mailbox exists; pages fall back to GitHub issues while it is empty.
 */
export const site = {
  name: "Marten",
  operator: "Drew Levinson",
  url: "https://martenmoney.com",
  github: "https://github.com/dlev02/marten",
  issues: "https://github.com/dlev02/marten/issues",
  newIssue: "https://github.com/dlev02/marten/issues/new/choose",
  security: "https://github.com/dlev02/marten/security/advisories/new",
  kofi: "https://ko-fi.com/dlev384895",
  contactEmail: "" as string,
  governingState: "Illinois",
  effective: "September 12, 2026",
} as const;

/** Resolves the `{{TOKEN}}` placeholders the content modules use. */
export function fillTokens(text: string) {
  return text
    .replace(/\{\{SITE_URL\}\}/g, site.url)
    .replace(
      /\{\{CONTACT_EMAIL\}\}/g,
      site.contactEmail || `[a GitHub issue](${site.newIssue})`,
    )
    .replace(/\{\{GOVERNING_STATE\}\}/g, site.governingState);
}
