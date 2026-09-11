import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyWebhook } from "./lib/plaidApi";
const http = httpRouter();
auth.addHttpRoutes(http);
http.route({
  path: "/plaid/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("plaid-verification");
    if (!signature || signature.length > 10000)
      return new Response("Unauthorized", { status: 401 });
    const body = await request.text();
    if (body.length > 100000 || !(await verifyWebhook(signature, body)))
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
