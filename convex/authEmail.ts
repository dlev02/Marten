import { v } from "convex/values";
import { query } from "./_generated/server";

export const availability = query({
  args: {},
  returns: v.object({ passwordReset: v.boolean() }),
  handler: () => ({
    passwordReset: !!(
      process.env.AUTH_BREVO_KEY && process.env.AUTH_EMAIL_FROM
    ),
  }),
});
