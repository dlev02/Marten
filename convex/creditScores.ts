import type { UserMutationCtx, UserRead } from "./lib/access";
import { ConvexError, v, type Infer } from "convex/values";
import schema from "./schema";
import { date, owned, text, userMutation, userQuery } from "./lib/access";
import { creditScoreFields } from "./lib/creditScores";
import type { Doc } from "./_generated/dataModel";
import { writerStamp, type AgentActor } from "./lib/agentActor";

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

const scoreObject = v.object(creditScoreFields);
type ScoreValue = Infer<typeof scoreObject>;
/** Score, date and source checks shared by the form and AI connections. */
function checkScore(value: ScoreValue): ScoreValue {
  if (!Number.isInteger(value.score) || value.score < 300 || value.score > 850)
    throw new ConvexError("Enter a whole-number score from 300 to 850.");
  date(value.date);
  if (
    value.date < "1900-01-01" ||
    value.date > new Date().toISOString().slice(0, 10)
  )
    throw new ConvexError(
      "Choose the date the score was reported, up to today.",
    );
  return { ...value, source: text(value.source, 100) };
}
function sameObservation(
  ctx: UserRead,
  value: Pick<ScoreValue, "bureau" | "model" | "date">,
) {
  return ctx.db
    .query("creditScores")
    .withIndex("by_userId_and_bureau_and_model_and_date", (q) =>
      q
        .eq("userId", ctx.userId)
        .eq("bureau", value.bureau)
        .eq("model", value.model)
        .eq("date", value.date),
    )
    .unique();
}
async function insertScore(
  ctx: UserMutationCtx,
  value: ScoreValue,
  writtenBy?: Doc<"creditScores">["writtenBy"],
) {
  const rows = await ctx.db
    .query("creditScores")
    .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
    .take(1000);
  if (rows.length >= 1000)
    throw new ConvexError("Use up to 1,000 credit-score observations.");
  return await ctx.db.insert("creditScores", {
    ...value,
    ...(writtenBy ? { writtenBy } : {}),
    userId: ctx.userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export const save = userMutation({
  args: { id: v.optional(v.id("creditScores")), ...creditScoreFields },
  returns: v.id("creditScores"),
  handler: async (ctx, { id, ...input }) => {
    if (id) await owned(ctx, id);
    // Saving from the form makes it the owner's entry, even when an
    // assistant added it first.
    const value = checkScore({
      ...input,
      entryMethod: input.entryMethod === "agent" ? "manual" : input.entryMethod,
    });
    const duplicate = await sameObservation(ctx, value);
    if (duplicate && duplicate._id !== id)
      throw new ConvexError(
        "This bureau and model already have a score for that date. Edit the existing entry.",
      );
    if (id) {
      await ctx.db.patch(id, {
        ...value,
        writtenBy: undefined,
        updatedAt: Date.now(),
      });
      return id;
    }
    return await insertScore(ctx, value);
  },
});

/**
 * An assistant relaying a score upserts on (bureau, model, date), so a
 * scheduled task can run again without creating duplicates. A score the owner
 * entered or reviewed from a PDF is never replaced by a different relayed one.
 */
export async function saveAgentCreditScore(
  ctx: UserMutationCtx,
  actor: AgentActor,
  input: Omit<ScoreValue, "entryMethod" | "source"> & { source?: string },
) {
  const value = checkScore({
    ...input,
    source: input.source?.trim() || actor.name,
    entryMethod: "agent",
  });
  const existing = await sameObservation(ctx, value);
  if (!existing)
    return {
      status: "created" as const,
      id: await insertScore(ctx, value, writerStamp(actor)),
      before: null,
    };
  const ownEntry = existing.entryMethod !== "agent";
  if (
    existing.score === value.score &&
    (ownEntry || existing.source === value.source)
  )
    return { status: "unchanged" as const, id: existing._id, before: existing };
  if (ownEntry)
    return {
      status: "refused" as const,
      id: existing._id,
      before: existing,
      reason: `A ${existing.entryMethod === "pdf" ? "reviewed PDF" : "manually entered"} score of ${existing.score} is already saved for this bureau, model and date. It was left unchanged; ask the user which is right.`,
    };
  await ctx.db.patch(existing._id, {
    score: value.score,
    source: value.source,
    writtenBy: writerStamp(actor),
    updatedAt: Date.now(),
  });
  return { status: "updated" as const, id: existing._id, before: existing };
}

export const remove = userMutation({
  args: { id: v.id("creditScores") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.delete(id);
    return null;
  },
});
