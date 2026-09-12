import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { owned, userAction, userMutation } from "./lib/access";
import { searchBrandLogos } from "../src/lib/brandLogos";

const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_HTML = 512 * 1024;
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
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html,image/*;q=0.9" },
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

export const registerPreview = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("uploads", { ...args, purpose: "merchant" });
    await ctx.scheduler.runAfter(
      60 * 60 * 1000,
      internal.merchantLogos.expirePreview,
      { storageId: args.storageId },
    );
    return null;
  },
});
export const expirePreview = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const upload = await ctx.db
      .query("uploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .unique();
    if (upload?.purpose === "merchant") {
      await ctx.storage.delete(storageId);
      await ctx.db.delete(upload._id);
    }
    return null;
  },
});

export const findWebsiteLogo = userAction({
  args: { hostname: v.string() },
  returns: v.object({ storageId: v.id("_storage"), url: v.string() }),
  handler: async (
    ctx,
    { hostname },
  ): Promise<{ storageId: Id<"_storage">; url: string }> => {
    const host = validateHostname(hostname);
    const base = `https://${host}/`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let image: { bytes: Uint8Array<ArrayBuffer>; type: string } | undefined;
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
          if (type) {
            image = { bytes: result.bytes, type };
            break;
          }
        } catch {
          /* Try the next first-party candidate. */
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (!image)
      throw new ConvexError(
        "We couldn’t find a supported logo on that website. Check the domain, choose a catalog logo, or upload an image.",
      );
    let storageId: Id<"_storage"> | undefined;
    try {
      storageId = await ctx.storage.store(
        new Blob([image.bytes], { type: image.type }),
      );
      const url = await ctx.storage.getUrl(storageId);
      if (!url) throw new Error("Preview unavailable");
      await ctx.runMutation(internal.merchantLogos.registerPreview, {
        userId: ctx.userId,
        storageId,
      });
      return { storageId, url };
    } catch {
      if (storageId) await ctx.storage.delete(storageId);
      throw new ConvexError("The logo couldn’t be saved. Please try again.");
    }
  },
});

/** Association happens only when the user saves the merchant after reviewing its preview. */
export const selectLogo = userMutation({
  args: {
    merchantId: v.id("merchants"),
    storageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { merchantId, storageId, logoUrl }) => {
    const merchant = await owned(ctx, merchantId);
    if (!!storageId === !!logoUrl)
      throw new ConvexError("Choose one logo before saving.");
    if (storageId) {
      const upload = await ctx.db
        .query("uploads")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .unique();
      if (
        !upload ||
        upload.userId !== ctx.userId ||
        upload.purpose !== "merchant"
      )
        throw new ConvexError(
          "This logo preview has expired. Find the logo again.",
        );
      await ctx.db.delete(upload._id);
    } else if (!searchBrandLogos("").some((logo) => logo.url === logoUrl)) {
      throw new ConvexError("Choose a logo from the local catalog.");
    }
    if (merchant.logoStorageId && merchant.logoStorageId !== storageId)
      await ctx.storage.delete(merchant.logoStorageId);
    await ctx.db.patch(merchantId, { logoStorageId: storageId, logoUrl });
    return null;
  },
});
