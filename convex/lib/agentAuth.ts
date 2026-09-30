import { sha256 } from "@oslojs/crypto/sha2";

const DAY = 24 * 60 * 60_000;
export const AGENT_ACCESS_MS = 60 * 60_000;
/** A "For 30 days" grant ends on this fixed date regardless of use. */
export const AGENT_GRANT_MS = 30 * DAY;
/** A "While in use" grant ends only after this long without any use. */
export const AGENT_IDLE_MS = 90 * DAY;
/** Stored deadline for "Until I disconnect it"; the largest valid JS date. */
export const AGENT_NEVER = 8.64e15;
export const AGENT_REQUEST_MS = 10 * 60_000;
/**
 * Hosted assistants retry a refresh when a response is lost. For this long
 * after a refresh token is first used, presenting it again issues a fresh pair
 * from the same grant instead of treating it as theft.
 */
export const AGENT_REFRESH_GRACE_MS = 120_000;
/** A rotated refresh token can be retried at most this many times in grace. */
export const AGENT_REFRESH_GRACE_REUSES = 3;
/** Used refresh tokens are kept this long so later replay still revokes. */
export const AGENT_USED_REFRESH_RETAIN_MS = DAY;
/**
 * Every tool call reads its grant; rewriting the grant on every call made
 * parallel calls conflict. Last use (and the idle deadline) move at most
 * this often, and on each token refresh.
 */
export const AGENT_GRANT_TOUCH_MS = 60 * 60_000;

export type GrantLifetime = "idle" | "fixed" | "untilRevoked";
export const grantLifetimes: readonly GrantLifetime[] = [
  "idle",
  "fixed",
  "untilRevoked",
];
/** Access keys have a fixed length of life chosen at creation, or none. */
export const accessKeyLifetimes = {
  "30d": 30 * DAY,
  "90d": 90 * DAY,
  "1y": 365 * DAY,
  never: null,
} as const;
export type AccessKeyLifetime = keyof typeof accessKeyLifetimes;

/** The deadline a grant gets when created, or when used if it slides. */
export function grantDeadline(
  lifetime: GrantLifetime | undefined,
  now: number,
  fixedEnd?: number,
) {
  if (lifetime === "untilRevoked") return AGENT_NEVER;
  if (lifetime === "idle") return now + AGENT_IDLE_MS;
  return fixedEnd ?? now + AGENT_GRANT_MS;
}

/** Personal access keys: a scannable prefix, then 256 random bits. */
export const ACCESS_KEY_PREFIX = "mrtn";
export const ACCESS_KEY_CLIENT_ID = "marten-access-key";
export const accessKeyPattern = /^mrtn_[A-Za-z0-9_-]{43}$/;
export const accessTokenPattern = /^marten_access_[A-Za-z0-9_-]{43}$/;
/** Dynamically registered (RFC 7591) client IDs are public, not secrets. */
export const registeredClientPattern = /^marten_client_[A-Za-z0-9_-]{43}$/;
export const supportedScopes = [
  "finance:read",
  "finance:write",
  "offline_access",
] as const;

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
      (scope) => !(supportedScopes as readonly string[]).includes(scope),
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
/**
 * How the consent screen and Settings present a client. Only the predefined
 * ChatGPT/Claude IDs and their metadata documents on their own domains are
 * verified; `marten-local` is a generic loopback client; anything else,
 * including every dynamically registered client, is unverified.
 */
export type ClientTrust = "verified" | "local" | "unverified";
export function clientTrust(clientId: string): ClientTrust {
  if (clientId === "marten-chatgpt" || clientId === "marten-claude")
    return "verified";
  if (clientId === "marten-local") return "local";
  return allowlistedMetadataUrl(clientId) ? "verified" : "unverified";
}
const metadataHosts = ["chatgpt.com", "claude.ai", "claude.com"];
function allowlistedMetadataUrl(clientId: string) {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !metadataHosts.includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/oauth/")
  )
    return null;
  return url;
}
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
  const url = allowlistedMetadataUrl(clientId);
  if (!url) throw new Error("invalid_client");
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

/**
 * Validates an RFC 7591 registration body. Only public clients using PKCE are
 * registered, callbacks must be HTTPS or a loopback HTTP address, and nothing
 * the client says about itself beyond a display name is kept.
 */
export function validateRegistration(body: unknown): {
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
} {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new RegistrationError("invalid_client_metadata", "Send a JSON object.");
  const metadata = body as Record<string, unknown>;
  const uris = metadata.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 5)
    throw new RegistrationError(
      "invalid_redirect_uri",
      "Register between one and five redirect_uris.",
    );
  const redirectUris = [
    ...new Set(
      uris.map((value: unknown) => {
        if (typeof value !== "string" || value.length > 2048)
          throw new RegistrationError(
            "invalid_redirect_uri",
            "Each redirect URI must be a string.",
          );
        let redirect: URL;
        try {
          redirect = new URL(value);
        } catch {
          throw new RegistrationError(
            "invalid_redirect_uri",
            "Each redirect URI must be an absolute URL.",
          );
        }
        if (
          redirect.username ||
          redirect.password ||
          redirect.hash ||
          !(
            (redirect.protocol === "https:" && redirect.hostname) ||
            (redirect.protocol === "http:" && loopback.has(redirect.hostname))
          )
        )
          throw new RegistrationError(
            "invalid_redirect_uri",
            "Redirect URIs must use HTTPS, or HTTP on 127.0.0.1 or localhost, without credentials or a fragment.",
          );
        return redirect.href;
      }),
    ),
  ];
  const method = metadata.token_endpoint_auth_method;
  if (method !== undefined && method !== "none")
    throw new RegistrationError(
      "invalid_client_metadata",
      'Marten registers public clients only. Use token_endpoint_auth_method "none" with PKCE.',
    );
  const grantTypes = metadata.grant_types ?? [
    "authorization_code",
    "refresh_token",
  ];
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.includes("authorization_code") ||
    grantTypes.some(
      (type) => type !== "authorization_code" && type !== "refresh_token",
    )
  )
    throw new RegistrationError(
      "invalid_client_metadata",
      "Supported grant_types are authorization_code and refresh_token.",
    );
  const responseTypes = metadata.response_types ?? ["code"];
  if (
    !Array.isArray(responseTypes) ||
    responseTypes.some((type) => type !== "code")
  )
    throw new RegistrationError(
      "invalid_client_metadata",
      'The only supported response_type is "code".',
    );
  if (
    metadata.client_name !== undefined &&
    typeof metadata.client_name !== "string"
  )
    throw new RegistrationError(
      "invalid_client_metadata",
      "client_name must be a string.",
    );
  return {
    clientName:
      cleanClientName(metadata.client_name) ??
      new URL(redirectUris[0]).hostname,
    redirectUris,
    grantTypes: [...new Set(grantTypes as string[])],
  };
}
export class RegistrationError extends Error {
  constructor(
    readonly code: "invalid_redirect_uri" | "invalid_client_metadata",
    readonly description: string,
  ) {
    super(code);
  }
}
/** Display names are self-asserted: drop control and direction-override characters. */
export function cleanClientName(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned || null;
}

/** Constant-time comparison for equal-purpose secrets or their hashes. */
export function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a),
    right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}
