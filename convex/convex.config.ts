import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
const app = defineApp({
  env: {
    PLAID_CLIENT_ID: v.optional(v.string()),
    PLAID_SECRET: v.optional(v.string()),
    PLAID_ENV: v.optional(v.string()),
    PLAID_REDIRECT_URI: v.optional(v.string()),
    // Optional comma-separated allowlist; when set, only these emails may link Plaid.
    PLAID_ALLOWED_EMAILS: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    AUTH_BREVO_KEY: v.optional(v.string()),
    AUTH_EMAIL_FROM: v.optional(v.string()),
    AGENT_APP_ORIGIN: v.optional(v.string()),
    // Optional 32-byte base64 key that seals user-entered provider secrets at rest.
    CREDENTIALS_KEY: v.optional(v.string()),
  },
});
app.use(rateLimiter);
export default app;
