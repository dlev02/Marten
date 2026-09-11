import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
const app = defineApp({
  env: {
    PLAID_CLIENT_ID: v.optional(v.string()),
    PLAID_SECRET: v.optional(v.string()),
    PLAID_ENV: v.optional(v.string()),
    PLAID_REDIRECT_URI: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    AUTH_BREVO_KEY: v.optional(v.string()),
    AUTH_EMAIL_FROM: v.optional(v.string()),
    AGENT_APP_ORIGIN: v.optional(v.string()),
    SOPHTRON_USER_ID: v.optional(v.string()),
    SOPHTRON_ACCESS_KEY: v.optional(v.string()),
    SOPHTRON_CUSTOMER_ID: v.optional(v.string()),
    SOPHTRON_OWNER_USER_ID: v.optional(v.string()),
    SOPHTRON_ENV: v.optional(v.string()),
  },
});
app.use(rateLimiter);
export default app;
