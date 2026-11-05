import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyWebhook } from "./lib/plaidApi";
import { addAgentRoutes } from "./agentHttp";
import { upload } from "./imports";
import { receipt, preflight } from "./files";
import { hashSecret, readBoundedBody } from "./lib/agentAuth";
const http = httpRouter();
auth.addHttpRoutes(http);
addAgentRoutes(http);
http.route({ path: "/imports/upload", method: "POST", handler: upload });
http.route({ path: "/imports/upload", method: "OPTIONS", handler: preflight });
http.route({ path: "/receipts", method: "GET", handler: receipt });
http.route({ path: "/receipts", method: "OPTIONS", handler: preflight });
http.route({
  path: "/plaid/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("plaid-verification");
    if (!signature || signature.length > 10000)
      return new Response("Unauthorized", { status: 401 });
    if (Number(request.headers.get("content-length")) > 100000)
      return new Response("Too large", { status: 413 });
    // The closest proxy hop is preferable to a caller-prepended XFF value.
    const address =
      request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
      "unknown";
    if (
      !(await ctx.runMutation(internal.providerSecurity.webhookBudget, {
        address: hashSecret(address.slice(0, 100)),
      }))
    )
      return new Response("Too many requests", { status: 429 });
    let body: string;
    try {
      body = await readBoundedBody(request.body, 100000);
    } catch {
      return new Response("Too large", { status: 413 });
    }
    if (!(await verifyWebhook(signature, body)))
      return new Response("Unauthorized", { status: 401 });
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("item_id" in data) ||
      typeof data.item_id !== "string" ||
      !("webhook_code" in data) ||
      typeof data.webhook_code !== "string"
    )
      return new Response("Invalid webhook", { status: 400 });
    const error = "error" in data ? data.error : null;
    const errorCode =
      error &&
      typeof error === "object" &&
      "error_code" in error &&
      typeof error.error_code === "string"
        ? error.error_code
        : undefined;
    await ctx.runMutation(internal.plaidInternal.webhook, {
      plaidItemId: data.item_id,
      code: data.webhook_code,
      ...(errorCode ? { errorCode } : {}),
    });
    return new Response(null, { status: 200 });
  }),
});
export default http;
