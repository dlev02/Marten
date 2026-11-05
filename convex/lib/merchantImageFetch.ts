"use node";
import { ConvexError } from "convex/values";
import { validateHostname, sniffImage } from "./merchantImageValidation";
import { safeWebsiteRequest } from "./safeWebsiteRequest";
const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_HTML = 512 * 1024;

function websiteUrl(value: string, base: string, host: string): URL {
  const url = new URL(value.replace(/&amp;/g, "&"), base);
  const target = validateHostname(url.href);
  // Keep requests on the merchant's own host/subdomains; never query logo services.
  const root = host.replace(/^www\./, "");
  if (
    url.protocol !== "https:" ||
    (target !== root && !target.endsWith(`.${root}`))
  )
    throw new Error("Unsupported logo location");
  return url;
}

async function readWebsite(
  url: URL,
  host: string,
  limit: number,
  signal: AbortSignal,
) {
  for (let redirects = 0; redirects <= 3; redirects++) {
    const result = await safeWebsiteRequest(url, limit, signal);
    const response = new Response(result.bytes, {
      status: result.status,
      headers: result.location ? { Location: result.location } : {},
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Too many redirects");
      url = websiteUrl(location, url.href, host);
      continue;
    }
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get("content-length")) > limit
    ) {
      await response.body?.cancel();
      throw new Error("Website response unavailable");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error("Website response too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, url: url.href };
  }
  throw new Error("Website unavailable");
}

function iconLinks(html: string): string[] {
  const apple: string[] = [],
    icons: string[] = [],
    images: string[] = [];
  // Ignore comments and scripts before reading the bounded document's metadata.
  const markup = html.replace(
    /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  for (const tag of markup.match(/<(?:link|meta)\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    ))
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (attrs.href && rel.some((value) => value.startsWith("apple-touch-icon")))
      apple.push(attrs.href);
    else if (attrs.href && rel.includes("icon")) icons.push(attrs.href);
    else if (
      (attrs.property ?? attrs.name)?.toLowerCase() === "og:image" &&
      attrs.content
    )
      images.push(attrs.content);
  }
  return [...apple, ...icons, ...images].slice(0, 8);
}

export async function fetchWebsiteLogo(
  hostname: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }> {
  const host = validateHostname(hostname);
  const base = `https://${host}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let candidates: string[] = [];
    let documentUrl = base;
    try {
      const page = await readWebsite(
        new URL(base),
        host,
        MAX_HTML,
        controller.signal,
      );
      documentUrl = page.url;
      candidates = iconLinks(new TextDecoder().decode(page.bytes));
    } catch {
      /* Sites without readable HTML may still provide standard icons. */
    }
    for (const path of [
      ...new Set([...candidates, "/apple-touch-icon.png", "/favicon.ico"]),
    ]) {
      try {
        const result = await readWebsite(
          websiteUrl(path, documentUrl, host),
          host,
          MAX_IMAGE,
          controller.signal,
        );
        const type = sniffImage(result.bytes);
        if (type) return { bytes: result.bytes, type };
      } catch {
        /* Try the next first-party candidate. */
      }
    }
  } finally {
    clearTimeout(timer);
  }
  throw new ConvexError(
    "We couldn’t find a supported logo on that website. Check the domain, choose a catalog logo, or upload an image.",
  );
}
