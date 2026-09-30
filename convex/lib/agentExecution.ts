import { automaticPaymentsForUser } from "./recurringPayments";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { owned, date, type UserRead } from "./access";
import {
  COMPACT_EXTRA_FIELDS,
  DEFAULT_PAGE_SIZE,
  agentToolSchemas,
  type AgentToolName,
} from "./agentTools";
import { readTaxonomy, readWorkspace, saveAccountForUser } from "../workspace";
import {
  listTransactionsForUser,
  updateOne,
  type TransactionReviewFilters,
} from "../transactions";
import {
  saveRecurringForUser,
  recurringPaymentsForUser,
  setRecurringPaidForUser,
  detectRecurringForUser,
} from "../recurring";
import {
  listForecastsForUser,
  forecastBaselineForUser,
  saveForecastForUser,
} from "../forecasting";
import {
  investmentOverviewForUser,
  investmentActivityForUser,
} from "../investments";
import { creditScoresForUser } from "../creditScores";
import {
  mergeCategoriesForUser,
  mergeMerchantsForUser,
  reorderRulesForUser,
  saveCategoryForUser,
  saveMerchantForUser,
  saveRuleForUser,
  saveTagForUser,
} from "../settings";
import { runForecast, type ForecastInputs } from "./forecast";
import { normalize, recurringDates } from "./finance";
import { unionTags } from "./transactions";
import {
  createAgentAccount,
  recordAccountSnapshots,
  recordBalanceHistory,
  saveCreditScoreFromAgent,
  type AgentWriteCtx,
} from "./agentSnapshots";

export function agentId<T extends TableNames>(
  ctx: UserRead,
  table: T,
  value: string,
): Id<T> {
  const id = ctx.db.normalizeId(table, value);
  if (!id) throw new ConvexError("This item is unavailable.");
  return id;
}
function checkRange(from?: string, to?: string) {
  if (from) date(from);
  if (to) date(to);
  if (from && to && from > to)
    throw new ConvexError("Choose a valid date range.");
}

/** Provider identifiers, secrets, blob URLs and internal ownership never leave the tool boundary. */
export function agentData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(agentData);
  if (value && typeof value === "object") {
    const omit = new Set([
      "userId",
      "itemId",
      "plaidAccountId",
      "plaidTransactionId",
      "pendingTransactionId",
      "_creationTime",
      "logoStorageId",
      "photoStorageId",
      "storageId",
      "resolvedLogoUrl",
      "avatarUrl",
      "logoUrl",
      "searchText",
      "importKey",
    ]);
    const entries = Object.entries(value).filter(
      ([key, item]) =>
        item !== undefined &&
        !omit.has(key) &&
        !/token|secret|password|credential|^simplefin|^plaid/i.test(key),
    );
    return Object.fromEntries(
      entries.flatMap(([key, item]) => {
        const pair: [string, unknown][] = [[key, agentData(item)]];
        // Epoch timestamps are hard to read; add an ISO twin without replacing the number.
        if (
          /At$/.test(key) &&
          typeof item === "number" &&
          Number.isFinite(item) &&
          item > 1e12
        )
          pair.push([`${key}Iso`, new Date(item).toISOString()]);
        return pair;
      }),
    );
  }
  return value;
}

/** Paginated results end with a null cursor so a client never has to compare cursors. */
function agentPage<
  T extends {
    isDone: boolean;
    continueCursor: string;
    splitCursor?: unknown;
    pageStatus?: unknown;
  },
>(result: T) {
  // Convex's split cursor and page status are client-library details.
  const { splitCursor: _split, pageStatus: _status, ...rest } = result;
  return {
    ...rest,
    continueCursor: result.isDone ? null : result.continueCursor,
  };
}

/**
 * Merchant rows say whether a logo exists without exposing where it is
 * stored; agentData strips the storage id and URL.
 */
function merchantView(merchant: Doc<"merchants">) {
  return {
    ...merchant,
    hasLogo: Boolean(merchant.logoStorageId || merchant.logoUrl),
  };
}

/** How many merchants and statement hits a merchantSearch reads. */
const MERCHANT_SEARCH_SCAN = 2000;
const STATEMENT_SEARCH_HITS = 50;
/** Merchants one missingLogo page may scan before returning what it found. */
const MERCHANT_FILTER_SCAN = 2000;

type ListTransactionsInput = z.infer<
  (typeof agentToolSchemas)["list_transactions"]
>;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
/** updatedSince accepts a calendar date (midnight UTC) or an ISO timestamp. */
export function parseInstant(value: string) {
  const ms = ISO_INSTANT.test(value)
    ? Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value)
    : NaN;
  if (!Number.isFinite(ms))
    throw new ConvexError(
      "updatedSince must be an ISO date such as 2026-09-27 or a timestamp such as 2026-09-27T14:00:00Z.",
    );
  return ms;
}
/** The categories named Uncategorized; none means nothing can match. */
async function uncategorizedIds(ctx: UserRead) {
  const { categories } = await readTaxonomy(ctx);
  return categories
    .filter((category) => normalize(category.name) === "uncategorized")
    .map((category) => category._id);
}
async function reviewFilters(
  ctx: UserRead,
  args: ListTransactionsInput,
): Promise<TransactionReviewFilters | null> {
  const categoryIds = args.uncategorized
    ? await uncategorizedIds(ctx)
    : args.categoryIds?.map((value) => agentId(ctx, "categories", value));
  if (categoryIds && !categoryIds.length) return null;
  return {
    reviewed: args.reviewed,
    pending: args.pending,
    hidden: args.hidden,
    source: args.source,
    updatedSince:
      args.updatedSince === undefined
        ? undefined
        : parseInstant(args.updatedSince),
    categoryIds,
    tagId: args.tagId ? agentId(ctx, "tags", args.tagId) : undefined,
  };
}
type DescribedTransaction = Awaited<
  ReturnType<ReturnType<typeof nameResolver>>
>;
/** The few fields a cleanup pass scans, plus any extras the caller named. */
function compactRow(
  row: DescribedTransaction,
  extras: readonly (typeof COMPACT_EXTRA_FIELDS)[number][] = [],
) {
  return {
    id: row._id,
    date: row.date,
    amountCents: row.amountCents,
    merchantName: row.merchantName,
    categoryName: row.categoryName,
    accountName: row.accountName,
    ...Object.fromEntries(extras.map((field) => [field, row[field]])),
  };
}

/** Resolves display names for ids on a page with one cached lookup per distinct id. */
function nameResolver(ctx: UserRead) {
  const cache = new Map<string, Promise<string | null>>();
  const lookup = (
    id: string,
    table: "accounts" | "merchants" | "categories" | "tags",
  ) => {
    let pending = cache.get(id);
    if (!pending) {
      pending = ctx.db
        .get(ctx.db.normalizeId(table, id)!)
        .then((row) =>
          row && "userId" in row && row.userId === ctx.userId && "name" in row
            ? row.name
            : null,
        );
      cache.set(id, pending);
    }
    return pending;
  };
  return async function describe(tx: Doc<"transactions">) {
    const [accountName, merchantName, categoryName, tagNames] =
      await Promise.all([
        lookup(tx.accountId, "accounts"),
        lookup(tx.merchantId, "merchants"),
        lookup(tx.categoryId, "categories"),
        Promise.all(tx.tagIds.map((tag) => lookup(tag, "tags"))),
      ]);
    return {
      ...tx,
      accountName,
      merchantName,
      categoryName,
      tagNames: tagNames.filter((name): name is string => name !== null),
      direction:
        tx.amountCents > 0 ? "outflow" : tx.amountCents < 0 ? "inflow" : "zero",
    };
  };
}

export function netWorthCents(accounts: Doc<"accounts">[]) {
  return accounts.reduce(
    (total, account) =>
      account.currency !== "USD" || account.closed || account.excludeNetWorth
        ? total
        : total +
          (account.kind === "credit" || account.kind === "loan"
            ? -account.balanceCents
            : account.balanceCents),
    0,
  );
}
const NET_WORTH_RULE =
  "USD accounts that are open and not excludeNetWorth; credit and loan balances subtract.";

export function returnAssumptionApplies(inputs: ForecastInputs) {
  return inputs.investmentCents !== 0 || inputs.retirementCents !== 0;
}
export function forecastWarnings(inputs: ForecastInputs) {
  const warnings: string[] = [];
  if (inputs.annualReturnPct !== 0 && !returnAssumptionApplies(inputs))
    warnings.push(
      "annualReturnPct only compounds investmentCents and retirementCents, and both are 0, so the return assumption changes nothing. Move invested money into those fields if it should grow.",
    );
  if (inputs.monthlyIncomeCents === 0 && inputs.monthlySpendingCents === 0)
    warnings.push(
      "monthlyIncomeCents and monthlySpendingCents are both 0; the scenario models no cash flow before retirement.",
    );
  return warnings;
}

async function profileFor(ctx: UserRead) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .unique();
  if (!profile) throw new ConvexError("Set up your workspace first.");
  return profile;
}
function preferenceView(profile: Doc<"profiles">) {
  return {
    name: profile.name,
    reviewNew: profile.reviewNew,
    allowPending: profile.allowPending,
    investmentActivity: profile.investmentActivity ?? false,
    widgets: profile.widgets,
  };
}
async function nextOrder(rows: { order: number }[]) {
  return rows.reduce((max, row) => Math.max(max, row.order), -1) + 1;
}

export async function executeAgentRead(
  ctx: UserRead,
  name: AgentToolName,
  input: unknown,
  now: number,
): Promise<unknown> {
  switch (name) {
    case "get_accounts": {
      agentToolSchemas[name].parse(input);
      const data = await readWorkspace(ctx);
      return {
        accounts: data.accounts,
        netWorthCents: netWorthCents(data.accounts),
        netWorthRule: NET_WORTH_RULE,
        complete: true,
        freshness: "Cached balances; updatedAt is supplied per account.",
      };
    }
    case "get_classifications": {
      const args = agentToolSchemas[name].parse(input);
      const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE;
      const withLogoFilter = (merchant: Doc<"merchants">) =>
        !args.missingLogo || !merchantView(merchant).hasLogo;
      let taxonomy = {};
      if (!args.merchantsOnly) {
        const { groups, categories, tags } = await readTaxonomy(ctx);
        const groupById = new Map(groups.map((group) => [group._id, group]));
        taxonomy = {
          groups,
          categories: categories.map((category) => ({
            ...category,
            groupName: groupById.get(category.groupId)?.name ?? null,
            groupKind: groupById.get(category.groupId)?.kind ?? null,
          })),
          tags,
        };
      }
      if (args.merchantSearch?.trim()) {
        const term = args.merchantSearch.trim(),
          needle = term.toLowerCase();
        const scanned = await ctx.db
          .query("merchants")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(MERCHANT_SEARCH_SCAN + 1);
        const all = scanned.slice(0, MERCHANT_SEARCH_SCAN);
        const byId = new Map(all.map((merchant) => [merchant._id, merchant]));
        const byName = all.filter(
          (merchant) =>
            merchant.name.toLowerCase().includes(needle) ||
            merchant.normalizedName.includes(needle),
        );
        // Users often name a merchant by what their statement says, so also
        // resolve merchants through matching transaction text.
        const statementRows = await ctx.db
          .query("transactions")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", term).eq("userId", ctx.userId),
          )
          .take(STATEMENT_SEARCH_HITS + 1);
        const named = new Set(byName.map((merchant) => merchant._id));
        const byStatement: Doc<"merchants">[] = [];
        for (const merchantId of new Set(
          statementRows
            .slice(0, STATEMENT_SEARCH_HITS)
            .map((row) => row.merchantId),
        )) {
          if (named.has(merchantId)) continue;
          // Merchants beyond the scanned set are still resolved by id.
          const merchant =
            byId.get(merchantId) ?? (await ctx.db.get(merchantId));
          if (merchant && merchant.userId === ctx.userId)
            byStatement.push(merchant);
        }
        const matches = [
          ...byName.filter(withLogoFilter).map((merchant) => ({
            ...merchantView(merchant),
            matchedBy: "name",
          })),
          ...byStatement.filter(withLogoFilter).map((merchant) => ({
            ...merchantView(merchant),
            matchedBy: "statement text",
          })),
        ];
        // Complete only if nothing was cut off: the merchant scan, the
        // statement hits, and the page itself.
        const complete =
          scanned.length <= MERCHANT_SEARCH_SCAN &&
          statementRows.length <= STATEMENT_SEARCH_HITS &&
          matches.length <= pageSize;
        return {
          ...taxonomy,
          merchants: matches.slice(0, pageSize),
          merchantSearch: term,
          continueCursor: null,
          isDone: true,
          complete,
          ...(complete
            ? {}
            : {
                hint: "Some matches may be missing. Use a more specific merchantSearch, or page merchants without it.",
              }),
        };
      }
      const merchants = args.missingLogo
        ? await ctx.db
            .query("merchants")
            .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
            .filter((q) =>
              q.and(
                q.eq(q.field("logoUrl"), undefined),
                q.eq(q.field("logoStorageId"), undefined),
              ),
            )
            .paginate({
              cursor: args.cursor ?? null,
              numItems: pageSize,
              maximumRowsRead: MERCHANT_FILTER_SCAN,
            })
        : await ctx.db
            .query("merchants")
            .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
            .paginate({ cursor: args.cursor ?? null, numItems: pageSize });
      return {
        ...taxonomy,
        ...agentPage({
          merchants: merchants.page.filter(withLogoFilter).map(merchantView),
          continueCursor: merchants.continueCursor,
          isDone: merchants.isDone,
        }),
        complete: merchants.isDone && !args.cursor,
      };
    }
    case "list_transactions": {
      const args = agentToolSchemas[name].parse(input);
      checkRange(args.from, args.to);
      const filters = await reviewFilters(ctx, args);
      if (!filters)
        return {
          page: [],
          isDone: true,
          continueCursor: null,
          hint: "No category is named Uncategorized, so no transaction is uncategorized.",
        };
      const result = await listTransactionsForUser(
        ctx,
        {
          from: args.from,
          to: args.to,
          search: args.search,
          accountId: args.accountId
            ? agentId(ctx, "accounts", args.accountId)
            : undefined,
          merchantId: args.merchantId
            ? agentId(ctx, "merchants", args.merchantId)
            : undefined,
          paginationOpts: {
            cursor: args.cursor ?? null,
            numItems: args.pageSize ?? DEFAULT_PAGE_SIZE,
          },
        },
        filters,
      );
      const describe = nameResolver(ctx);
      const rows = await Promise.all(result.page.map(describe));
      return {
        ...agentPage(result),
        page: args.compact
          ? rows.map((row) => compactRow(row, args.fields))
          : rows,
        order: args.search?.trim()
          ? "search relevance"
          : "newest first by date",
      };
    }
    case "get_transaction": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "transactions", args.id);
      const transaction = await owned(ctx, id);
      const history = await ctx.db
        .query("activity")
        .withIndex("by_transactionId", (q) => q.eq("transactionId", id))
        .order("desc")
        .take(51);
      return {
        transaction: await nameResolver(ctx)(transaction),
        activity: history.slice(0, 50).map(({ _creationTime, ...entry }) => ({
          ...entry,
          createdAt: _creationTime,
        })),
        activityComplete: history.length <= 50,
      };
    }
    case "get_rules": {
      agentToolSchemas[name].parse(input);
      const data = await readWorkspace(ctx);
      const nameOf = (
        rows: { _id: string; name: string }[],
        id: string | undefined,
      ) => rows.find((row) => row._id === id)?.name ?? null;
      return {
        rules: data.rules.map((rule) => ({
          ...rule,
          conditions: rule.conditions.map((condition) => ({
            ...condition,
            ...(condition.field === "account"
              ? { accountName: nameOf(data.accounts, condition.value) }
              : condition.field === "category"
                ? { categoryName: nameOf(data.categories, condition.value) }
                : {}),
          })),
          actionNames: {
            merchant: nameOf(data.merchants, rule.actions.merchantId),
            category: nameOf(data.categories, rule.actions.categoryId),
            tags: (rule.actions.tagIds ?? []).map((tag) =>
              nameOf(data.tags, tag),
            ),
          },
        })),
        complete: true,
        order: "Rules run top to bottom on new imports when enabled.",
      };
    }
    case "get_preferences": {
      agentToolSchemas[name].parse(input);
      return { preferences: preferenceView(await profileFor(ctx)) };
    }
    case "list_recurring": {
      agentToolSchemas[name].parse(input);
      const data = await readWorkspace(ctx);
      const nameOf = (rows: { _id: string; name: string }[], id: string) =>
        rows.find((row) => row._id === id)?.name ?? null;
      return {
        recurring: data.recurring.map((schedule) => ({
          ...schedule,
          merchantName: nameOf(data.merchants, schedule.merchantId),
          accountName: nameOf(data.accounts, schedule.accountId),
          categoryName: nameOf(data.categories, schedule.categoryId),
        })),
        statements: data.accounts
          .filter((account) => account.dueDate || account.statementReminder)
          .map((account) => ({
            accountId: account._id,
            name: account.name,
            dueDate: account.dueDate,
            statementCents: account.statementCents,
            minimumCents: account.minimumCents,
            statementPaidDate: account.statementPaidDate,
            reminder: account.statementReminder,
          })),
        complete: true,
      };
    }
    case "detect_recurring": {
      agentToolSchemas[name].parse(input);
      return await detectRecurringForUser(ctx, { now });
    }
    case "list_recurring_payments": {
      const args = agentToolSchemas[name].parse(input);
      const manual = await recurringPaymentsForUser(ctx, {
        ...args,
        paginationOpts: {
          cursor: args.cursor ?? null,
          numItems: args.pageSize ?? DEFAULT_PAGE_SIZE,
        },
      });
      return {
        ...agentPage(manual),
        automaticMatches: await automaticPaymentsForUser(
          ctx,
          args.from,
          args.to,
        ),
        statusRule:
          "Manual paid and unpaid choices in page override automaticMatches. Load every page before calculating unpaid totals.",
      };
    }
    case "list_forecasts": {
      agentToolSchemas[name].parse(input);
      return { scenarios: await listForecastsForUser(ctx), complete: true };
    }
    case "get_forecast_baseline": {
      const baseline = await forecastBaselineForUser(
        ctx,
        agentToolSchemas[name].parse(input),
      );
      // The engine fills in illustrative ages and rates; say exactly which fields are real.
      const observedFields = [
        "asOfDate",
        "cashCents",
        "investmentCents",
        "retirementCents",
        "monthlyIncomeCents",
        "monthlySpendingCents",
        "retirementMonthlySpendingCents",
      ];
      return {
        ...baseline,
        observedFields,
        exampleFields: Object.keys(baseline.inputs).filter(
          (field) =>
            !observedFields.includes(field) && field !== "schemaVersion",
        ),
      };
    }
    case "run_forecast": {
      const inputs = agentToolSchemas[name].parse(input).inputs;
      let modeled;
      try {
        modeled = runForecast(inputs);
      } catch (error) {
        throw new ConvexError(
          error instanceof Error
            ? error.message
            : "Review the forecast assumptions.",
        );
      }
      const { months, ...result } = modeled;
      return {
        modeled: true,
        interval: "annual",
        modeledMonths: months.length - 1,
        returnAssumptionApplies: returnAssumptionApplies(inputs),
        warnings: forecastWarnings(inputs),
        ...result,
      };
    }
    case "get_investments": {
      const args = agentToolSchemas[name].parse(input);
      return {
        ...(await investmentOverviewForUser(ctx, {
          accountId: args.accountId
            ? agentId(ctx, "accounts", args.accountId)
            : undefined,
        })),
        complete: true,
      };
    }
    case "list_investment_activity": {
      const args = agentToolSchemas[name].parse(input);
      return agentPage(
        await investmentActivityForUser(ctx, {
          from: args.from,
          to: args.to,
          accountId: args.accountId
            ? agentId(ctx, "accounts", args.accountId)
            : undefined,
          paginationOpts: {
            cursor: args.cursor ?? null,
            numItems: args.pageSize ?? DEFAULT_PAGE_SIZE,
          },
        }),
      );
    }
    case "list_credit_scores": {
      agentToolSchemas[name].parse(input);
      return { observations: await creditScoresForUser(ctx), complete: true };
    }
    default:
      throw new ConvexError("This read tool is unavailable.");
  }
}

/** Rows per merge call; category merges only rewrite matches, merchant merges rewrite every row. */
const AGENT_CATEGORY_MERGE_PAGE = 2000;
const AGENT_MERCHANT_MERGE_PAGE = 500;
/** set_merchant_logo's internal form: the action adds the image it stored. */
const logoWriteSchema = agentToolSchemas.set_merchant_logo.extend({
  storageId: z.string().min(1).max(128),
});

type TransactionPatch = NonNullable<
  ReturnType<(typeof agentToolSchemas)["update_transaction"]["parse"]>["patch"]
>;
function resolvePatch(ctx: UserRead, patch: TransactionPatch) {
  const { categoryId, merchantId, tagIds, splits, ...annotations } = patch;
  return {
    ...annotations,
    ...(categoryId
      ? { categoryId: agentId(ctx, "categories", categoryId) }
      : {}),
    ...(merchantId
      ? { merchantId: agentId(ctx, "merchants", merchantId) }
      : {}),
    ...(tagIds
      ? { tagIds: tagIds.map((value) => agentId(ctx, "tags", value)) }
      : {}),
    ...(splits
      ? {
          splits: splits.map((split) => ({
            ...split,
            categoryId: agentId(ctx, "categories", split.categoryId),
          })),
        }
      : {}),
  };
}

export async function executeAgentWrite(
  ctx: AgentWriteCtx,
  name: AgentToolName,
  input: unknown,
): Promise<unknown> {
  switch (name) {
    case "update_transaction": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "transactions", args.id);
      const describe = nameResolver(ctx);
      const before = await describe(await owned(ctx, id));
      await updateOne(ctx, id, resolvePatch(ctx, args.patch));
      return { before, after: await describe(await owned(ctx, id)) };
    }
    case "update_transactions": {
      const args = agentToolSchemas[name].parse(input);
      const ids = [...new Set(args.ids)].map((value) =>
        agentId(ctx, "transactions", value),
      );
      const patch = args.patch ? resolvePatch(ctx, args.patch) : {};
      const tagChange = args.tagChange && {
        mode: args.tagChange.mode,
        tagIds: args.tagChange.tagIds.map((value) =>
          agentId(ctx, "tags", value),
        ),
      };
      // Removed tags are not re-validated by the row check, so own them here.
      for (const tagId of tagChange?.tagIds ?? []) await owned(ctx, tagId);
      const fields = [
        ...new Set([
          ...Object.keys(args.patch ?? {}),
          ...(tagChange ? ["tagIds"] : []),
        ]),
      ] as (keyof Doc<"transactions">)[];
      const snapshot = (row: Doc<"transactions">) =>
        Object.fromEntries(fields.map((field) => [field, row[field]]));
      // Ownership and validation run inside one mutation, so a bad id reverts every change.
      const rows = [];
      for (const id of ids) {
        const current = await owned(ctx, id);
        const changes = { ...patch };
        if (tagChange)
          changes.tagIds =
            tagChange.mode === "add"
              ? unionTags(current.tagIds, tagChange.tagIds)
              : current.tagIds.filter((tag) => !tagChange.tagIds.includes(tag));
        await updateOne(ctx, id, changes);
        rows.push({
          id,
          before: snapshot(current),
          after: snapshot(await owned(ctx, id)),
        });
      }
      return {
        updated: ids.length,
        changed: fields,
        rows,
        atomic: true,
      };
    }
    case "update_account": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "accounts", args.id),
        before = await owned(ctx, id);
      const {
        name: accountName,
        institution,
        mask,
        kind,
        subtype,
        balanceCents,
        currency,
        hidden,
        excludeNetWorth,
        closed,
        availableCents,
        limitCents,
        statementCents,
        minimumCents,
        dueDate,
        statementDate,
        apy,
      } = before;
      await saveAccountForUser(ctx, {
        id,
        name: accountName,
        institution,
        mask,
        kind,
        subtype,
        balanceCents,
        currency,
        hidden,
        excludeNetWorth,
        closed,
        availableCents,
        limitCents,
        statementCents,
        minimumCents,
        dueDate,
        statementDate,
        apy,
        ...args.patch,
      });
      return { before, after: await owned(ctx, id) };
    }
    case "update_merchant": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "merchants", args.id),
        before = await owned(ctx, id);
      await saveMerchantForUser(ctx, {
        id,
        name: args.patch.name ?? before.name,
        color: args.patch.color ?? before.color,
      });
      return {
        before: merchantView(before),
        after: merchantView(await owned(ctx, id)),
        hint: "Search text for this merchant's transactions is refreshed in the background. The old name is kept as an alias so future bank syncs land on this merchant.",
      };
    }
    case "create_merchant": {
      const args = agentToolSchemas[name].parse(input);
      const existing = await ctx.db
        .query("merchants")
        .withIndex("by_userId_and_normalizedName", (q) =>
          q.eq("userId", ctx.userId).eq("normalizedName", normalize(args.name)),
        )
        .unique();
      if (existing) return { created: null, existing: merchantView(existing) };
      const id = await saveMerchantForUser(ctx, {
        name: args.name,
        color: args.color ?? "#64748b",
      });
      return { created: merchantView(await owned(ctx, id)) };
    }
    case "merge_merchants": {
      const args = agentToolSchemas[name].parse(input);
      const sourceId = agentId(ctx, "merchants", args.sourceId),
        targetId = agentId(ctx, "merchants", args.targetId);
      const source = await owned(ctx, sourceId),
        target = await owned(ctx, targetId);
      const step = await mergeMerchantsForUser(ctx, {
        sourceId,
        targetId,
        cursor: args.cursor,
        pageSize: AGENT_MERCHANT_MERGE_PAGE,
      });
      return {
        merged: { id: sourceId, name: source.name },
        into: { id: targetId, name: target.name },
        movedTransactions: step.updated,
        done: step.done,
        cursor: step.done || !step.cursor ? null : step.cursor,
        ...(step.done
          ? {}
          : {
              next: "Call merge_merchants again with the same ids and this cursor (null restarts the final check) until done is true.",
            }),
      };
    }
    case "set_merchant_logo": {
      // Only reached from the action that fetched and stored the image; the
      // public schema is strict, so an assistant cannot supply storageId.
      const args = logoWriteSchema.parse(input);
      const merchantId = agentId(ctx, "merchants", args.merchantId);
      const before = await owned(ctx, merchantId);
      const storageId = ctx.db.system.normalizeId("_storage", args.storageId);
      if (!storageId || !(await ctx.db.system.get(storageId)))
        throw new ConvexError("The logo couldn’t be saved. Please try again.");
      if (before.logoStorageId && before.logoStorageId !== storageId)
        await ctx.storage.delete(before.logoStorageId);
      await ctx.db.patch(merchantId, {
        logoStorageId: storageId,
        logoUrl: undefined,
      });
      return {
        merchant: merchantView(await owned(ctx, merchantId)),
        replacedLogo: merchantView(before).hasLogo,
        domain: args.domain,
      };
    }
    case "create_category": {
      const args = agentToolSchemas[name].parse(input);
      // Only the order needs reading; merchants and accounts would widen the
      // mutation's read set and its conflicts with bank syncs.
      const categories = await ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(501);
      if (categories.length > 500)
        throw new ConvexError("A workspace can have up to 500 categories.");
      const id = await saveCategoryForUser(ctx, {
        groupId: agentId(ctx, "groups", args.groupId),
        name: args.name,
        emoji: args.emoji ?? "🏷️",
        order: await nextOrder(categories),
        enabled: true,
      });
      return { created: await owned(ctx, id) };
    }
    case "update_category": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "categories", args.id),
        before = await owned(ctx, id);
      await saveCategoryForUser(ctx, {
        id,
        groupId: args.patch.groupId
          ? agentId(ctx, "groups", args.patch.groupId)
          : before.groupId,
        name: args.patch.name ?? before.name,
        emoji: args.patch.emoji ?? before.emoji,
        order: before.order,
        enabled: args.patch.enabled ?? before.enabled,
      });
      return { before, after: await owned(ctx, id) };
    }
    case "merge_categories": {
      const args = agentToolSchemas[name].parse(input);
      const sourceId = agentId(ctx, "categories", args.sourceId),
        targetId = agentId(ctx, "categories", args.targetId);
      const source = await owned(ctx, sourceId),
        target = await owned(ctx, targetId);
      // Convex allows one paginated read per call, so each call handles one
      // large page and returns a cursor; the source is deleted on the last.
      const step = await mergeCategoriesForUser(ctx, {
        sourceId,
        targetId,
        cursor: args.cursor ?? null,
        pageSize: AGENT_CATEGORY_MERGE_PAGE,
      });
      return {
        merged: { id: sourceId, name: source.name },
        into: { id: targetId, name: target.name },
        updatedTransactions: step.updated,
        done: step.done,
        cursor: step.done ? null : step.cursor,
        ...(step.done
          ? {}
          : {
              next: "Call merge_categories again with the same ids and this cursor until done is true.",
            }),
      };
    }
    case "create_tag": {
      const args = agentToolSchemas[name].parse(input);
      const tags = await ctx.db
        .query("tags")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201);
      if (tags.length >= 200)
        throw new ConvexError("A workspace can have up to 200 tags.");
      const id = await saveTagForUser(ctx, {
        name: args.name,
        color: args.color ?? "#64748b",
        order: await nextOrder(tags),
      });
      return { created: await owned(ctx, id) };
    }
    case "update_tag": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "tags", args.id),
        before = await owned(ctx, id);
      await saveTagForUser(ctx, {
        id,
        name: args.patch.name ?? before.name,
        color: args.patch.color ?? before.color,
        order: before.order,
      });
      return { before, after: await owned(ctx, id) };
    }
    case "save_rule": {
      const args = agentToolSchemas[name].parse(input);
      const id = args.id ? agentId(ctx, "rules", args.id) : undefined;
      const before = id ? await owned(ctx, id) : null;
      // The last rule by order is all a new rule needs to go after it.
      const lastRule = await ctx.db
        .query("rules")
        .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
        .order("desc")
        .first();
      const { merchantId, categoryId, tagIds, splits, ...flags } = args.actions;
      const saved = await saveRuleForUser(ctx, {
        id,
        name: args.name,
        match: args.match,
        conditions: args.conditions.map((condition) => ({
          ...condition,
          value:
            condition.field === "account"
              ? agentId(ctx, "accounts", condition.value)
              : condition.field === "category"
                ? agentId(ctx, "categories", condition.value)
                : condition.value,
        })),
        actions: {
          ...flags,
          ...(merchantId
            ? { merchantId: agentId(ctx, "merchants", merchantId) }
            : {}),
          ...(categoryId
            ? { categoryId: agentId(ctx, "categories", categoryId) }
            : {}),
          ...(tagIds
            ? { tagIds: tagIds.map((tag) => agentId(ctx, "tags", tag)) }
            : {}),
          ...(splits
            ? {
                splits: splits.map((split) => ({
                  ...split,
                  categoryId: agentId(ctx, "categories", split.categoryId),
                })),
              }
            : {}),
        },
        enabled: args.enabled ?? before?.enabled ?? true,
        order: before?.order ?? (lastRule ? lastRule.order + 1 : 0),
      });
      return {
        before,
        after: await owned(ctx, saved),
        hint: "Applies to future imports. Call apply_rule to update existing transactions.",
      };
    }
    case "reorder_rules": {
      const args = agentToolSchemas[name].parse(input);
      await reorderRulesForUser(
        ctx,
        args.ids.map((value) => agentId(ctx, "rules", value)),
      );
      const rules = await ctx.db
        .query("rules")
        .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
        .take(201);
      return {
        rules: rules.map(({ _id, name: ruleName, order, enabled }) => ({
          _id,
          name: ruleName,
          order,
          enabled,
        })),
        order: "Rules run top to bottom on new imports when enabled.",
      };
    }
    case "update_preferences": {
      const args = agentToolSchemas[name].parse(input);
      const profile = await profileFor(ctx);
      await ctx.db.patch(profile._id, args.patch);
      return {
        before: preferenceView(profile),
        after: preferenceView((await ctx.db.get(profile._id))!),
      };
    }
    case "create_recurring": {
      const args = agentToolSchemas[name].parse(input);
      const id = await saveRecurringForUser(ctx, {
        ...args,
        source: "manual",
        merchantId: agentId(ctx, "merchants", args.merchantId),
        accountId: agentId(ctx, "accounts", args.accountId),
        categoryId: agentId(ctx, "categories", args.categoryId),
      });
      return { created: await owned(ctx, id) };
    }
    case "update_recurring": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "recurring", args.id),
        before = await owned(ctx, id);
      const {
        _id: _id,
        _creationTime: _time,
        userId: _owner,
        ...fields
      } = before;
      await saveRecurringForUser(ctx, { ...fields, ...args.patch, id });
      return { before, after: await owned(ctx, id) };
    }
    case "set_recurring_paid": {
      const args = agentToolSchemas[name].parse(input);
      const recurringId = agentId(ctx, "recurring", args.recurringId);
      const recurring = await owned(ctx, recurringId);
      const upcoming = recurringDates(
        recurring.nextDate,
        recurring.frequency,
        recurring.nextDate,
        "9999-12-31",
      ).slice(0, 4);
      if (!upcoming.includes(args.date) && upcoming.length === 4) {
        const later = recurringDates(
          recurring.nextDate,
          recurring.frequency,
          args.date,
          args.date,
        );
        if (!later.includes(args.date))
          throw new ConvexError(
            `${args.date} is not an occurrence of this ${recurring.frequency} schedule. Occurrences start at nextDate ${recurring.nextDate}: ${upcoming.join(", ")}, and so on. nextDate is the anchor the series repeats from, so to track ${args.date} set nextDate to it with update_recurring; later occurrences keep repeating from there and posted transactions on those dates match automatically.`,
          );
      }
      const previous = await ctx.db
        .query("recurringPayments")
        .withIndex("by_recurringId_and_date", (q) =>
          q.eq("recurringId", recurringId).eq("date", args.date),
        )
        .unique();
      await setRecurringPaidForUser(ctx, { ...args, recurringId });
      return {
        recurringId,
        date: args.date,
        before: previous?.paid ?? false,
        after: args.paid,
        hint: "nextDate is the series anchor and is unchanged; future occurrences keep repeating from it.",
      };
    }
    case "save_forecast": {
      const args = agentToolSchemas[name].parse(input);
      const id = args.id
        ? agentId(ctx, "forecastScenarios", args.id)
        : undefined;
      const before = id ? await owned(ctx, id) : null;
      const saved = await saveForecastForUser(ctx, { ...args, id });
      return {
        before,
        after: await owned(ctx, saved._id),
        returnAssumptionApplies: returnAssumptionApplies(args.inputs),
        warnings: forecastWarnings(args.inputs),
      };
    }
    case "create_account":
      return await createAgentAccount(ctx, agentToolSchemas[name].parse(input));
    case "record_account_snapshot":
      return await recordAccountSnapshots(
        ctx,
        agentToolSchemas[name].parse(input),
      );
    case "record_balance_history": {
      const args = agentToolSchemas[name].parse(input);
      return await recordBalanceHistory(
        ctx,
        agentId(ctx, "accounts", args.accountId),
        args.rows,
      );
    }
    case "save_credit_score":
      return await saveCreditScoreFromAgent(
        ctx,
        agentToolSchemas[name].parse(input),
      );
    default:
      throw new ConvexError("This edit tool is unavailable.");
  }
}
