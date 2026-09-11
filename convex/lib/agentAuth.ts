import { sha256 } from "@oslojs/crypto/sha2";

export const AGENT_ACCESS_MS = 60 * 60_000;
export const AGENT_GRANT_MS = 30 * 24 * 60 * 60_000;
export const AGENT_REQUEST_MS = 10 * 60_000;

export function hashSecret(value: string) {
  return Array.from(sha256(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
/** Only call in actions: mutation pseudo-randomness is not a token generator. */
export function randomSecret(prefix: string) {
  return `${prefix}_${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}
export function pkceChallenge(verifier: string) {
  return base64Url(sha256(new TextEncoder().encode(verifier)));
}
export function validVerifier(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}
export function requestedScopes(value: string | null) {
  const scopes = [
    ...new Set((value ?? "finance:read").split(/\s+/).filter(Boolean)),
  ];
  if (
    scopes.some(
      (scope) =>
        !["finance:read", "finance:write", "offline_access"].includes(scope),
    )
  )
    throw new Error("invalid_scope");
  if (!scopes.includes("finance:read")) scopes.unshift("finance:read");
  return scopes;
}

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function redirectAllowed(candidate: string, registered: string) {
  if (candidate === registered) return true;
  try {
    const actual = new URL(candidate),
      expected = new URL(registered);
    if (
      actual.protocol !== "http:" ||
      expected.protocol !== "http:" ||
      !loopback.has(actual.hostname) ||
      actual.hostname !== expected.hostname ||
      actual.username ||
      actual.password ||
      actual.hash ||
      expected.hash
    )
      return false;
    // RFC 8252 loopback native redirects use an ephemeral port.
    actual.port = "";
    expected.port = "";
    return actual.href === expected.href;
  } catch {
    return false;
  }
}

export type AgentClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};
const predefined: Record<string, Omit<AgentClient, "clientId">> = {
  "marten-chatgpt": {
    clientName: "ChatGPT",
    redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  },
  "marten-claude": {
    clientName: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  },
  "marten-local": {
    clientName: "Local MCP client",
    redirectUris: [
      "http://localhost/callback",
      "http://127.0.0.1/callback",
      "http://localhost/oauth/callback",
      "http://127.0.0.1/oauth/callback",
    ],
  },
};

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
) {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      const value = chunk.value;
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

/** A narrow metadata-origin allowlist avoids turning discovery into an SSRF proxy. */
export async function resolveAgentClient(
  clientId: string,
): Promise<AgentClient> {
  if (predefined[clientId]) return { clientId, ...predefined[clientId] };
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new Error("invalid_client");
  }
  if (
    url.protocol !== "https:" ||
    !["chatgpt.com", "claude.ai", "claude.com"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/oauth/")
  )
    throw new Error("invalid_client");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("invalid_client");
  let data: unknown;
  try {
    data = JSON.parse(await readBoundedBody(response.body, 16000));
  } catch {
    throw new Error("invalid_client");
  }
  if (!data || typeof data !== "object") throw new Error("invalid_client");
  const metadata = data as Record<string, unknown>;
  const methods = metadata.token_endpoint_auth_methods_supported;
  if (
    metadata.client_id !== clientId ||
    !Array.isArray(metadata.redirect_uris) ||
    !metadata.redirect_uris.length ||
    metadata.redirect_uris.length > 20 ||
    (metadata.token_endpoint_auth_method !== "none" &&
      !(Array.isArray(methods) && methods.includes("none")))
  )
    throw new Error("invalid_client");
  const redirectUris = metadata.redirect_uris.map((value: unknown) => {
    if (typeof value !== "string" || value.length > 2048)
      throw new Error("invalid_client");
    const redirect = new URL(value);
    if (
      redirect.username ||
      redirect.password ||
      redirect.hash ||
      !(
        redirect.origin === url.origin ||
        (redirect.protocol === "http:" && loopback.has(redirect.hostname))
      )
    )
      throw new Error("invalid_client");
    return value;
  });
  return {
    clientId,
    clientName: url.hostname === "chatgpt.com" ? "ChatGPT" : "Claude",
    redirectUris,
  };
}

export function authorizationRedirect(
  redirectUri: string,
  state: string | undefined,
  issuer: string,
  result: { code: string } | { error: string },
) {
  const redirect = new URL(redirectUri);
  if (state !== undefined) redirect.searchParams.set("state", state);
  redirect.searchParams.set("iss", issuer);
  if ("code" in result) redirect.searchParams.set("code", result.code);
  else redirect.searchParams.set("error", result.error);
  return redirect.href;
}
