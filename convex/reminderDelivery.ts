import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { userAction } from "./lib/access";
import { resetCode } from "./lib/passwordReset";
import {
  reminderEmailContent,
  reminderVerificationContent,
  sendReminderEmail,
} from "./lib/reminderEmail";

async function codeHash(userId: string, code: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${code}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export const requestVerification = userAction({
  args: { purpose: v.optional(v.literal("plaid")) },
  returns: v.null(),
  handler: async (ctx, { purpose }) => {
    if (!process.env.AUTH_BREVO_KEY || !process.env.AUTH_EMAIL_FROM)
      throw new ConvexError(
        "Email verification is not available on this server. Contact the site owner.",
      );
    const code = resetCode();
    const email = await ctx.runMutation(
      internal.reminders.reserveVerification,
      {
        userId: ctx.userId,
        codeHash: await codeHash(ctx.userId, code),
        ...(purpose ? { purpose } : {}),
      },
    );
    await sendReminderEmail(
      email,
      purpose === "plaid"
        ? {
            subject: "Verify your email for Marten",
            textContent: `Your Marten verification code is ${code}. It expires in 15 minutes. This verifies your sign-in email for bank connections and does not enable email reminders.`,
            htmlContent: `<p>Your Marten verification code is <strong>${code}</strong>.</p><p>It expires in 15 minutes. This verifies your sign-in email for bank connections and does not enable email reminders.</p>`,
          }
        : reminderVerificationContent(code),
      crypto.randomUUID(),
    );
    return null;
  },
});
export const verifyEmail = userAction({
  args: { code: v.string(), purpose: v.optional(v.literal("plaid")) },
  returns: v.null(),
  handler: async (ctx, { code, purpose }) => {
    if (!/^\d{8}$/.test(code))
      throw new ConvexError("Enter the eight-digit code from your email.");
    const valid = await ctx.runMutation(internal.reminders.verifyCode, {
      userId: ctx.userId,
      codeHash: await codeHash(ctx.userId, code),
      ...(purpose ? { purpose } : {}),
    });
    if (!valid)
      throw new ConvexError(
        "That code is incorrect or expired. Request a new code if needed.",
      );
    return null;
  },
});

export const sendDue = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (!process.env.AUTH_BREVO_KEY || !process.env.AUTH_EMAIL_FROM)
      return null;
    const batch = await ctx.runMutation(internal.reminders.claimEmail, {
      userId,
      batchId: crypto.randomUUID(),
    });
    if (!batch?.email) return null;
    let status: "sent" | "failed" = "sent";
    try {
      await sendReminderEmail(
        batch.email,
        reminderEmailContent(batch.count, batch.firstDue, process.env.SITE_URL),
        batch.batchId,
      );
    } catch {
      // Do not automatically retry an ambiguous HTTP result and risk duplicate
      // financial mail. Settings exposes this failed attempt to the account owner.
      status = "failed";
    }
    await ctx.runMutation(internal.reminders.finishEmail, {
      ids: batch.ids,
      batchId: batch.batchId,
      status,
    });
    return null;
  },
});
