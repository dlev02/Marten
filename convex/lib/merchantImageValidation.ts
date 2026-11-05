import { ConvexError } from "convex/values";

const MAX_IMAGE = 2 * 1024 * 1024;
const hostError = "Enter a public website hostname, such as costco.com.";

/** Normalize pasted website addresses, but never accept credentials, ports or IP hosts. */
export function validateHostname(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\\\s@%]/.test(value))
    throw new ConvexError(hostError);
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new ConvexError(hostError);
  }
  const host = url.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    host.length > 253 ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
    host
      .split(".")
      .some(
        (label) =>
          label.length > 63 || label.startsWith("-") || label.endsWith("-"),
      ) ||
    !/\.[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(
      host,
    )
  )
    throw new ConvexError(hostError);
  return host;
}

/** Content-Type is untrusted. SVGs must also be self-contained passive images. */
export function sniffImage(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (bytes.length < 12 || bytes.length > MAX_IMAGE) return null;
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (starts(0, 0, 1, 0) && (bytes[4] || bytes[5])) return "image/x-icon";
  const svg = new TextDecoder().decode(bytes).trim();
  if (
    /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg) &&
    /<\/svg>\s*$/i.test(svg) &&
    !/<(?:script|foreignObject|iframe|object|embed|image|use|style|animate\w*|set)\b|\bon\w+\s*=|<!ENTITY|<!DOCTYPE|(?:href|src)\s*=|url\s*\(|@import/i.test(
      svg,
    )
  )
    return "image/svg+xml";
  return null;
}
