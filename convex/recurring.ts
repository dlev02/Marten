import type { UserRead, UserMutationCtx } from "./lib/access";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import type { PaginationOptions } from "convex/server";
import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  userQuery,
  userMutation,
  owned,
  date,
  cents,
  text,
} from "./lib/access";
import {
  recurringFields as fields,
  statementReminderFields,
} from "./validators";
import { recurringDates } from "./lib/finance";
import {
  detectRecurringPatterns,
  RECURRING_PROPOSAL_LIMIT,
} from "./lib/recurringDetection";

const recurringInput = v.object(fields);
export async function saveRecurringForUser(
  ctx: UserMutationCtx,
  { id, ...value }: { id?: Id<"recurring"> } & Infer<typeof recurringInput>,
) {
  await Promise.all([
    owned(ctx, value.merchantId),
    owned(ctx, value.accountId),
    owned(ctx, value.categoryId),
  ]);
  cents(value.amountCents);
  if (value.amountCents === 0)
    throw new ConvexError("Enter an amount greater than zero.");
  if (value.name !== undefined) value.name = text(value.name, 120);
  if (value.statementContains !== undefined)
    value.statementContains = value.statementContains.trim();
  if ((value.statementContains?.length ?? 0) > 240)
    throw new ConvexError("Keep the statement filter under 240 characters.");
  const tolerance = value.amountToleranceCents ?? 0;
  cents(tolerance);
  if (tolerance < 0 || tolerance > Math.abs(value.amountCents))
    throw new ConvexError(
      "Amount tolerance must be between zero and the scheduled amount.",
    );
  date(value.nextDate);
  if (value.note.length > 5000)
    throw new ConvexError("Keep notes under 5,000 characters.");
  if (id) {
    await owned(ctx, id);
    await ctx.db.patch(id, value);
    return id;
  }
  const existing = await ctx.db
    .query("recurring")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(500);
  if (existing.length >= 500)
    throw new ConvexError("Use up to 500 recurring schedules.");
  return await ctx.db.insert("recurring", { userId: ctx.userId, ...value });
}
export const save = userMutation({
  args: { id: v.optional(v.id("recurring")), ...fields },
  returns: v.id("recurring"),
  handler: saveRecurringForUser,
});

export const saveStatementReminder = userMutation({
  args: { accountId: v.id("accounts"), ...statementReminderFields },
  returns: v.null(),
  handler: async (ctx, { accountId, ...value }) => {
    const account = await owned(ctx, accountId);
    if (account.kind !== "credit" || account.closed)
      throw new ConvexError("Choose an open credit-card account.");
    date(value.dueDate);
    for (const amount of [value.statementCents, value.minimumCents])
      if (amount !== undefined) {
        cents(amount);
        if (amount < 0)
          throw new ConvexError("Enter a nonnegative reminder amount.");
      }
    if (
      value.statementCents !== undefined &&
      value.minimumCents !== undefined &&
      value.minimumCents > value.statementCents
    )
      throw new ConvexError(
        "The minimum payment cannot exceed the statement amount.",
      );
    await ctx.db.patch(accountId, {
      statementReminder: { ...value, updatedAt: Date.now() },
    });
    return null;
  },
});

export const clearStatementReminder = userMutation({
  args: { accountId: v.id("accounts") },
  returns: v.null(),
  handler: async (ctx, { accountId }) => {
    await owned(ctx, accountId);
    await ctx.db.patch(accountId, { statementReminder: undefined });
    return null;
  },
});
export const setStatementPaid = userMutation({
  args: { accountId: v.id("accounts"), dueDate: v.string(), paid: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { accountId, dueDate, paid }) => {
    const account = await owned(ctx, accountId);
    date(dueDate);
    if (
      (account.kind !== "credit" && account.kind !== "loan") ||
      (account.statementReminder?.dueDate ?? account.dueDate) !== dueDate
    )
      throw new ConvexError("Choose the current statement due date.");
    await ctx.db.patch(accountId, {
      statementPaidDate: paid ? dueDate : undefined,
    });
    return null;
  },
});
export const remove = userMutation({
  args: { id: v.id("recurring") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.recurring.clearPayments, {
      recurringId: id,
    });
    return null;
  },
});
export const clearPayments = internalMutation({
  args: { recurringId: v.id("recurring") },
  returns: v.null(),
  handler: async (ctx, { recurringId }) => {
    const rows = await ctx.db
      .query("recurringPayments")
      .withIndex("by_recurringId_and_date", (q) =>
        q.eq("recurringId", recurringId),
      )
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.recurring.clearPayments, {
        recurringId,
      });
    return null;
  },
});
export async function setRecurringPaidForUser(
  ctx: UserMutationCtx,
  args: { recurringId: Id<"recurring">; date: string; paid: boolean },
) {
  const recurring = await owned(ctx, args.recurringId);
  date(args.date);
  if (
    !recurringDates(
      recurring.nextDate,
      recurring.frequency,
      args.date,
      args.date,
    ).includes(args.date)
  )
    throw new ConvexError("Choose a scheduled occurrence.");
  const payment = await ctx.db
    .query("recurringPayments")
    .withIndex("by_recurringId_and_date", (q) =>
      q.eq("recurringId", args.recurringId).eq("date", args.date),
    )
    .unique();
  if (payment) await ctx.db.patch(payment._id, { paid: args.paid });
  else
    await ctx.db.insert("recurringPayments", { ...args, userId: ctx.userId });
  return null;
}
export const setPaid = userMutation({
  args: { recurringId: v.id("recurring"), date: v.string(), paid: v.boolean() },
  returns: v.null(),
  handler: setRecurringPaidForUser,
});
export async function recurringPaymentsForUser(
  ctx: UserRead,
  {
    from,
    to,
    paginationOpts,
  }: { from: string; to: string; paginationOpts: PaginationOptions },
) {
  date(from);
  date(to);
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000)
    throw new ConvexError("Choose up to one year.");
  if (paginationOpts.numItems > 200)
    throw new ConvexError("Load at most 200 payments at a time.");
  return await ctx.db
    .query("recurringPayments")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", ctx.userId).gte("date", from).lte("date", to),
    )
    .paginate(paginationOpts);
}
export const payments = userQuery({
  args: {
    from: v.string(),
    to: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("recurringPayments")),
  handler: recurringPaymentsForUser,
});
const proposal = v.object({
  ...fields,
  confidence: v.union(v.literal("high"), v.literal("medium")),
  occurrences: v.number(),
  firstDate: v.string(),
  lastDate: v.string(),
});
export async function detectRecurringForUser(
  ctx: UserRead,
  { now }: { now: number },
) {
  const txs = await ctx.db
    .query("transactions")
    .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
    .order("desc")
    .take(2001);
  const current = await ctx.db
    .query("recurring")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(501);
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(501);
  const groups = await ctx.db
    .query("groups")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(201);
  const transfers = new Set(
    groups
      .filter((group) => group.kind === "transfer")
      .map((group) => group._id),
  );
  const eligibleCategories = new Set(
    categories
      .filter((category) => !transfers.has(category.groupId))
      .map((category) => category._id),
  );
  const proposals = detectRecurringPatterns(
    txs.slice(0, 2000).filter((tx) => eligibleCategories.has(tx.categoryId)),
    current,
    new Date(now).toISOString().slice(0, 10),
  );
  return {
    proposals,
    complete:
      // Reaching the cap stops detection before it can rule out more patterns.
      proposals.length < RECURRING_PROPOSAL_LIMIT &&
      txs.length <= 2000 &&
      current.length <= 500 &&
      categories.length <= 500 &&
      groups.length <= 200,
  };
}
export const detect = userQuery({
  args: { now: v.number() },
  returns: v.object({ proposals: v.array(proposal), complete: v.boolean() }),
  handler: detectRecurringForUser,
});
