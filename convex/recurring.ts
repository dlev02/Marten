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
import { advanceDate, recurringDates } from "./lib/finance";
import type { Doc } from "./_generated/dataModel";
import { matchesRecurringCriteria } from "./lib/recurring";

export const save = userMutation({
  args: { id: v.optional(v.id("recurring")), ...fields },
  returns: v.id("recurring"),
  handler: async (ctx, { id, ...value }) => {
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
  },
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
export const setPaid = userMutation({
  args: { recurringId: v.id("recurring"), date: v.string(), paid: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
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
  },
});
export const payments = userQuery({
  args: {
    from: v.string(),
    to: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("recurringPayments")),
  handler: async (ctx, { from, to, paginationOpts }) => {
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
  },
});
const proposal = v.object({
  ...fields,
  confidence: v.union(v.literal("high"), v.literal("medium")),
  occurrences: v.number(),
});
export const detect = userQuery({
  args: {},
  returns: v.object({ proposals: v.array(proposal), complete: v.boolean() }),
  handler: async (ctx) => {
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(2001);
    const current = await ctx.db
      .query("recurring")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(501);
    const groups = new Map<string, Doc<"transactions">[]>();
    for (const tx of txs.slice(0, 2000)) {
      if (
        tx.hidden ||
        tx.pending ||
        ("removedFromBank" in tx && tx.removedFromBank)
      )
        continue;
      const key = `${tx.merchantId}:${tx.accountId}`;
      const rows = groups.get(key) ?? [];
      rows.push(tx);
      groups.set(key, rows);
    }
    const proposals: Array<typeof proposal.type> = [];
    for (const rows of groups.values()) {
      if (rows.length < 3) continue;
      // Inspect each amount pattern, not just the merchant's most recent purchase.
      // Exact subscriptions take priority over a variable-bill fallback.
      const amounts = new Map<number, Doc<"transactions">[]>();
      for (const row of rows) {
        const sameAmount = amounts.get(row.amountCents) ?? [];
        sameAmount.push(row);
        amounts.set(row.amountCents, sameAmount);
      }
      for (const exact of [...amounts.values()].sort(
        (a, b) => b.length - a.length,
      )) {
        const latest = exact[0];
        if (
          latest.amountCents === 0 ||
          [...current, ...proposals].some((r) =>
            matchesRecurringCriteria(r, latest),
          )
        )
          continue;
        const category = await owned(ctx, latest.categoryId);
        const group = await owned(ctx, category.groupId);
        if (group.kind === "transfer") continue;
        const candidates =
          exact.length >= 3
            ? exact
            : rows.filter(
                (r) =>
                  Math.sign(r.amountCents) === Math.sign(latest.amountCents) &&
                  Math.abs(r.amountCents - latest.amountCents) <=
                    Math.max(100, Math.abs(latest.amountCents) * 0.08) &&
                  ![...current, ...proposals].some((schedule) =>
                    matchesRecurringCriteria(schedule, r),
                  ),
              );
        const similar = [
          ...new Map(candidates.map((row) => [row.date, row])).values(),
        ];
        if (similar.length < 3) continue;
        const intervals = similar
          .slice(0, -1)
          .map(
            (r, i) =>
              (Date.parse(r.date) - Date.parse(similar[i + 1].date)) / 86400000,
          )
          .filter((n) => n > 0);
        if (intervals.length < 2) continue;
        const sorted = [...intervals].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const frequency: Doc<"recurring">["frequency"] | null =
          median >= 6 && median <= 8
            ? "weekly"
            : median >= 12 && median <= 16
              ? "biweekly"
              : median >= 26 && median <= 35
                ? "monthly"
                : median >= 80 && median <= 100
                  ? "quarterly"
                  : median >= 350 && median <= 380
                    ? "yearly"
                    : null;
        if (
          !frequency ||
          intervals.filter((n) => Math.abs(n - median) <= median * 0.2).length /
            intervals.length <
            0.7
        )
          continue;
        proposals.push({
          merchantId: latest.merchantId,
          accountId: latest.accountId,
          categoryId: latest.categoryId,
          amountCents: latest.amountCents,
          amountToleranceCents: Math.max(
            ...similar.map((row) =>
              Math.abs(row.amountCents - latest.amountCents),
            ),
          ),
          frequency,
          nextDate: advanceDate(similar[0].date, frequency),
          active: true,
          source: "detected",
          note: "Suggested from transaction history. Confirm the amount and schedule.",
          confidence: similar.length >= 5 ? "high" : "medium",
          occurrences: similar.length,
        });
        if (proposals.length >= 100) break;
      }
      if (proposals.length >= 100) break;
    }
    return {
      proposals: proposals.slice(0, 100),
      complete: txs.length <= 2000 && current.length <= 500,
    };
  },
});
