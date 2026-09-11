import { ConvexError } from "convex/values";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const emailFrame = (content: string) =>
  `<html><body style="margin:0;background:#f6f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#22201d"><div style="max-width:440px;margin:40px auto;padding:32px;background:#fff;border:1px solid #e9e6e2;border-radius:14px"><div style="font-size:22px;font-weight:700;margin-bottom:28px">Marten</div>${content}</div></body></html>`;

export function reminderEmailContent(
  count: number,
  firstDue: string,
  siteUrl?: string,
) {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${firstDue}T12:00:00Z`));
  const summary =
    count === 1
      ? "You have an upcoming payment reminder."
      : `You have ${count} upcoming payment reminders.`;
  let link: string | null = null;
  try {
    const url = new URL(siteUrl ?? "");
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      link = new URL("/recurring", url.origin).href;
  } catch {
    /* The reminder is still useful when the host has not set a URL. */
  }
  const detail = `${count === 1 ? "The payment is" : "The next payment is"} due ${date}. Open Marten to review your schedules and statements, and mark anything you’ve already paid.`;
  const footer =
    "You enabled payment reminders in Marten. Manage them in Settings → Preferences → Reminders. This reminder does not make a payment.";
  return {
    subject: "Your Marten payment reminder",
    textContent: `${summary}\n\n${detail}\n\n${link ? `Open Marten: ${link}\n\n` : ""}${footer}`,
    htmlContent: emailFrame(
      `<h1 style="font-size:24px;line-height:1.3">${summary}</h1><p style="font-size:15px;line-height:1.6;color:#66615b">${detail}</p>${link ? `<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#356587;color:white;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Review reminders</a></p>` : ""}<p style="font-size:12px;line-height:1.6;color:#77746f;border-top:1px solid #e9e6e2;padding-top:20px">${footer}</p>`,
    ),
  };
}

export function reminderVerificationContent(code: string) {
  return {
    subject: "Verify your email for Marten reminders",
    textContent: `Your Marten reminder verification code is ${code}.\n\nEnter it in Marten within 15 minutes to enable payment reminders. If you did not request this, ignore this email. Reminders have not been enabled.`,
    htmlContent: emailFrame(
      `<h1 style="font-size:24px">Enable email reminders</h1><p style="font-size:15px;line-height:1.6;color:#66615b">Enter this code in Marten to verify your email and enable payment reminders.</p><div style="font-size:32px;letter-spacing:6px;font-weight:600;background:#f6f5f3;padding:20px;text-align:center;border-radius:8px;margin:24px 0">${escapeHtml(code)}</div><p style="font-size:13px;line-height:1.6;color:#77746f">This code expires in 15 minutes. If you didn’t request it, ignore this email. Reminders have not been enabled.</p>`,
    ),
  };
}

export async function sendReminderEmail(
  email: string,
  content: { subject: string; textContent: string; htmlContent: string },
  idempotencyKey: string,
) {
  const key = process.env.AUTH_BREVO_KEY,
    sender = process.env.AUTH_EMAIL_FROM;
  if (!key || !sender)
    throw new ConvexError("Email reminders are not available on this server.");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Marten", email: sender },
      to: [{ email }],
      ...content,
      headers: { idempotencyKey },
      tags: ["marten-payment-reminders"],
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  // Acceptance by Brevo is not proof of inbox delivery. No provider diagnostics,
  // keys, codes or recipient addresses are included in returned errors or logs.
  if (!response?.ok)
    throw new ConvexError(
      "We couldn’t confirm email delivery. Please try again later.",
    );
}
