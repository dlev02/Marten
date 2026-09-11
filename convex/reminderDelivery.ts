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
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!process.env.AUTH_BREVO_KEY || !process.env.AUTH_EMAIL_FROM)
      throw new ConvexError(
        "Email reminders are not available on this server.",
      );
    const code = resetCode();
    const email = await ctx.runMutation(
      internal.reminders.reserveVerification,
      { userId: ctx.userId, codeHash: await codeHash(ctx.userId, code) },
    );
    await sendReminderEmail(
      email,
      reminderVerificationContent(code),
      crypto.randomUUID(),
    );
    return null;
  },
});
export const verifyEmail = userAction({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    if (!/^\d{8}$/.test(code))
      throw new ConvexError("Enter the eight-digit code from your email.");
    const valid = await ctx.runMutation(internal.reminders.verifyCode, {
      userId: ctx.userId,
      codeHash: await codeHash(ctx.userId, code),
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
