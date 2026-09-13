import {
  bankProvider,
  providerName,
  type BankProvider,
} from "./lib/bankProviders";
import {
  lunchflowAccounts,
  lunchflowError,
  lunchflowKey,
  LUNCHFLOW_NOTICE,
} from "./lib/lunchflowApi";
import { ConvexError, v, type Infer } from "convex/values";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { date, userAction, userMutation, userQuery } from "./lib/access";
import { accountKind } from "./validators";
import {
  isSealed,
  openCredential,
  sealCredential,
} from "./lib/credentialCrypto";
import {
  OVERLAP_DAYS,
  claimAccessUrl,
  decodeSetupToken,
  importWindows,
  normalizeSimplefinAccount,
  normalizeSimplefinTransactions,
  parseAccessUrl,
  parseAccountSet,
  previewSimplefinAccount,
  shiftDate,
  simplefinAccounts,
  simplefinError,
  simplefinSelection,
  type ParsedAccount,
  type SimplefinSelection,
} from "./lib/simplefinApi";
import { requirePersonalWorkspace, savedConnection } from "./simplefinInternal";

const NOTICE =
  "Balances and posted transactions come from SimpleFIN Bridge, which refreshes about once a day. Pending activity and removed transactions are not imported.";
// About five years of 45-day windows; each window is one bridge request.
const MAX_WINDOWS = 41;
const safeConnection = v.object({
  _id: v.id("simplefinConnections"),
  host: v.string(),
  status: v.union(
    v.literal("connected"),
    v.literal("syncing"),
    v.literal("error"),
    v.literal("disconnected"),
  ),
  syncedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  warning: v.optional(v.string()),
  providerErrors: v.array(v.string()),
  fromDate: v.optional(v.string()),
  toDate: v.optional(v.string()),
  accounts: v.number(),
  sealed: v.boolean(),
  createdAt: v.number(),
});
async function isPersonalWorkspace(
  ctx: Parameters<typeof requirePersonalWorkspace>[0],
  userId: Id<"users">,
) {
  try {
    await requirePersonalWorkspace(ctx, userId);
    return true;
  } catch {
    return false;
  }
}
export const status = userQuery({
  args: { provider: v.optional(bankProvider) },
  returns: v.object({
    availableToUser: v.boolean(),
    setupReason: v.union(v.string(), v.null()),
    connection: v.union(safeConnection, v.null()),
  }),
  handler: async (ctx, { provider = "simplefin" }) => {
    const personal = await isPersonalWorkspace(ctx, ctx.userId);
    const connection = personal
      ? await savedConnection(ctx, ctx.userId, provider)
      : null;
    const accounts = connection
      ? await ctx.db
          .query("accounts")
          .withIndex("by_simplefinConnectionId", (q) =>
            q.eq("simplefinConnectionId", connection._id),
          )
          .take(101)
      : [];
    return {
      availableToUser: personal,
      setupReason: personal
        ? null
        : "Sign in to a personal workspace to connect a bank. The demo cannot connect to a bank.",
      connection: connection
        ? {
            _id: connection._id,
            host: connection.host,
            status: connection.status,
            syncedAt: connection.syncedAt,
            error: connection.error,
            warning: connection.warning,
            providerErrors: connection.providerErrors ?? [],
            fromDate: connection.fromDate,
            toDate: connection.toDate,
            accounts: accounts.filter((row) => !row.closed).length,
            sealed: isSealed(connection.accessUrl),
            createdAt: connection.createdAt,
          }
        : null,
    };
  },
});
const previewAccount = v.object({
  externalId: v.string(),
  name: v.string(),
  institution: v.string(),
  mask: v.string(),
  kind: accountKind,
  balanceCents: v.union(v.number(), v.null()),
  currency: v.string(),
  lastUpdated: v.union(v.number(), v.null()),
  holdings: v.number(),
  unsupportedReason: v.optional(v.string()),
  alreadyImported: v.boolean(),
  martenAccountId: v.optional(v.id("accounts")),
});

const previewResult = v.object({
  accounts: v.array(previewAccount),
  providerErrors: v.array(v.string()),
  notice: v.string(),
});
type PreviewResult = Infer<typeof previewResult>;
type ImportContext = {
  connection: Doc<"simplefinConnections">;
  accounts: Doc<"accounts">[];
  allowPending: boolean;
  investmentActivity: boolean;
};
/** Loads the caller's connection and opens the stored access URL for requests. */
async function importContext(
  ctx: ActionCtx & { userId: Id<"users"> },
  provider: BankProvider = "simplefin",
): Promise<ImportContext & { accessUrl: string }> {
  const context: ImportContext = await ctx.runQuery(
    internal.simplefinInternal.context,
    { userId: ctx.userId, provider },
  );
  return {
    ...context,
    accessUrl: await openCredential(
      context.connection.accessUrl,
      env.CREDENTIALS_KEY,
    ),
  };
}
async function fetchPreview(
  accessUrl: string,
  existing: Doc<"accounts">[],
  provider: BankProvider = "simplefin",
): Promise<PreviewResult> {
  const set =
    provider === "lunchflow"
      ? await lunchflowAccounts(accessUrl)
      : parseAccountSet(
          await simplefinAccounts(accessUrl, { balancesOnly: true }),
        );
  return {
    accounts: set.accounts.map((row) => {
      const incoming = previewSimplefinAccount(row);
      const mapped = existing.find(
        (account) => account.simplefinAccountId === incoming.externalId,
      );
      return {
        ...incoming,
        // Keep the kind the user already chose for an imported account.
        kind: mapped?.kind ?? incoming.kind,
        alreadyImported: !!mapped,
        ...(mapped ? { martenAccountId: mapped._id } : {}),
      };
    }),
    providerErrors: set.errors,
    notice: provider === "lunchflow" ? LUNCHFLOW_NOTICE : NOTICE,
  };
}
/**
 * Claims a setup token. The claim succeeds once, so the access URL is stored
 * before the first data request; a failed preview leaves a retryable connection.
 */
export const connect = userAction({
  args: { setupToken: v.string(), provider: v.optional(bankProvider) },
  returns: v.object({
    host: v.string(),
    preview: v.union(previewResult, v.null()),
    warning: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { setupToken, provider = "simplefin" }) => {
    await ctx.runMutation(internal.simplefinInternal.reserveConnect, {
      userId: ctx.userId,
    });
    let accessUrl: string;
    let validatedPreview: PreviewResult | undefined;
    try {
      accessUrl =
        provider === "lunchflow"
          ? lunchflowKey(setupToken)
          : await claimAccessUrl(decodeSetupToken(setupToken));
      // Validate reusable Lunch Flow keys before replacing a working credential.
      if (provider === "lunchflow")
        validatedPreview = await fetchPreview(accessUrl, [], provider);
    } catch (error) {
      throw new ConvexError(
        provider === "lunchflow"
          ? lunchflowError(error)
          : simplefinError(error),
      );
    }
    const host =
      provider === "lunchflow"
        ? "lunchflow.app"
        : parseAccessUrl(accessUrl).host;
    const connectionId: Id<"simplefinConnections"> = await ctx.runMutation(
      internal.simplefinInternal.store,
      {
        userId: ctx.userId,
        provider,
        accessUrl: await sealCredential(accessUrl, env.CREDENTIALS_KEY),
        host,
      },
    );
    try {
      const preview =
        validatedPreview ?? (await fetchPreview(accessUrl, [], provider));
      if (preview.providerErrors.length)
        await ctx.runMutation(internal.simplefinInternal.note, {
          connectionId,
          providerErrors: preview.providerErrors,
        });
      return { host, preview, warning: null };
    } catch (error) {
      const warning =
        provider === "lunchflow"
          ? lunchflowError(error)
          : simplefinError(error);
      await ctx.runMutation(internal.simplefinInternal.note, {
        connectionId,
        error: warning,
      });
      return { host, preview: null, warning };
    }
  },
});
export const preview = userAction({
  args: { provider: v.optional(bankProvider) },
  returns: previewResult,
  handler: async (ctx, { provider = "simplefin" }): Promise<PreviewResult> => {
    const { accessUrl, accounts } = await importContext(ctx, provider);
    try {
      return await fetchPreview(accessUrl, accounts, provider);
    } catch (error) {
      throw new ConvexError(
        provider === "lunchflow"
          ? lunchflowError(error)
          : simplefinError(error),
      );
    }
  },
});
const importResult = v.object({
  accounts: v.number(),
  imported: v.number(),
  updated: v.number(),
  skippedPending: v.number(),
  skippedUnsupported: v.number(),
  fromDate: v.string(),
  toDate: v.string(),
  warning: v.string(),
  providerErrors: v.array(v.string()),
});
type ImportResult = Infer<typeof importResult>;
/** Reads every bridge window for the selected accounts and merges them by account. */
async function fetchRange(
  accessUrl: string,
  accountIds: string[],
  fromDate: string,
  toDate: string,
) {
  const windows = importWindows(fromDate, toDate);
  if (windows.length > MAX_WINDOWS)
    throw new ConvexError(
      "Choose a start date within the last five years. Older history can be imported by CSV.",
    );
  const merged = new Map<string, ParsedAccount>();
  const errors = new Set<string>();
  for (const window of windows) {
    const set = parseAccountSet(
      await simplefinAccounts(accessUrl, {
        startDate: window.from,
        endDate: window.to,
        accountIds,
      }),
    );
    for (const error of set.errors) errors.add(error);
    for (const account of set.accounts) {
      const previous = merged.get(account.id);
      if (!previous) {
        merged.set(account.id, account);
        continue;
      }
      const seen = new Set(previous.transactions.map((row) => row.id));
      merged.set(account.id, {
        ...account,
        transactions: [
          ...previous.transactions,
          ...account.transactions.filter((row) => !seen.has(row.id)),
        ],
      });
    }
  }
  return { accounts: merged, errors: [...errors] };
}
async function runImport(
  ctx: ActionCtx & { userId: Id<"users"> },
  args?: { accounts: SimplefinSelection[]; fromDate: string },
  provider: BankProvider = "simplefin",
): Promise<ImportResult> {
  const {
    connection,
    accounts: existing,
    accessUrl,
    investmentActivity,
  } = await importContext(ctx, provider);
  if (!args && connection.status === "disconnected")
    throw new ConvexError(
      `Review and import your ${providerName(provider)} accounts first.`,
    );
  const selections: SimplefinSelection[] =
    args?.accounts ??
    existing
      .filter((account) => !account.closed)
      .map((account) => ({
        externalAccountId: account.simplefinAccountId!,
        targetAccountId: account._id,
        kind: account.kind,
      }));
  if (
    !selections.length ||
    selections.length > 25 ||
    new Set(selections.map((row) => row.externalAccountId)).size !==
      selections.length
  )
    throw new ConvexError(
      args
        ? `Select between 1 and 25 different ${providerName(provider)} accounts.`
        : `No ${providerName(provider)} accounts are mapped yet. Review and import accounts first.`,
    );
  const toDate = new Date().toISOString().slice(0, 10);
  const requestedFrom = args ? date(args.fromDate) : undefined;
  if (requestedFrom && (requestedFrom > toDate || requestedFrom < "2000-01-01"))
    throw new ConvexError(
      "Choose an import start date between January 1, 2000 and today.",
    );
  // Repeat imports re-read a short overlap; the user's start date is the floor.
  const accountFrom = (selection: SimplefinSelection) =>
    requestedFrom ??
    existing.find(
      (account) => account.simplefinAccountId === selection.externalAccountId,
    )?.simplefinImportFromDate ??
    toDate;
  const windowFrom = args
    ? requestedFrom!
    : [
        shiftDate(connection.toDate ?? toDate, -OVERLAP_DAYS),
        ...selections.map(accountFrom),
      ].reduce((max, value) => (value > max ? value : max));
  const floor = selections
    .map(accountFrom)
    .reduce((min, value) => (value < min ? value : min));
  const fetchFrom = windowFrom < floor ? floor : windowFrom;
  let lease:
    | { connectionId: Id<"simplefinConnections">; version: number }
    | undefined;
  try {
    const remote =
      provider === "lunchflow"
        ? await lunchflowAccounts(accessUrl, {
            accountIds: selections.map((row) => row.externalAccountId),
            fromDate: fetchFrom,
            toDate,
            investmentIds: selections
              .filter((row) => row.kind === "investment")
              .map((row) => row.externalAccountId),
          }).then((set) => ({
            accounts: new Map(set.accounts.map((row) => [row.id, row])),
            errors: set.errors,
          }))
        : await fetchRange(
            accessUrl,
            selections.map((row) => row.externalAccountId),
            fetchFrom,
            toDate,
          );
    const prepared = selections.map((selection) => {
      const row = remote.accounts.get(selection.externalAccountId);
      if (!row)
        throw new ConvexError(
          `A selected account is no longer available in ${providerName(provider)}. Review your accounts again.`,
        );
      return {
        selection,
        account: normalizeSimplefinAccount(row, selection),
        fromDate: accountFrom(selection),
        raw: row,
      };
    });
    // Validate every remote record before creating an account or changing a balance.
    const batches = [];
    let skippedPending = 0,
      skippedUnsupported = 0,
      total = 0;
    for (const entry of prepared) {
      // Brokerage activity stays out of Transactions unless the owner opted in;
      // balances and holdings for the account are still refreshed below.
      const result =
        entry.selection.kind === "investment" && !investmentActivity
          ? { transactions: [], skippedPending: 0, skippedUnsupported: 0 }
          : normalizeSimplefinTransactions(
              entry.raw,
              fetchFrom > entry.fromDate ? fetchFrom : entry.fromDate,
              toDate,
            );
      total += result.transactions.length;
      if (total > 20000)
        throw new ConvexError(
          "This import contains more than 20,000 posted transactions. Choose a later start date and import older history by CSV if needed.",
        );
      skippedPending += result.skippedPending;
      skippedUnsupported += result.skippedUnsupported;
      batches.push({
        externalId: entry.account.externalId,
        transactions: result.transactions,
      });
    }
    const begun: {
      connectionId: Id<"simplefinConnections">;
      version: number;
      mappings: {
        externalId: string;
        accountId: Id<"accounts">;
        fromDate: string;
      }[];
    } = await ctx.runMutation(internal.simplefinInternal.begin, {
      userId: ctx.userId,
      provider,
      accounts: prepared.map(({ selection, account, fromDate }) => ({
        selection,
        account,
        fromDate,
      })),
      reconnect: !!args,
      expectedVersion: connection.syncVersion,
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
          await ctx.runMutation(internal.simplefinInternal.ingest, {
            ...lease,
            accountId: mapping.accountId,
            transactions: batch.transactions.slice(offset, offset + 100),
          });
        imported += counts.imported;
        updated += counts.updated;
      }
    }
    const investmentWarnings: string[] = [];
    for (const entry of prepared) {
      if (entry.selection.kind !== "investment") continue;
      if (entry.raw.holdingsWarning)
        investmentWarnings.push(entry.raw.holdingsWarning);
      if (
        entry.raw.holdingPositions &&
        !entry.raw.holdingsWarning &&
        !remote.errors.length
      ) {
        const mapping = begun.mappings.find(
          (row) => row.externalId === entry.account.externalId,
        )!;
        try {
          await ctx.runMutation(internal.simplefinInternal.ingestHoldings, {
            ...lease,
            accountId: mapping.accountId,
            holdings: entry.raw.holdingPositions,
          });
        } catch {
          investmentWarnings.push(
            "Investment positions could not be saved completely. Previous holdings are kept; try another sync.",
          );
        }
      }
    }
    const warning = `${provider === "lunchflow" ? LUNCHFLOW_NOTICE : NOTICE} ${[...new Set(investmentWarnings)].join(" ")}${
      skippedUnsupported
        ? ` ${skippedUnsupported} records lacked a usable date or amount and were skipped.`
        : ""
    }`;
    const importedFrom = prepared.map((entry) => entry.fromDate).sort()[0];
    await ctx.runMutation(internal.simplefinInternal.finish, {
      ...lease,
      fromDate: importedFrom,
      toDate,
      warning,
      providerErrors: remote.errors,
    });
    return {
      accounts: prepared.length,
      imported,
      updated,
      skippedPending,
      skippedUnsupported,
      fromDate: importedFrom,
      toDate,
      warning,
      providerErrors: remote.errors,
    };
  } catch (error) {
    const message =
      provider === "lunchflow" ? lunchflowError(error) : simplefinError(error);
    if (lease)
      await ctx.runMutation(internal.simplefinInternal.fail, {
        ...lease,
        error: message,
      });
    throw new ConvexError(message);
  }
}
export const importAccounts = userAction({
  args: {
    accounts: v.array(simplefinSelection),
    fromDate: v.string(),
    provider: v.optional(bankProvider),
  },
  returns: importResult,
  handler: (ctx, args) => runImport(ctx, args, args.provider),
});
export const sync = userAction({
  args: { provider: v.optional(bankProvider) },
  returns: importResult,
  handler: (ctx, { provider }) => runImport(ctx, undefined, provider),
});
/** Stops future imports. Cached balances, accounts and history stay. */
export const disconnect = userMutation({
  args: { connectionId: v.id("simplefinConnections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.userId !== ctx.userId)
      throw new ConvexError("This bank connection is unavailable.");
    await ctx.db.patch(connectionId, {
      status: "disconnected",
      syncVersion: connection.syncVersion + 1,
      syncLease: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
/** Forgets the access URL entirely; imported accounts become manual accounts. */
export const remove = userMutation({
  args: { provider: v.optional(bankProvider) },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const connection = await savedConnection(ctx, ctx.userId, provider);
    if (!connection) return null;
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_simplefinConnectionId", (q) =>
        q.eq("simplefinConnectionId", connection._id),
      )
      .take(101);
    for (const account of accounts)
      await ctx.db.patch(account._id, {
        simplefinConnectionId: undefined,
        bankProvider: undefined,
        connectionProvider: undefined,
        simplefinAccountId: undefined,
        simplefinImportFromDate: undefined,
        simplefinUpdatedAt: undefined,
        manual: true,
        updatedAt: Date.now(),
      });
    await ctx.db.delete(connection._id);
    return null;
  },
});
/** Daily catch-up: one request window per connection, well under the bridge's 24/day budget. */
export const sweep = internalAction({
  args: { provider: v.optional(bankProvider) },
  returns: v.null(),
  handler: async (ctx) => {
    const due: { userId: Id<"users">; provider?: BankProvider }[] =
      await ctx.runQuery(internal.simplefinInternal.due, {
        before: Date.now() - 20 * 60 * 60 * 1000,
      });
    for (const { userId, provider } of due) {
      try {
        await runImport({ ...ctx, userId }, undefined, provider);
      } catch (error) {
        console.warn(
          "Bank catch-up skipped",
          provider === "lunchflow"
            ? lunchflowError(error)
            : simplefinError(error),
        );
      }
    }
    return null;
  },
});
