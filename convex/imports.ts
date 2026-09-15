import { ConvexError, v, type Infer } from "convex/values";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { userMutation, userQuery, text } from "./lib/access";
import { accountKind, kind } from "./validators";
import { importMappedRows, importedRow } from "./transactions";
import { importBalancesForUser } from "./workspace";
const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

export const prepareDestinations = userMutation({
  args: {
    accounts: v.array(
      v.object({ name: v.string(), kind: accountKind, closed: v.boolean() }),
    ),
    categories: v.array(
      v.object({
        name: v.string(),
        emoji: v.string(),
        kind,
        group: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    accounts: v.array(schema.doc("accounts")),
    categories: v.array(schema.doc("categories")),
  }),
  handler: async (ctx, args) => {
    if (args.accounts.length + args.categories.length > 100)
      throw new ConvexError(
        "Create at most 100 import destinations per batch.",
      );
    const [accounts, categories, groups] = await Promise.all([
      ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201),
      ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(501),
      ctx.db
        .query("groups")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201),
    ]);
    if (accounts.length > 200 || categories.length > 500 || groups.length > 200)
      throw new ConvexError(
        "This workspace exceeds its account or category limit.",
      );
    const accountResults = [],
      categoryResults = [];
    for (const proposed of args.accounts) {
      const name = text(proposed.name, 120),
        importName = normalize(name);
      const matches = accounts.filter(
        (a) => a.importName === importName || normalize(a.name) === importName,
      );
      if (matches.length > 1)
        throw new ConvexError(
          `Choose an existing account for “${name}”; more than one matches.`,
        );
      if (matches[0]) {
        accountResults.push(matches[0]);
        continue;
      }
      if (accounts.length >= 200)
        throw new ConvexError(
          "This import would exceed 200 accounts. Import fewer accounts or merge existing ones first.",
        );
      const suffix = /\(\s*(?:\.{3}|…)?\s*[x*#•]*(\d{2,})\s*\)$/.exec(name);
      // A history-only account has no verified current balance. Do not create a zero snapshot today.
      const id = await ctx.db.insert("accounts", {
        userId: ctx.userId,
        ...proposed,
        name,
        importName,
        institution: "Manual",
        mask: suffix?.[1].slice(-4) ?? "",
        subtype: "imported history",
        balanceCents: 0,
        currency: "USD",
        hidden: false,
        excludeNetWorth: false,
        manual: true,
        updatedAt: Date.now(),
      });
      const account = (await ctx.db.get(id))!;
      accounts.push(account);
      accountResults.push(account);
    }
    for (const proposed of args.categories) {
      const name = text(proposed.name, 120),
        importName = normalize(name);
      const emoji = text(proposed.emoji, 30);
      const matches = categories.filter(
        (c) => c.importName === importName || normalize(c.name) === importName,
      );
      if (matches.length > 1)
        throw new ConvexError(
          `Choose an existing category for “${name}”; more than one matches.`,
        );
      if (matches[0]) {
        categoryResults.push(matches[0]);
        continue;
      }
      if (categories.length >= 500)
        throw new ConvexError(
          "This import would exceed 500 categories. Map some file categories to existing categories first.",
        );
      // The suggested starter group keeps imports organized; a group of the
      // right kind is matched by name and created only when missing.
      const groupName = proposed.group
        ? text(proposed.group, 120)
        : "Imported categories";
      let group = groups.find(
        (g) =>
          normalize(g.name) === normalize(groupName) &&
          g.kind === proposed.kind,
      );
      if (!group) {
        if (groups.length >= 200)
          throw new ConvexError(
            "This import would exceed 200 category groups.",
          );
        const id = await ctx.db.insert("groups", {
          userId: ctx.userId,
          name: groupName,
          kind: proposed.kind,
          order: Math.max(-1, ...groups.map((g) => g.order)) + 1,
        });
        group = (await ctx.db.get(id))!;
        groups.push(group);
      }
      const id = await ctx.db.insert("categories", {
        userId: ctx.userId,
        name,
        importName,
        emoji,
        groupId: group._id,
        enabled: true,
        order: Math.max(-1, ...categories.map((c) => c.order)) + 1,
      });
      const category = (await ctx.db.get(id))!;
      categories.push(category);
      categoryResults.push(category);
    }
    return { accounts: accountResults, categories: categoryResults };
  },
});

/*
 * Background import jobs. The dialog prepares and validates rows in the
 * browser, uploads them as one JSON file, and starts a job; an action then
 * saves the rows in owned batches and records progress on the job row, so the
 * person can leave the page or close the tab. Row keys make retries safe.
 */
const balanceRow = v.object({
  accountId: v.id("accounts"),
  date: v.string(),
  balanceCents: v.number(),
});
type ImportedRow = Infer<typeof importedRow>;
type BalanceRow = Infer<typeof balanceRow>;
/** Bytes of row payload per batch; keeps each mutation far below its argument limit. */
const batchBytes = 400_000;
const batchRows = 100;
/** A job that has not reported progress for this long is treated as abandoned. */
const staleAfter = 15 * 60_000;

export const createUploadUrl = userMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

async function latestJob(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<Doc<"importJobs"> | null> {
  return await ctx.db
    .query("importJobs")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
}

export const start = userMutation({
  args: {
    kind: v.union(v.literal("transactions"), v.literal("balances")),
    storageId: v.id("_storage"),
    total: v.number(),
  },
  returns: v.id("importJobs"),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.total) || args.total < 1 || args.total > 50_000)
      throw new ConvexError("Import between 1 and 50,000 rows at a time.");
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new ConvexError("The uploaded rows were not found.");
    const previous = await latestJob(ctx, ctx.userId);
    if (
      previous &&
      (previous.status === "queued" || previous.status === "running") &&
      Date.now() - previous.updatedAt < staleAfter
    )
      throw new ConvexError(
        "An import is already running. Wait for it to finish before starting another.",
      );
    const now = Date.now();
    const jobId = await ctx.db.insert("importJobs", {
      userId: ctx.userId,
      kind: args.kind,
      status: "queued",
      storageId: args.storageId,
      total: args.total,
      processed: 0,
      inserted: 0,
      matched: 0,
      skipped: 0,
      updates: 0,
      accounts: 0,
      acknowledged: false,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.imports.run, { jobId, offset: 0 });
    return jobId;
  },
});

/** The most recent import job, so the dialog and the app shell can show progress. */
export const latest = userQuery({
  args: {},
  returns: v.union(schema.doc("importJobs"), v.null()),
  handler: async (ctx) => await latestJob(ctx, ctx.userId),
});

export const acknowledge = userMutation({
  args: { jobId: v.id("importJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (job && job.userId === ctx.userId && !job.acknowledged)
      await ctx.db.patch(jobId, { acknowledged: true });
    return null;
  },
});

export const jobById = internalQuery({
  args: { jobId: v.id("importJobs") },
  returns: v.union(schema.doc("importJobs"), v.null()),
  handler: async (ctx, { jobId }) => await ctx.db.get(jobId),
});

const progressPatch = v.object({
  status: v.optional(
    v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
  ),
  processed: v.optional(v.number()),
  error: v.optional(v.string()),
  storageId: v.optional(v.union(v.id("_storage"), v.null())),
});
export const recordProgress = internalMutation({
  args: { jobId: v.id("importJobs"), patch: progressPatch },
  returns: v.null(),
  handler: async (ctx, { jobId, patch }) => {
    const { storageId, ...rest } = patch;
    await ctx.db.patch(jobId, {
      ...rest,
      ...(storageId === null
        ? { storageId: undefined }
        : storageId
          ? { storageId }
          : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const transactionBatch = internalMutation({
  args: { jobId: v.id("importJobs"), rows: v.array(importedRow) },
  returns: v.null(),
  handler: async (ctx, { jobId, rows }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new ConvexError("This import was removed.");
    const result = await importMappedRows({ ...ctx, userId: job.userId }, rows);
    await ctx.db.patch(jobId, {
      status: "running",
      processed: job.processed + rows.length,
      inserted: job.inserted + result.inserted,
      matched: job.matched + result.matched,
      skipped: job.skipped + result.skipped,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const balanceBatch = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    accountId: v.id("accounts"),
    rows: v.array(v.object({ date: v.string(), balanceCents: v.number() })),
    accounts: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, accountId, rows, accounts }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new ConvexError("This import was removed.");
    const updates = await importBalancesForUser(
      { ...ctx, userId: job.userId },
      { accountId, rows },
    );
    await ctx.db.patch(jobId, {
      status: "running",
      processed: job.processed + rows.length,
      updates: job.updates + updates,
      accounts,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Splits rows into batches of at most 100 rows and about 400 KB of payload. */
export function batchesOf<T>(rows: T[]) {
  const batches: T[][] = [];
  let current: T[] = [],
    bytes = 0;
  for (const row of rows) {
    const size = new TextEncoder().encode(JSON.stringify(row)).byteLength;
    if (
      current.length &&
      (current.length >= batchRows || bytes + size > batchBytes)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

const errorText = (error: unknown) =>
  error instanceof ConvexError
    ? typeof error.data === "string"
      ? error.data
      : "The import stopped."
    : error instanceof Error
      ? error.message
      : "The import stopped.";

/** Saves batches from `offset`; reschedules itself before the action time limit. */
export const run = internalAction({
  args: { jobId: v.id("importJobs"), offset: v.number() },
  returns: v.null(),
  handler: async (ctx, { jobId, offset }) => {
    const job = await ctx.runQuery(internal.imports.jobById, { jobId });
    if (
      !job ||
      !job.storageId ||
      job.status === "done" ||
      job.status === "failed"
    )
      return null;
    const blob = await ctx.storage.get(job.storageId);
    if (!blob) {
      await ctx.runMutation(internal.imports.recordProgress, {
        jobId,
        patch: { status: "failed", error: "The uploaded rows were not found." },
      });
      return null;
    }
    const finish = async (patch: Infer<typeof progressPatch>) => {
      await ctx.runMutation(internal.imports.recordProgress, {
        jobId,
        patch: { ...patch, storageId: null },
      });
      await ctx.storage.delete(job.storageId!);
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(await blob.text());
    } catch {
      await finish({
        status: "failed",
        error: "The uploaded rows could not be read.",
      });
      return null;
    }
    if (!Array.isArray(parsed) || parsed.length !== job.total) {
      await finish({
        status: "failed",
        error: "The uploaded rows did not match the import.",
      });
      return null;
    }
    const startedAt = Date.now();
    // Leave margin under the action limit; a long file continues in a new run.
    const budgetMs = 7 * 60_000;
    try {
      if (job.kind === "transactions") {
        const rows = parsed as ImportedRow[];
        const batches = batchesOf(rows.slice(offset));
        let cursor = offset;
        for (const batch of batches) {
          await ctx.runMutation(internal.imports.transactionBatch, {
            jobId,
            rows: batch,
          });
          cursor += batch.length;
          if (cursor < rows.length && Date.now() - startedAt > budgetMs) {
            await ctx.scheduler.runAfter(0, internal.imports.run, {
              jobId,
              offset: cursor,
            });
            return null;
          }
        }
      } else {
        const rows = parsed as BalanceRow[];
        // Rows are grouped by account and saved in file order within each.
        const byAccount = new Map<
          Id<"accounts">,
          { date: string; balanceCents: number }[]
        >();
        for (const row of rows) {
          const list = byAccount.get(row.accountId) ?? [];
          list.push({ date: row.date, balanceCents: row.balanceCents });
          byAccount.set(row.accountId, list);
        }
        const ordered = [...byAccount].flatMap(([accountId, list]) =>
          batchesOf(list).map((rows) => ({ accountId, rows })),
        );
        let cursor = 0;
        for (const { accountId, rows: batch } of ordered) {
          if (cursor >= offset)
            await ctx.runMutation(internal.imports.balanceBatch, {
              jobId,
              accountId,
              rows: batch,
              accounts: byAccount.size,
            });
          cursor += batch.length;
          if (
            cursor < rows.length &&
            cursor > offset &&
            Date.now() - startedAt > budgetMs
          ) {
            await ctx.scheduler.runAfter(0, internal.imports.run, {
              jobId,
              offset: cursor,
            });
            return null;
          }
        }
      }
      await finish({ status: "done" });
    } catch (error) {
      await finish({ status: "failed", error: errorText(error) });
    }
    return null;
  },
});
