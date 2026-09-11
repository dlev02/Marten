import { getAuthUserId } from "@convex-dev/auth/server";
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
export async function requireUser(ctx: Pick<QueryCtx | ActionCtx, "auth">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Please sign in to continue.");
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
