import { ConvexError, v, type Infer } from "convex/values";
import { env, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { date, userAction, userMutation, userQuery } from "./lib/access";
import { accountKind } from "./validators";
import {
  normalizeSophtronAccount,
  normalizeSophtronTransactions,
  previewSophtronAccount,
  providerId,
  providerRows,
  sophtronConfiguration,
  sophtronEnvironment,
  sophtronError,
  sophtronLinkedAccounts,
  sophtronRequest,
  sophtronSelection,
  type SophtronSelection,
} from "./lib/sophtronApi";

const NOTICE =
  "Imported balances and posted transactions are Sophtron's cached data. The API does not confirm complete history or removed transactions. Pending activity, holdings, and statement minimums are not imported.";
const safeConnection = v.object({
  _id: v.id("sophtronConnections"),
  status: v.union(
    v.literal("connected"),
    v.literal("syncing"),
    v.literal("error"),
    v.literal("disconnected"),
  ),
  syncedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  warning: v.optional(v.string()),
  fromDate: v.optional(v.string()),
  toDate: v.optional(v.string()),
  accounts: v.number(),
  historyComplete: v.literal(false),
});
export const status = userQuery({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    availableToUser: v.boolean(),
    setupReason: v.union(v.string(), v.null()),
    currentUserId: v.id("users"),
    environment: v.union(sophtronEnvironment, v.null()),
    connection: v.union(safeConnection, v.null()),
  }),
  handler: async (ctx) => {
    const config = sophtronConfiguration(env);
    const user = await ctx.db.get(ctx.userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    const availableToUser =
      !!config &&
      config.ownerUserId === ctx.userId &&
      !!user &&
      !user.isAnonymous &&
      !!profile &&
      !profile.demo;
    const rows = await ctx.db
      .query("sophtronConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(100);
    const connection =
      rows.find((row) => row.status !== "disconnected") ??
      rows.find(
        (row) =>
          row.apiUserId === config?.apiUserId &&
          row.customerId === config.customerId &&
          row.environment === config.environment,
      );
    const accounts = connection
      ? await ctx.db
          .query("accounts")
          .withIndex("by_sophtronConnectionId", (q) =>
            q.eq("sophtronConnectionId", connection._id),
          )
          .take(101)
      : [];
    return {
      configured: !!config,
      availableToUser,
      setupReason: availableToUser
        ? null
        : !config
          ? "Sophtron needs server credentials and an explicit Marten owner on your personal deployment."
          : config.ownerUserId !== ctx.userId
            ? "This server's Sophtron configuration is assigned to another Marten user. Use your own personal deployment."
            : "Create a personal workspace before importing real accounts.",
      currentUserId: ctx.userId,
      environment: config?.environment ?? null,
      connection: connection
        ? {
            _id: connection._id,
            status: connection.status,
            syncedAt: connection.syncedAt,
            error: connection.error,
            warning: connection.warning,
            fromDate: connection.fromDate,
            toDate: connection.toDate,
            accounts: accounts.length,
            historyComplete: false as const,
          }
        : null,
    };
  },
});
const previewAccount = v.object({
  externalId: v.string(),
  memberId: v.string(),
  name: v.string(),
  institution: v.string(),
  mask: v.string(),
  kind: v.union(accountKind, v.null()),
  balanceCents: v.union(v.number(), v.null()),
  currency: v.string(),
  lastUpdated: v.union(v.number(), v.null()),
  unsupportedReason: v.optional(v.string()),
  needsUsdConfirmation: v.boolean(),
  needsDebtSign: v.boolean(),
  alreadyImported: v.boolean(),
  martenAccountId: v.optional(v.id("accounts")),
});
export const preview = userAction({
  args: {},
  returns: v.object({
    accounts: v.array(previewAccount),
    complete: v.boolean(),
    historyComplete: v.literal(false),
    notice: v.string(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    accounts: Infer<typeof previewAccount>[];
    complete: boolean;
    historyComplete: false;
    notice: string;
  }> => {
    const context = await ctx.runQuery(internal.sophtronInternal.context, {
      userId: ctx.userId,
    });
    const config = sophtronConfiguration(env)!;
    try {
      const accounts = await sophtronLinkedAccounts(config);
      return {
        accounts: accounts.map((row) => {
          const incoming = previewSophtronAccount(row);
          const existing = context.accounts.find(
            (account: Doc<"accounts">) =>
              account.sophtronAccountId === incoming.externalId,
          );
          return {
            ...incoming,
            alreadyImported: !!existing,
            ...(existing ? { martenAccountId: existing._id } : {}),
          };
        }),
        complete: true,
        historyComplete: false,
        notice: NOTICE,
      };
    } catch (error) {
      throw new ConvexError(sophtronError(error));
    }
  },
});
const importResult = v.object({
  accounts: v.number(),
  imported: v.number(),
  updated: v.number(),
  skippedPending: v.number(),
  skippedUnsupported: v.number(),
  historyComplete: v.literal(false),
  fromDate: v.string(),
  toDate: v.string(),
  warning: v.string(),
});
type ImportResult = Infer<typeof importResult>;
async function runImport(
  ctx: ActionCtx & { userId: Id<"users"> },
  args?: { accounts: SophtronSelection[]; fromDate: string },
): Promise<ImportResult> {
  const context: {
    connection: Doc<"sophtronConnections"> | null;
    accounts: Doc<"accounts">[];
  } = await ctx.runQuery(internal.sophtronInternal.context, {
    userId: ctx.userId,
  });
  if (
    !args &&
    (!context.connection || context.connection.status === "disconnected")
  )
    throw new ConvexError("Review and import your Sophtron accounts first.");
  const config = sophtronConfiguration(env)!;
  const selections =
    args?.accounts ??
    context.accounts
      .filter((account) => !account.closed)
      .map((account) => ({
        externalAccountId: account.sophtronAccountId!,
        targetAccountId: account._id,
        confirmUsd: account.sophtronUsdConfirmed,
        debtSign: account.sophtronDebtSign,
      }));
  if (
    !selections.length ||
    selections.length > 20 ||
    new Set(selections.map((row) => row.externalAccountId)).size !==
      selections.length
  )
    throw new ConvexError(
      "Select between 1 and 20 different Sophtron accounts.",
    );
  for (const selection of selections)
    if (providerId(selection.externalAccountId) !== selection.externalAccountId)
      throw new ConvexError("Review the Sophtron account selection again.");
  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = date(
    args?.fromDate ?? context.connection?.fromDate ?? toDate,
  );
  if (fromDate > toDate || fromDate < "2000-01-01")
    throw new ConvexError(
      "Choose an import start date between January 1, 2000 and today.",
    );
  let lease:
    | { connectionId: Id<"sophtronConnections">; version: number }
    | undefined;
  try {
    const linked = await sophtronLinkedAccounts(config);
    const prepared = selections.map((selection) => {
      const row = linked.find(
        (account) =>
          providerId(account.accountID ?? account.id) ===
          selection.externalAccountId,
      );
      if (!row)
        throw new ConvexError(
          "A selected account is no longer linked to this Sophtron customer. Review your accounts again.",
        );
      const existing = context.accounts.find(
        (account) => account.sophtronAccountId === selection.externalAccountId,
      );
      const resolved = {
        ...selection,
        confirmUsd: selection.confirmUsd ?? existing?.sophtronUsdConfirmed,
        debtSign: selection.debtSign ?? existing?.sophtronDebtSign,
      };
      return {
        selection: resolved,
        account: normalizeSophtronAccount(row, resolved),
        fromDate:
          args?.fromDate ?? existing?.sophtronImportFromDate ?? fromDate,
      };
    });
    // Validate all remote data before creating an account or changing a balance.
    const batches = [];
    let skippedPending = 0,
      skippedUnsupported = 0,
      total = 0;
    for (const entry of prepared) {
      const rows = providerRows(
        await sophtronRequest(
          config,
          `/api/v2/customers/${config.customerId}/accounts/${entry.account.externalId}/transactions`,
        ),
        20000,
      );
      const result = normalizeSophtronTransactions(
        rows,
        config,
        entry.account,
        entry.fromDate,
        toDate,
      );
      total += result.transactions.length;
      if (total > 10000)
        throw new ConvexError(
          "This import contains more than 10,000 posted transactions. Choose a later start date and import older history by CSV if needed.",
        );
      skippedPending += result.skippedPending;
      skippedUnsupported += result.skippedUnsupported;
      batches.push({
        externalId: entry.account.externalId,
        transactions: result.transactions,
      });
    }
    const begun: {
      connectionId: Id<"sophtronConnections">;
      version: number;
      mappings: {
        externalId: string;
        accountId: Id<"accounts">;
        fromDate: string;
      }[];
    } = await ctx.runMutation(internal.sophtronInternal.begin, {
      userId: ctx.userId,
      accounts: prepared,
      reconnect: !!args,
      expectedVersion: context.connection?.syncVersion,
    });
    lease = { connectionId: begun.connectionId, version: begun.version };
    let imported = 0,
      updated = 0;
    for (const batch of batches) {
      const mapping = begun.mappings.find(
        (entry) => entry.externalId === batch.externalId,
      )!;
      for (let offset = 0; offset < batch.transactions.length; offset += 100) {
        const counts: { imported: number; updated: number } =
          await ctx.runMutation(internal.sophtronInternal.ingest, {
            ...lease,
            accountId: mapping.accountId,
            transactions: batch.transactions.slice(offset, offset + 100),
          });
        imported += counts.imported;
        updated += counts.updated;
      }
    }
    const warning = `${NOTICE}${skippedUnsupported ? ` ${skippedUnsupported} records lacked a supported posted status, date, direction, amount, or currency and were skipped.` : ""}`;
    const importedFrom = prepared.map((entry) => entry.fromDate).sort()[0];
    await ctx.runMutation(internal.sophtronInternal.finish, {
      ...lease,
      fromDate: importedFrom,
      toDate,
      warning,
    });
    return {
      accounts: prepared.length,
      imported,
      updated,
      skippedPending,
      skippedUnsupported,
      historyComplete: false,
      fromDate: importedFrom,
      toDate,
      warning,
    };
  } catch (error) {
    const message = sophtronError(error);
    if (lease)
      await ctx.runMutation(internal.sophtronInternal.fail, {
        ...lease,
        error: message,
      });
    throw new ConvexError(message);
  }
}
export const importAccounts = userAction({
  args: { accounts: v.array(sophtronSelection), fromDate: v.string() },
  returns: importResult,
  handler: runImport,
});
export const sync = userAction({
  args: {},
  returns: importResult,
  handler: (ctx) => runImport(ctx),
});
export const disconnect = userMutation({
  args: { connectionId: v.id("sophtronConnections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.userId !== ctx.userId)
      throw new ConvexError("This Sophtron connection is unavailable.");
    await ctx.db.patch(connectionId, {
      status: "disconnected",
      syncVersion: connection.syncVersion + 1,
      syncLease: undefined,
      error: undefined,
    });
    return null;
  },
});
