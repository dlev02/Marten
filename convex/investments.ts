import type { PaginationOptions } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { userMutation, userQuery, owned, date } from "./lib/access";
import { seedInvestmentSample } from "./lib/investmentSample";

const accountFilter = { accountId: v.optional(v.id("accounts")) };
type Read = QueryCtx & { userId: Id<"users"> };
async function investmentAccounts(ctx: Read, accountId?: Id<"accounts">) {
  if (accountId) {
    const account = await owned(ctx, accountId);
    if (account.kind !== "investment")
      throw new ConvexError("Choose an investment account.");
  }
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(201);
  if (accounts.length > 200)
    throw new ConvexError(
      "This workspace has too many accounts to load safely.",
    );
  const all = accounts.filter((account) => account.kind === "investment");
  return {
    all,
    selected: all.filter((account) =>
      accountId
        ? account._id === accountId
        : !account.closed && !account.hidden,
    ),
  };
}
const connection = v.object({
  itemId: v.id("plaidItems"),
  institution: v.string(),
  status: v.union(
    v.literal("connected"),
    v.literal("syncing"),
    v.literal("error"),
    v.literal("disconnected"),
  ),
  syncedAt: v.union(v.number(), v.null()),
  historyFrom: v.union(v.string(), v.null()),
  historyTo: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
});
export async function investmentOverviewForUser(
  ctx: Read,
  args: { accountId?: Id<"accounts"> },
) {
  const { all, selected } = await investmentAccounts(ctx, args.accountId);
  const selectedIds = new Set(selected.map((account) => account._id));
  const rows = args.accountId
    ? await ctx.db
        .query("investmentHoldings")
        .withIndex("by_userId_and_accountId", (q) =>
          q.eq("userId", ctx.userId).eq("accountId", args.accountId!),
        )
        .take(1001)
    : await ctx.db
        .query("investmentHoldings")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(1001);
  if (rows.length > 1000)
    throw new ConvexError("Choose one account to view up to 1,000 holdings.");
  const holdings = rows.filter((row) => selectedIds.has(row.accountId));
  const securityIds = [...new Set(holdings.map((row) => row.securityId))];
  const securityRows = await Promise.all(
    securityIds.map((id) => ctx.db.get(id)),
  );
  if (securityRows.some((row) => row && row.userId !== ctx.userId))
    throw new ConvexError("These security details are unavailable.");
  const securities = new Map(
    securityRows.filter((row) => row !== null).map((row) => [row._id, row]),
  );
  const itemIds = [
    ...new Set(
      selected.flatMap((account) => (account.itemId ? [account.itemId] : [])),
    ),
  ];
  const connections = await Promise.all(
    itemIds.map(async (id) => {
      const item = await owned(ctx, id);
      const state = await ctx.db
        .query("investmentSyncStates")
        .withIndex("by_itemId", (q) => q.eq("itemId", id))
        .unique();
      return {
        itemId: id,
        institution: item.institution,
        status: item.status,
        syncedAt: state?.syncedAt ?? null,
        historyFrom: state?.historyFrom ?? null,
        historyTo: state?.historyTo ?? null,
        error: state?.error ?? item.error ?? null,
      };
    }),
  );
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .unique();
  return {
    accounts: all,
    connections,
    demo: profile?.demo ?? false,
    holdings: holdings.map((row) => ({
      ...row,
      security: securities.get(row.securityId) ?? null,
    })),
  };
}
export const overview = userQuery({
  args: accountFilter,
  returns: v.object({
    accounts: v.array(schema.doc("accounts")),
    holdings: v.array(
      schema.doc("investmentHoldings").extend({
        security: v.union(schema.doc("investmentSecurities"), v.null()),
      }),
    ),
    connections: v.array(connection),
    demo: v.boolean(),
  }),
  handler: investmentOverviewForUser,
});

export async function investmentActivityForUser(
  ctx: Read,
  args: {
    accountId?: Id<"accounts">;
    from: string;
    to: string;
    paginationOpts: PaginationOptions;
  },
) {
  date(args.from);
  date(args.to);
  if (args.from > args.to) throw new ConvexError("Choose a valid date range.");
  if (args.paginationOpts.numItems > 100)
    throw new ConvexError("Load up to 100 investment events at a time.");
  const { selected } = await investmentAccounts(ctx, args.accountId);
  const selectedIds = new Set(selected.map((row) => row._id));
  const result = args.accountId
    ? await ctx.db
        .query("investmentTransactions")
        .withIndex("by_userId_and_accountId_and_date", (q) =>
          q
            .eq("userId", ctx.userId)
            .eq("accountId", args.accountId!)
            .gte("date", args.from)
            .lte("date", args.to),
        )
        .order("desc")
        .paginate(args.paginationOpts)
    : await ctx.db
        .query("investmentTransactions")
        .withIndex("by_userId_and_date", (q) =>
          q
            .eq("userId", ctx.userId)
            .gte("date", args.from)
            .lte("date", args.to),
        )
        .order("desc")
        .paginate(args.paginationOpts);
  return {
    ...result,
    page: result.page.filter(
      (row) => !row.removed && selectedIds.has(row.accountId),
    ),
  };
}
export const activity = userQuery({
  args: {
    ...accountFilter,
    from: v.string(),
    to: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("investmentTransactions")),
  handler: investmentActivityForUser,
});

export const history = userQuery({
  args: { ...accountFilter, from: v.string(), to: v.string() },
  returns: v.object({
    points: v.array(v.object({ date: v.string(), value: v.number() })),
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    date(args.from);
    date(args.to);
    if (args.from > args.to)
      throw new ConvexError("Choose a valid date range.");
    const { selected } = await investmentAccounts(ctx, args.accountId);
    const accounts = selected.filter((account) => account.currency === "USD");
    if (!accounts.length) return { points: [], complete: true };
    const latest = new Map<Id<"accounts">, number>();
    const changes = new Map<
      string,
      { accountId: Id<"accounts">; balanceCents: number }[]
    >();
    let loaded = 0;
    for (const account of accounts) {
      const before = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q.eq("accountId", account._id).lt("date", args.from),
        )
        .order("desc")
        .first();
      if (before) latest.set(account._id, before.balanceCents);
      const rows = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q
            .eq("accountId", account._id)
            .gte("date", args.from)
            .lte("date", args.to),
        )
        .take(12001 - loaded);
      loaded += rows.length;
      if (loaded > 12000) return { points: [], complete: false };
      for (const row of rows) {
        const day = changes.get(row.date) ?? [];
        day.push(row);
        changes.set(row.date, day);
      }
    }
    const points: { date: string; value: number }[] = [];
    if (latest.size === accounts.length && !changes.has(args.from))
      points.push({
        date: args.from,
        value: [...latest.values()].reduce((sum, value) => sum + value, 0),
      });
    for (const [day, rows] of [...changes].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      for (const row of rows) latest.set(row.accountId, row.balanceCents);
      // A growing subset of accounts must not masquerade as portfolio growth.
      if (latest.size === accounts.length)
        points.push({
          date: day,
          value: [...latest.values()].reduce((sum, value) => sum + value, 0),
        });
    }
    return { points, complete: true };
  },
});

export const sync = userMutation({
  args: accountFilter,
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    if (!user || user.isAnonymous)
      throw new ConvexError(
        "Create an account before syncing a bank. The public demo cannot access real bank data.",
      );
    const { selected } = await investmentAccounts(ctx, args.accountId);
    const itemIds = [
      ...new Set(
        selected.flatMap((account) => (account.itemId ? [account.itemId] : [])),
      ),
    ];
    let scheduled = 0;
    for (const itemId of itemIds) {
      const item = await owned(ctx, itemId);
      if (item.status === "disconnected" || item.status === "syncing") continue;
      await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
      scheduled++;
    }
    if (!scheduled)
      throw new ConvexError(
        "Connect an investment account, or wait for its current sync to finish.",
      );
    return scheduled;
  },
});

export const prepareSample = userMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (!profile?.demo)
      throw new ConvexError(
        "Sample holdings are only available in a sample workspace.",
      );
    await seedInvestmentSample(ctx);
    return null;
  },
});
