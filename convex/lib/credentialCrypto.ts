import { ConvexError } from "convex/values";

/**
 * Provider secrets that users enter in the app (for example a Sophtron access
 * key) are stored in Convex. When the deployment operator sets
 * `CREDENTIALS_KEY` (32 random bytes, base64), those secrets are additionally
 * sealed with AES-256-GCM so the raw value never appears in the database,
 * dashboard, or backups. Without the key, values are stored as entered; the
 * status query reports which mode is active so the operator can tell.
 */
const PREFIX = "enc1.";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Accepts a base64 key of exactly 32 bytes; anything else means "no encryption". */
export function credentialKeyBytes(
  raw: string | undefined,
): Uint8Array<ArrayBuffer> | null {
  if (!raw) return null;
  try {
    const bytes = fromBase64(raw.trim());
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

async function aesKey(bytes: Uint8Array<ArrayBuffer>, usage: KeyUsage) {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    usage,
  ]);
}

export function isSealed(value: string) {
  return value.startsWith(PREFIX);
}

/** Returns the sealed form when a key is configured, otherwise the plaintext. */
export async function sealCredential(
  plaintext: string,
  rawKey: string | undefined,
): Promise<string> {
  const keyBytes = credentialKeyBytes(rawKey);
  if (!keyBytes) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(keyBytes, "encrypt"),
      encoder.encode(plaintext),
    ),
  );
  return `${PREFIX}${toBase64(iv)}.${toBase64(ciphertext)}`;
}

/** Opens a sealed value; plaintext values pass through unchanged. */
export async function openCredential(
  stored: string,
  rawKey: string | undefined,
): Promise<string> {
  if (!isSealed(stored)) return stored;
  const keyBytes = credentialKeyBytes(rawKey);
  if (!keyBytes)
    throw new ConvexError(
      "This server's CREDENTIALS_KEY is missing, so saved provider credentials cannot be read. Restore the key or enter the credentials again.",
    );
  const [iv, ciphertext] = stored.slice(PREFIX.length).split(".");
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      await aesKey(keyBytes, "decrypt"),
      fromBase64(ciphertext),
    );
    return decoder.decode(plain);
  } catch {
    throw new ConvexError(
      "Saved provider credentials could not be decrypted with this server's CREDENTIALS_KEY. Enter the credentials again.",
    );
  }
}
