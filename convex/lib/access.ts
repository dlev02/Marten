import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import {
  customQuery,
  customMutation,
  customAction,
} from "convex-helpers/server/customFunctions";
import {
  query,
  mutation,
  action,
  type QueryCtx,
  type MutationCtx,
  type ActionCtx,
} from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Id, Doc, TableNames } from "../_generated/dataModel";
export type UserRead = QueryCtx & { userId: Id<"users"> };
export type UserMutationCtx = MutationCtx & { userId: Id<"users"> };
const SIGNED_OUT = "Please sign in to continue.";
/**
 * Verifies the caller's token and that its session still exists. A password
 * reset or account deletion removes session rows, so a token that is still
 * within its lifetime stops working immediately rather than at expiry.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError(SIGNED_OUT);
  // Convex Auth signs "userId|sessionId" into every token it issues. Test
  // identities that carry only a user id have no session to check.
  const sessionId = await getAuthSessionId(ctx);
  if (!sessionId) return userId;
  const alive =
    "db" in ctx
      ? (await ctx.db.get(sessionId)) !== null
      : await ctx.runQuery(internal.sessions.isActive, { sessionId });
  if (!alive)
    throw new ConvexError("Your session ended. Please sign in again.");
  return userId;
}
const authContext = {
  args: {},
  input: async (ctx: QueryCtx | MutationCtx | ActionCtx) => ({
    ctx: { userId: await requireUser(ctx) },
    args: {},
  }),
};
export const userQuery = customQuery(query, authContext);
export const userMutation = customMutation(mutation, authContext);
export const userAction = customAction(action, authContext);
export async function owned<T extends TableNames>(
  ctx: Pick<QueryCtx, "db"> & { userId: Id<"users"> },
  id: Id<T>,
): Promise<Doc<T>> {
  const row = await ctx.db.get(id);
  if (!row || !("userId" in row) || row.userId !== ctx.userId)
    throw new ConvexError("This item is unavailable.");
  return row;
}
export function text(value: string, max = 120) {
  const clean = value.trim();
  if (!clean || clean.length > max)
    throw new ConvexError(`Enter between 1 and ${max} characters.`);
  return clean;
}
export function cents(value: number) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 1e13)
    throw new ConvexError(
      "Enter a valid amount with no more than two decimal places.",
    );
  return value;
}
export function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new ConvexError("Enter a valid date.");
  return value;
}
