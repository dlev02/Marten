import { Email } from "@convex-dev/auth/providers/Email";
import type { EmailConfig } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

/** Eight uniform decimal digits; rejection sampling avoids modulo bias. */
export function resetCode() {
  let code = "";
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < 250) code += String(byte % 10);
      if (code.length === 8) break;
    }
  }
  return code;
}

export async function sendResetEmail({
  identifier,
  token,
}: Pick<
  Parameters<EmailConfig["sendVerificationRequest"]>[0],
  "identifier" | "token"
>) {
  const key = process.env.AUTH_BREVO_KEY;
  const sender = process.env.AUTH_EMAIL_FROM;
  if (!key || !sender)
    throw new ConvexError("Password-reset email is not available yet.");
  const textContent = `Your Marten password reset code is ${token}.\n\nEnter it in Marten within 15 minutes, then choose a new password.\n\nIf you did not request this, you can ignore this email. Your password has not changed.`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Marten", email: sender },
      to: [{ email: identifier }],
      subject: "Reset your Marten password",
      textContent,
      htmlContent: `<html><body style="margin:0;background:#f6f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#22201d"><div style="max-width:440px;margin:40px auto;padding:32px;background:white;border:1px solid #e9e6e2;border-radius:14px"><div style="font-size:22px;font-weight:700;margin-bottom:28px">Marten<span style="color:#356587">.</span></div><h1 style="font-size:24px;line-height:1.3">Reset your password</h1><p style="font-size:15px;line-height:1.6;color:#77746f">Enter this one-time code in Marten, then choose a new password.</p><div style="font-size:32px;letter-spacing:6px;font-weight:600;background:#f6f5f3;padding:20px;text-align:center;border-radius:8px;margin:24px 0">${token}</div><p style="font-size:14px;line-height:1.6;color:#77746f">This code expires in 15 minutes. If you didn’t request a reset, you can ignore this email. Your password has not changed.</p></div></body></html>`,
      tags: ["folio-password-reset"],
    }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {
    throw new ConvexError(
      "We couldn’t send the code. Please try again shortly.",
    );
  });
  if (!response.ok) {
    // Never expose provider responses, the delivery key, or verification codes.
    throw new ConvexError(
      "We couldn’t send the code. Please try again shortly.",
    );
  }
}

export const passwordResetEmail = Email({
  id: "folio-password-reset",
  maxAge: 15 * 60,
  generateVerificationToken: async () => resetCode(),
  sendVerificationRequest: sendResetEmail,
  authorize: async (params, account) => {
    // Auth keys failed-code limits by the supplied email. Requiring its canonical
    // spelling prevents case/whitespace variants from creating new attempt buckets.
    if (
      typeof params.email !== "string" ||
      params.email !== account.providerAccountId
    )
      throw new ConvexError("This code does not match the email address.");
  },
});
