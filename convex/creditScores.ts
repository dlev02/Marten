import type { UserRead } from "./lib/access";
import { ConvexError, v } from "convex/values";
import schema from "./schema";
import { date, owned, text, userMutation, userQuery } from "./lib/access";
import { creditScoreFields } from "./lib/creditScores";

export async function creditScoresForUser(ctx: UserRead) {
  const rows = await ctx.db
    .query("creditScores")
    .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
    .order("desc")
    .take(1001);
  if (rows.length > 1000)
    throw new ConvexError("This score history exceeds the supported limit.");
  return rows;
}
export const list = userQuery({
  args: {},
  returns: v.array(schema.doc("creditScores")),
  handler: creditScoresForUser,
});

export const save = userMutation({
  args: { id: v.optional(v.id("creditScores")), ...creditScoreFields },
  returns: v.id("creditScores"),
  handler: async (ctx, { id, ...value }) => {
    if (id) await owned(ctx, id);
    if (
      !Number.isInteger(value.score) ||
      value.score < 300 ||
      value.score > 850
    )
      throw new ConvexError("Enter a whole-number score from 300 to 850.");
    date(value.date);
    if (
      value.date < "1900-01-01" ||
      value.date > new Date().toISOString().slice(0, 10)
    )
      throw new ConvexError(
        "Choose the date the score was reported, up to today.",
      );
    value.source = text(value.source, 100);
    const duplicate = await ctx.db
      .query("creditScores")
      .withIndex("by_userId_and_bureau_and_model_and_date", (q) =>
        q
          .eq("userId", ctx.userId)
          .eq("bureau", value.bureau)
          .eq("model", value.model)
          .eq("date", value.date),
      )
      .unique();
    if (duplicate && duplicate._id !== id)
      throw new ConvexError(
        "This bureau and model already have a score for that date. Edit the existing entry.",
      );
    if (id) {
      await ctx.db.patch(id, { ...value, updatedAt: Date.now() });
      return id;
    }
    const rows = await ctx.db
      .query("creditScores")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
      .take(1000);
    if (rows.length >= 1000)
      throw new ConvexError("Use up to 1,000 credit-score observations.");
    return await ctx.db.insert("creditScores", {
      ...value,
      userId: ctx.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = userMutation({
  args: { id: v.id("creditScores") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.delete(id);
    return null;
  },
});
