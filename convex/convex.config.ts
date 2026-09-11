import { defineApp } from "convex/server";
import { v } from "convex/values";
export default defineApp({
  env: {
    PLAID_CLIENT_ID: v.optional(v.string()),
    PLAID_SECRET: v.optional(v.string()),
    PLAID_ENV: v.optional(v.string()),
    PLAID_REDIRECT_URI: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});
