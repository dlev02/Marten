import { ConvexError, v } from "convex/values";
import { httpAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { owned, requireUser } from "./lib/access";
import { fileHeaders } from "./lib/fileHttp";

export const preflight = httpAction(async (_ctx, request) => {
  try {
    return new Response(null, { status: 204, headers: fileHeaders(request) });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
});

export const receiptForOwner = internalQuery({
  args: { userId: v.id("users"), id: v.string() },
  handler: async (ctx, { userId, id }) => {
    const attachmentId = ctx.db.normalizeId("attachments", id);
    if (!attachmentId) throw new ConvexError("Receipt unavailable.");
    return await owned({ ...ctx, userId }, attachmentId);
  },
});

/** No bearer URL: possession of the row ID alone never authorizes a download. */
export const receipt = httpAction(async (ctx, request) => {
  let headers: Headers;
  try {
    headers = fileHeaders(request);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const userId = await requireUser(ctx);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const row = await ctx.runQuery(internal.files.receiptForOwner, {
      userId,
      id,
    });
    const blob = await ctx.storage.get(row.storageId);
    if (!blob)
      return new Response("Receipt unavailable.", { status: 404, headers });
    headers.set("Content-Type", row.contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    );
    return new Response(blob, { headers });
  } catch {
    return new Response("Receipt unavailable. Sign in to its workspace.", {
      status: 404,
      headers,
    });
  }
});
