import { ConvexError } from "convex/values";
import { env } from "../_generated/server";

export function fileHeaders(request: Request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin) {
    const app = env.SITE_URL ? new URL(env.SITE_URL).origin : null;
    const local = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
    if (origin !== app && !local) throw new ConvexError("Origin unavailable.");
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  return headers;
}
