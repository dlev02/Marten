import { ConvexError, v } from "convex/values";
import { internalAction, env, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { userAction, userQuery } from "./lib/access";
import { date as validateDate } from "./lib/access";
import { syncInvestments } from "./lib/investmentSync";
import {
  configuration,
  environment,
  linkMode,
  plaidRequest,
  publicRequest,
  PlaidFailure,
  safeError,
  normalizeAccount,
  normalizeTransaction,
  bankCents,
  plaidAllowedFor,
  plaidAccessFor,
  type PlaidAccount,
  type PlaidItem,
  type SyncPage,
  type BankTransaction,
  type BankAccount,
} from "./lib/plaidApi";

const safeItem = v.object({
  _id: v.id("plaidItems"),
  institution: v.string(),
  status: v.union(
    v.literal("connected"),
    v.literal("syncing"),
    v.literal("error"),
    v.literal("disconnected"),
  ),
  error: v.optional(v.string()),
  syncedAt: v.optional(v.number()),
  products: v.array(v.string()),
});
export const status = userQuery({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    environment: v.union(environment, v.null()),
    // True when PLAID_ALLOWED_EMAILS is set and excludes the signed-in user.
    restricted: v.boolean(),
    verificationRequired: v.boolean(),
    items: v.array(safeItem),
  }),
  handler: async (ctx) => {
    const config = configuration();
    const user = await ctx.db.get(ctx.userId);
    const restricted = !plaidAllowedFor(
      user?.email,
      user?.emailVerificationTime,
    );
    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(100);
    return {
      ...config,
      configured: config.configured && !restricted,
      verificationRequired:
        config.configured &&
        plaidAccessFor(user?.email, user?.emailVerificationTime) ===
          "verification-required",
      restricted,
      items: items.map(
        ({ _id, institution, status, error, syncedAt, products }) => ({
          _id,
          institution,
          status,
          error,
          syncedAt,
          products,
        }),
      ),
    };
  },
});
export const createLinkToken = userAction({
  args: { mode: linkMode, itemId: v.optional(v.id("plaidItems")) },
  returns: v.object({ linkToken: v.string(), expiration: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ linkToken: string; expiration: string }> => {
    const item: Doc<"plaidItems"> | null = await ctx.runQuery(
      internal.plaidInternal.context,
      {
        userId: ctx.userId,
        link: true,
        ...(args.itemId ? { itemId: args.itemId } : {}),
      },
    );
    if (item?.status === "disconnected")
      throw new ConvexError(
        "This connection was disconnected. Add the bank again to reconnect.",
      );
    const webhook = env.CONVEX_SITE_URL
      ? `${env.CONVEX_SITE_URL}/plaid/webhook`
      : undefined;
    const primary = args.mode;
    const secondary =
      primary === "transactions"
        ? ["liabilities", "investments"]
        : ["transactions", "liabilities"];
    const request: Record<string, unknown> = {
      user: { client_user_id: ctx.userId },
      client_name: "Marten",
      language: "en",
      country_codes: ["US"],
      ...(webhook ? { webhook } : {}),
      ...(env.PLAID_REDIRECT_URI
        ? { redirect_uri: env.PLAID_REDIRECT_URI }
        : {}),
      ...(item
        ? {
            access_token: item.accessToken,
            additional_consented_products: [
              "transactions",
              "investments",
              "liabilities",
            ],
            update: { account_selection_enabled: true },
          }
        : {
            products: [primary],
            additional_consented_products: secondary,
            ...(primary === "transactions"
              ? { transactions: { days_requested: 730 } }
              : {}),
          }),
    };
    const result = await publicRequest<{
      link_token: string;
      expiration: string;
    }>("/link/token/create", request, item?.environment);
    return { linkToken: result.link_token, expiration: result.expiration };
  },
});
export const exchangePublicToken = userAction({
  args: {
    publicToken: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    importFromDate: v.optional(v.string()),
  },
  returns: v.object({ itemId: v.id("plaidItems") }),
  handler: async (ctx, args) => {
    if (args.importFromDate !== undefined) {
      validateDate(args.importFromDate);
      if (
        args.importFromDate >
        new Date(Date.now() + 86400000).toISOString().slice(0, 10)
      )
        throw new ConvexError(
          "Choose tomorrow or an earlier date for bank transactions.",
        );
    }
    await ctx.runQuery(internal.plaidInternal.context, {
      userId: ctx.userId,
      link: true,
    });
    if (args.publicToken.length > 1000)
      throw new ConvexError("This bank connection token is invalid.");
    const exchange = await publicRequest<{
      access_token: string;
      item_id: string;
    }>("/item/public_token/exchange", { public_token: args.publicToken });
    let stored = false;
    try {
      const { item } = await publicRequest<{ item: PlaidItem }>("/item/get", {
        access_token: exchange.access_token,
      });
      if (item.item_id !== exchange.item_id || !item.institution_id)
        throw new ConvexError("Plaid could not verify this institution.");
      const { institution } = await publicRequest<{
        institution: { name: string; logo?: string | null };
      }>("/institutions/get_by_id", {
        institution_id: item.institution_id,
        country_codes: ["US"],
        options: { include_optional_metadata: true },
      });
      // Institution metadata from Link is display-only. Ownership/identity comes from Plaid.
      const result: {
        itemId: Id<"plaidItems">;
        duplicate: boolean;
        sameItem: boolean;
      } = await ctx.runMutation(internal.plaidInternal.saveItem, {
        userId: ctx.userId,
        plaidItemId: item.item_id,
        accessToken: exchange.access_token,
        institutionId: item.institution_id,
        institution: institution.name,
        ...(institution.logo && institution.logo.length < 150000
          ? { logoUrl: `data:image/png;base64,${institution.logo}` }
          : {}),
        products: productSet(item),
        environment: configuration().environment!,
        ...(args.importFromDate ? { importFromDate: args.importFromDate } : {}),
      });
      if (result.duplicate) {
        await publicRequest("/item/remove", {
          access_token: exchange.access_token,
        });
        stored = true;
        throw new ConvexError(
          "This bank is already connected. Use Reconnect on the existing connection to restore or change its accounts.",
        );
      }
      stored = true;
      return { itemId: result.itemId };
    } catch (error) {
      if (!stored) {
        try {
          await plaidRequest("/item/remove", {
            access_token: exchange.access_token,
          });
        } catch {
          /* A failed exchange is reported without exposing credentials. */
        }
      }
      throw error instanceof ConvexError
        ? error
        : new ConvexError(safeError("UNKNOWN"));
    }
  },
});
export const sync = userAction({
  args: { itemId: v.id("plaidItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item: Doc<"plaidItems"> | null = await ctx.runQuery(
      internal.plaidInternal.context,
      { userId: ctx.userId, itemId: args.itemId },
    );
    if (!item || item.status === "disconnected")
      throw new ConvexError("Reconnect this bank before syncing.");
    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, {
      itemId: item._id,
    });
    return null;
  },
});
export const disconnect = userAction({
  args: { itemId: v.id("plaidItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item: Doc<"plaidItems"> = await ctx.runMutation(
      internal.plaidInternal.disconnectStart,
      { itemId: args.itemId, userId: ctx.userId },
    );
    try {
      if (item.accessToken)
        await plaidRequest(
          "/item/remove",
          { access_token: item.accessToken },
          item.environment,
        );
      await ctx.runMutation(internal.plaidInternal.disconnectFinish, {
        itemId: item._id,
      });
    } catch (error) {
      if (
        error instanceof PlaidFailure &&
        ["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(error.code)
      )
        await ctx.runMutation(internal.plaidInternal.disconnectFinish, {
          itemId: item._id,
        });
      else {
        const message =
          "Sync has stopped, but Plaid could not finish revoking access. Retry Disconnect to finish.";
        await ctx.runMutation(internal.plaidInternal.disconnectFinish, {
          itemId: item._id,
          error: message,
        });
        throw new ConvexError(message);
      }
    }
    return null;
  },
});
function productSet(item: PlaidItem): string[] {
  return [
    ...new Set([...(item.products ?? []), ...(item.consented_products ?? [])]),
  ].filter((p) => ["transactions", "liabilities", "investments"].includes(p));
}
type Liability = {
  account_id: string;
  last_statement_balance?: number | null;
  minimum_payment_amount?: number | null;
  next_monthly_payment?: number | null;
  next_payment_due_date?: string | null;
  last_statement_issue_date?: string | null;
};
async function fetchTransactions(
  ctx: ActionCtx,
  item: Doc<"plaidItems">,
  version: number,
) {
  // Do not persist pages until the full pagination loop succeeds. On mutation, discard
  // every page and restart from the last committed cursor, as Plaid requires.
  for (let attempt = 0; attempt < 3; attempt++) {
    const changed = new Map<string, BankTransaction>();
    const removed = new Set<string>();
    let cursor = item.cursor;
    try {
      for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
        await ctx.runMutation(internal.plaidInternal.heartbeat, {
          itemId: item._id,
          version,
        });
        const page = await plaidRequest<SyncPage>(
          "/transactions/sync",
          {
            access_token: item.accessToken,
            ...(cursor ? { cursor } : {}),
            count: 500,
            // Applies when Transactions is first initialized after an investments-only Link.
            options: { days_requested: 730 },
          },
          item.environment,
        );
        for (const tx of [...page.added, ...page.modified]) {
          changed.set(tx.transaction_id, normalizeTransaction(tx));
          removed.delete(tx.transaction_id);
        }
        for (const tx of page.removed) removed.add(tx.transaction_id);
        cursor = page.next_cursor;
        if (!page.has_more)
          return {
            transactions: [...changed.values()],
            removed: [...removed],
            cursor,
          };
      }
      throw new PlaidFailure("SYNC_TOO_LARGE");
    } catch (error) {
      if (
        !(error instanceof PlaidFailure) ||
        error.code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new PlaidFailure("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION");
}
async function runSync(
  ctx: ActionCtx,
  itemId: Id<"plaidItems">,
): Promise<null> {
  const item: Doc<"plaidItems"> | null = await ctx.runMutation(
    internal.plaidInternal.acquire,
    { itemId },
  );
  if (!item) return null;
  const version = item.syncVersion!;
  try {
    const result = await plaidRequest<{
      accounts: PlaidAccount[];
      item: PlaidItem;
    }>("/accounts/get", { access_token: item.accessToken }, item.environment);
    const products = productSet(result.item);
    let warning: string | undefined;
    // USD-only is explicit: reject an unsupported connection instead of adding unlike currencies.
    const accounts: BankAccount[] = result.accounts.map(normalizeAccount);
    const hasDebt = accounts.some(
      (a) => a.kind === "credit" || a.kind === "loan",
    );
    if (hasDebt && products.includes("liabilities")) {
      try {
        const data = await plaidRequest<{
          liabilities: {
            credit?: Liability[] | null;
            student?: Liability[] | null;
            mortgage?: Liability[] | null;
          };
        }>(
          "/liabilities/get",
          { access_token: item.accessToken },
          item.environment,
        );
        const byId = new Map(
          [
            ...(data.liabilities.credit ?? []),
            ...(data.liabilities.student ?? []),
            ...(data.liabilities.mortgage ?? []),
          ].map((l) => [l.account_id, l]),
        );
        for (const a of accounts) {
          const l = byId.get(a.accountId);
          if (!l) continue;
          if (l.last_statement_balance != null)
            a.statementCents = bankCents(l.last_statement_balance);
          const minimum = l.minimum_payment_amount ?? l.next_monthly_payment;
          if (minimum != null) a.minimumCents = bankCents(minimum);
          if (l.next_payment_due_date) a.dueDate = l.next_payment_due_date;
          if (l.last_statement_issue_date)
            a.statementDate = l.last_statement_issue_date;
        }
      } catch (error) {
        warning = `Balances are available. Statement details could not update. ${error instanceof PlaidFailure ? error.message : safeError("UNKNOWN")}`;
      }
    }
    await ctx.runMutation(internal.plaidInternal.updateAccounts, {
      itemId,
      version,
      accounts,
      ...(item.logoUrl ? { logoUrl: item.logoUrl } : {}),
    });
    const updates =
      products.includes("transactions") &&
      accounts.some((a) => a.kind !== "investment")
        ? await fetchTransactions(ctx, item, version)
        : null;
    if (updates) {
      // Bounded, idempotent writes prevent an initial history import hitting mutation limits.
      // All posted identities are applied before removals, so pending records survive posting.
      for (let i = 0; i < updates.transactions.length; i += 10)
        await ctx.runMutation(internal.plaidInternal.ingestTransactions, {
          itemId,
          version,
          transactions: updates.transactions.slice(i, i + 10),
        });
      for (let i = 0; i < updates.removed.length; i += 100)
        await ctx.runMutation(internal.plaidInternal.removeTransactions, {
          itemId,
          version,
          transactionIds: updates.removed.slice(i, i + 100),
        });
    }
    if (accounts.some((account) => account.kind === "investment")) {
      try {
        if (!products.includes("investments"))
          throw new ConvexError(
            "Reconnect this bank to share investment holdings and activity.",
          );
        await syncInvestments(ctx, item, version);
      } catch (error) {
        const message =
          error instanceof PlaidFailure
            ? error.message
            : error instanceof ConvexError && typeof error.data === "string"
              ? error.data
              : "Investment data could not update. Previous data has been kept.";
        await ctx.runMutation(internal.investmentInternal.fail, {
          itemId,
          version,
          error: message,
        });
        warning = [warning, message].filter(Boolean).join(" ");
      }
    }
    // Only publish the new cursor after all account and transaction writes have succeeded.
    await ctx.runMutation(internal.plaidInternal.finish, {
      itemId,
      version,
      products,
      ...(updates ? { cursor: updates.cursor } : {}),
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    await ctx.runMutation(internal.plaidInternal.fail, {
      itemId,
      version,
      error:
        error instanceof PlaidFailure
          ? error.message
          : error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : safeError("UNKNOWN"),
    });
  }
  return null;
}
export const syncItem = internalAction({
  args: { itemId: v.id("plaidItems") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => await runSync(ctx, args.itemId),
});
