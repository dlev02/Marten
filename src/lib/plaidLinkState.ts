export const PLAID_FLOW_KEY = "folio.plaid.link.v1";
export const PLAID_FLOW_EVENT = "folio:plaid-link";
export type PlaidFlow = {
  linkToken: string;
  expiration: string;
  kind: "connect" | "update";
  userId: string;
  itemId?: string;
  returnTo: string;
};

export function parsePlaidFlow(
  raw: string | null,
  userId: string,
  now = Date.now(),
): PlaidFlow | null {
  if (!raw || raw.length > 8000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const f = value as Partial<PlaidFlow>;
    if (
      typeof f.linkToken !== "string" ||
      !f.linkToken.startsWith("link-") ||
      f.linkToken.length > 2000 ||
      typeof f.expiration !== "string" ||
      !Number.isFinite(Date.parse(f.expiration)) ||
      Date.parse(f.expiration) <= now ||
      // A newly issued four-hour token can exceed four local hours when the
      // bank and browser clocks differ slightly. Plaid enforces true expiry.
      Date.parse(f.expiration) > now + (4 * 60 + 5) * 60 * 1000 ||
      f.userId !== userId ||
      (f.kind !== "connect" && f.kind !== "update") ||
      (f.kind === "update" && (typeof f.itemId !== "string" || !f.itemId)) ||
      typeof f.returnTo !== "string" ||
      !f.returnTo.startsWith("/") ||
      f.returnTo.startsWith("//") ||
      f.returnTo.includes("\\") ||
      f.returnTo.length > 2000
    )
      return null;
    return {
      linkToken: f.linkToken,
      expiration: f.expiration,
      kind: f.kind,
      userId,
      ...(f.kind === "update" ? { itemId: f.itemId } : {}),
      returnTo: f.returnTo,
    };
  } catch {
    return null;
  }
}

export function startPlaidFlow(input: Omit<PlaidFlow, "returnTo">): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("oauth_state_id");
  const value = {
    ...input,
    returnTo: `${url.pathname}${url.search}${url.hash}`,
  };
  const flow = parsePlaidFlow(JSON.stringify(value), input.userId);
  if (!flow)
    throw new Error("This bank connection has expired. Please start again.");
  try {
    sessionStorage.setItem(PLAID_FLOW_KEY, JSON.stringify(flow));
  } catch {
    throw new Error(
      "Allow this site to use session storage before connecting your bank.",
    );
  }
  // Only the short-lived Link token and routing context are persisted. No bank
  // credentials, public/access tokens, or API keys belong in browser storage.
  window.dispatchEvent(new Event(PLAID_FLOW_EVENT));
}
