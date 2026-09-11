import { env } from "../_generated/server";

export function agentConfiguration() {
  const base = env.CONVEX_SITE_URL.replace(/\/$/, "");
  let appOrigin: string | null = null;
  try {
    const configured = new URL(env.AGENT_APP_ORIGIN ?? env.SITE_URL ?? "");
    if (
      !configured.username &&
      !configured.password &&
      !configured.search &&
      !configured.hash &&
      (configured.pathname === "/" || configured.pathname === "") &&
      (configured.protocol === "https:" ||
        (configured.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)))
    )
      appOrigin = configured.origin;
  } catch {
    /* Configuration status is shown in settings. */
  }
  return {
    base,
    issuer: `${base}/agent`,
    mcpUrl: `${base}/mcp`,
    appOrigin,
    remoteReady: Boolean(appOrigin?.startsWith("https://")),
    metadataUrl: `${base}/.well-known/oauth-protected-resource/mcp`,
  };
}
