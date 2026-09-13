import {
  automaticPaymentsForUser,
  mergePaymentStatus,
} from "./lib/recurringPayments";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/access";
import {
  addCalendarDays,
  defaultReminderPreferences,
  dueReminders,
  localReminderTime,
  validReminderTiming,
} from "./lib/reminders";

const timingFields = {
  daysBefore: v.number(),
  timeMinutes: v.number(),
  timeZone: v.string(),
};
const deliveryBatch = v.object({
  ids: v.array(v.id("reminderDeliveries")),
  batchId: v.string(),
  count: v.number(),
  firstDue: v.string(),
});
const preferencesFor = (ctx: Pick<QueryCtx, "db">, userId: Id<"users">) =>
  ctx.db
    .query("reminderPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
async function recipient(ctx: Pick<QueryCtx, "db">, userId: Id<"users">) {
  const [user, profile] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  ]);
  return user && !user.isAnonymous && profile && !profile.demo ? user : null;
}

export const settings = userQuery({
  args: {},
  returns: v.object({
    ...timingFields,
    eligible: v.boolean(),
    emailAvailable: v.boolean(),
    emailEnabled: v.boolean(),
    email: v.union(v.string(), v.null()),
    emailVerified: v.boolean(),
    verificationPending: v.boolean(),
    lastEmailStatus: v.union(v.string(), v.null()),
    lastBrowserStatus: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const [preferences, user, verification, last, lastBrowser] =
      await Promise.all([
        preferencesFor(ctx, ctx.userId),
        recipient(ctx, ctx.userId),
        ctx.db
          .query("reminderEmailVerifications")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .unique(),
        ctx.db
          .query("reminderDeliveries")
          .withIndex("by_userId_and_channel_and_claimedAt", (q) =>
            q.eq("userId", ctx.userId).eq("channel", "email"),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("reminderDeliveries")
          .withIndex("by_userId_and_channel_and_claimedAt", (q) =>
            q.eq("userId", ctx.userId).eq("channel", "browser"),
          )
          .order("desc")
          .first(),
      ]);
    return {
      daysBefore:
        preferences?.daysBefore ?? defaultReminderPreferences.daysBefore,
      timeMinutes:
        preferences?.timeMinutes ?? defaultReminderPreferences.timeMinutes,
      timeZone: preferences?.timeZone ?? defaultReminderPreferences.timeZone,
      eligible: !!user,
      emailAvailable: !!(
        process.env.AUTH_BREVO_KEY && process.env.AUTH_EMAIL_FROM
      ),
      emailEnabled:
        !!user?.email &&
        preferences?.verifiedEmail === user.email &&
        (preferences?.emailEnabled ?? false),
      email: user?.email ?? null,
      emailVerified: !!user?.email && preferences?.verifiedEmail === user.email,
      verificationPending:
        !!verification &&
        verification.expiresAt > Date.now() &&
        verification.attempts < 5,
      lastEmailStatus:
        last?.status === "claimed" && Date.now() - last.claimedAt > 5 * 60_000
          ? "unconfirmed"
          : (last?.status ?? null),
      lastBrowserStatus: lastBrowser?.status ?? null,
    };
  },
});

export const saveSettings = userMutation({
  args: { ...timingFields, emailEnabled: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!validReminderTiming(args))
      throw new ConvexError("Choose a valid reminder time and time zone.");
    const preferences = await preferencesFor(ctx, ctx.userId);
    if (args.emailEnabled) {
      const user = await recipient(ctx, ctx.userId);
      if (!user?.email || preferences?.verifiedEmail !== user.email)
        throw new ConvexError(
          "Verify your sign-in email before enabling reminders.",
        );
      if (!process.env.AUTH_BREVO_KEY || !process.env.AUTH_EMAIL_FROM)
        throw new ConvexError(
          "Email reminders are not available on this server.",
        );
    }
    const value = {
      ...args,
      emailEnabled: args.emailEnabled ?? preferences?.emailEnabled ?? false,
      updatedAt: Date.now(),
    };
    if (preferences) await ctx.db.patch(preferences._id, value);
    else
      await ctx.db.insert("reminderPreferences", {
        ...value,
        userId: ctx.userId,
      });
    return null;
  },
});

export const reserveVerification = internalMutation({
  args: {
    userId: v.id("users"),
    codeHash: v.string(),
    purpose: v.optional(v.literal("plaid")),
  },
  returns: v.string(),
  handler: async (ctx, { userId, codeHash, purpose }) => {
    const user = await recipient(ctx, userId);
    if (!user?.email)
      throw new ConvexError(
        "Email reminders are available after you set up your own workspace.",
      );
    const now = Date.now();
    const existing = await ctx.db
      .query("reminderEmailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing && now - existing.sentAt < 60_000)
      throw new ConvexError(
        "Please wait a minute before requesting another code.",
      );
    const sameWindow = existing && now - existing.windowStartedAt < 3600_000;
    if (sameWindow && existing.requests >= 5)
      throw new ConvexError(
        "Please wait an hour before requesting more codes.",
      );
    const value = {
      userId,
      purpose,
      email: user.email,
      codeHash,
      expiresAt: now + 15 * 60_000,
      sentAt: now,
      attempts: 0,
      windowStartedAt: sameWindow ? existing.windowStartedAt : now,
      requests: sameWindow ? existing.requests + 1 : 1,
    };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("reminderEmailVerifications", value);
    return user.email;
  },
});

export const verifyCode = internalMutation({
  args: {
    userId: v.id("users"),
    codeHash: v.string(),
    purpose: v.optional(v.literal("plaid")),
  },
  returns: v.boolean(),
  handler: async (ctx, { userId, codeHash, purpose }) => {
    const user = await recipient(ctx, userId);
    const row = await ctx.db
      .query("reminderEmailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (
      !row ||
      !user?.email ||
      row.email !== user.email ||
      row.purpose !== purpose ||
      row.expiresAt <= Date.now() ||
      row.attempts >= 5
    )
      return false;
    await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
    if (row.codeHash !== codeHash) return false;
    // Both flows prove ownership of the current sign-in mailbox. Plaid verification
    // does not opt the user into reminder emails.
    await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
    if (purpose === "plaid") {
      await ctx.db.patch(row._id, { codeHash: "", expiresAt: 0 });
      return true;
    }
    const preferences = await preferencesFor(ctx, userId);
    const value = {
      verifiedEmail: user.email,
      emailEnabled: true,
      updatedAt: Date.now(),
    };
    if (preferences) await ctx.db.patch(preferences._id, value);
    else
      await ctx.db.insert("reminderPreferences", {
        userId,
        ...defaultReminderPreferences,
        ...value,
      });
    // Keep the rate window, but consume the code even if an action response is lost.
    await ctx.db.patch(row._id, { codeHash: "", expiresAt: 0 });
    return true;
  },
});

async function collectDue(
  ctx: MutationCtx,
  userId: Id<"users">,
  preferences: Doc<"reminderPreferences"> | null,
) {
  const timing = preferences ?? defaultReminderPreferences;
  const today = localReminderTime(Date.now(), timing.timeZone).date;
  const [accounts, schedules, payments] = await Promise.all([
    ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(201),
    ctx.db
      .query("recurring")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(501),
    ctx.db
      .query("recurringPayments")
      .withIndex("by_userId_and_date", (q) =>
        q
          .eq("userId", userId)
          .gte("date", today)
          .lte("date", addCalendarDays(today, timing.daysBefore)),
      )
      .take(1001),
  ]);
  if (accounts.length > 200 || schedules.length > 500 || payments.length > 1000)
    throw new ConvexError(
      "Your reminder data exceeds the supported workspace size.",
    );
  const automatic = await automaticPaymentsForUser(
    { ...ctx, userId },
    today,
    addCalendarDays(today, timing.daysBefore),
  );
  return dueReminders({
    accounts,
    schedules,
    paid: new Set(
      mergePaymentStatus(automatic, payments)
        .filter((p) => p.paid)
        .map((p) => `${p.recurringId}:${p.date}`),
    ),
    timing,
    now: Date.now(),
  });
}

async function claim(
  ctx: MutationCtx,
  userId: Id<"users">,
  channel: "browser" | "email",
  batchId: string,
) {
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(batchId))
    throw new ConvexError("Invalid reminder request.");
  const user = await recipient(ctx, userId);
  if (!user) return null;
  const preferences = await preferencesFor(ctx, userId);
  if (
    channel === "email" &&
    (!preferences?.emailEnabled ||
      !user.email ||
      preferences.verifiedEmail !== user.email)
  )
    return null;
  const candidates = await collectDue(ctx, userId, preferences);
  const ids: Id<"reminderDeliveries">[] = [];
  let firstDue = "";
  for (const candidate of candidates) {
    const existing = await ctx.db
      .query("reminderDeliveries")
      .withIndex("by_userId_and_channel_and_occurrenceKey", (q) =>
        q
          .eq("userId", userId)
          .eq("channel", channel)
          .eq("occurrenceKey", candidate.occurrenceKey),
      )
      .unique();
    // A durable claim gives at-most-once attempts even if the sender/tab dies.
    // Ambiguous delivery is surfaced in settings, never blindly re-sent.
    if (existing) continue;
    if (!firstDue) firstDue = candidate.dueDate;
    ids.push(
      await ctx.db.insert("reminderDeliveries", {
        userId,
        ...candidate,
        channel,
        status: "claimed",
        batchId,
        claimedAt: Date.now(),
      }),
    );
  }
  return ids.length
    ? { ids, batchId, count: ids.length, firstDue, email: user.email ?? null }
    : null;
}

export const claimBrowser = userMutation({
  args: { batchId: v.string() },
  returns: v.union(v.null(), deliveryBatch),
  handler: async (ctx, { batchId }) => {
    const result = await claim(ctx, ctx.userId, "browser", batchId);
    if (!result) return null;
    return {
      ids: result.ids,
      batchId: result.batchId,
      count: result.count,
      firstDue: result.firstDue,
    };
  },
});
export const claimEmail = internalMutation({
  args: { userId: v.id("users"), batchId: v.string() },
  returns: v.union(
    v.null(),
    deliveryBatch.extend({ email: v.union(v.string(), v.null()) }),
  ),
  handler: (ctx, { userId, batchId }) => claim(ctx, userId, "email", batchId),
});
const finishArgs = {
  ids: v.array(v.id("reminderDeliveries")),
  batchId: v.string(),
  status: v.union(
    v.literal("sent"),
    v.literal("failed"),
    v.literal("canceled"),
  ),
};
async function finishBatch(
  ctx: MutationCtx,
  args: {
    ids: Id<"reminderDeliveries">[];
    batchId: string;
    status: "sent" | "failed" | "canceled";
  },
  userId?: Id<"users">,
) {
  if (args.ids.length > 1200) throw new ConvexError("Too many reminders.");
  for (const id of args.ids) {
    const row = await ctx.db.get(id);
    if (
      !row ||
      row.batchId !== args.batchId ||
      row.status !== "claimed" ||
      (userId && (row.userId !== userId || row.channel !== "browser"))
    )
      continue;
    await ctx.db.patch(id, { status: args.status, completedAt: Date.now() });
  }
}
export const finishBrowser = userMutation({
  args: finishArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await finishBatch(ctx, args, ctx.userId);
    return null;
  },
});
export const finishEmail = internalMutation({
  args: finishArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await finishBatch(ctx, args);
    return null;
  },
});

export const sweep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    if (!process.env.AUTH_BREVO_KEY || !process.env.AUTH_EMAIL_FROM)
      return null;
    const page = await ctx.db
      .query("reminderPreferences")
      .withIndex("by_emailEnabled", (q) => q.eq("emailEnabled", true))
      .paginate({ cursor, numItems: 50 });
    for (const row of page.page)
      await ctx.scheduler.runAfter(0, internal.reminderDelivery.sendDue, {
        userId: row.userId,
      });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.reminders.sweep, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = addCalendarDays(
      new Date(Date.now()).toISOString().slice(0, 10),
      -32,
    );
    const old = await ctx.db
      .query("reminderDeliveries")
      .withIndex("by_dueDate", (q) => q.lt("dueDate", cutoff))
      .take(500);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === 500)
      await ctx.scheduler.runAfter(0, internal.reminders.cleanup, {});
    return null;
  },
});
