import { ConvexError } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import { owned, date, type UserRead, type UserMutationCtx } from "./access";
import { agentToolSchemas, type AgentToolName } from "./agentTools";
import { readWorkspace, saveAccountForUser } from "../workspace";
import { listTransactionsForUser, updateOne } from "../transactions";
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
import { runForecast } from "./forecast";

export function agentId<T extends TableNames>(
  ctx: UserRead,
  table: T,
  value: string,
): Id<T> {
  const id = ctx.db.normalizeId(table, value);
  if (!id) throw new ConvexError("This item is unavailable.");
  return id;
}
function checkRange(from: string, to: string) {
  date(from);
  date(to);
  if (from > to) throw new ConvexError("Choose a valid date range.");
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
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, item]) =>
            item !== undefined &&
            !omit.has(key) &&
            !/token|secret|password|credential|^simplefin|^plaid/i.test(key),
        )
        .map(([key, item]) => [key, agentData(item)]),
    );
  }
  return value;
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
        complete: true,
        freshness: "Cached balances; updatedAt is supplied per account.",
      };
    }
    case "get_classifications": {
      const args = agentToolSchemas[name].parse(input);
      const { groups, categories, tags } = await readWorkspace(ctx);
      const merchants = await ctx.db
        .query("merchants")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .paginate({
          cursor: args.cursor ?? null,
          numItems: args.pageSize ?? 100,
        });
      return {
        groups,
        categories,
        tags,
        merchants: merchants.page,
        continueCursor: merchants.continueCursor,
        isDone: merchants.isDone,
        complete: merchants.isDone && !args.cursor,
      };
    }
    case "list_transactions": {
      const args = agentToolSchemas[name].parse(input);
      checkRange(args.from, args.to);
      return await listTransactionsForUser(ctx, {
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
          numItems: args.pageSize ?? 100,
        },
      });
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
        transaction,
        activity: history.slice(0, 50),
        activityComplete: history.length <= 50,
      };
    }
    case "list_recurring": {
      agentToolSchemas[name].parse(input);
      const data = await readWorkspace(ctx);
      return {
        recurring: data.recurring,
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
      return await recurringPaymentsForUser(ctx, {
        ...args,
        paginationOpts: {
          cursor: args.cursor ?? null,
          numItems: args.pageSize ?? 100,
        },
      });
    }
    case "list_forecasts": {
      agentToolSchemas[name].parse(input);
      return { scenarios: await listForecastsForUser(ctx), complete: true };
    }
    case "get_forecast_baseline":
      return await forecastBaselineForUser(
        ctx,
        agentToolSchemas[name].parse(input),
      );
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
      return await investmentActivityForUser(ctx, {
        from: args.from,
        to: args.to,
        accountId: args.accountId
          ? agentId(ctx, "accounts", args.accountId)
          : undefined,
        paginationOpts: {
          cursor: args.cursor ?? null,
          numItems: args.pageSize ?? 100,
        },
      });
    }
    case "list_credit_scores": {
      agentToolSchemas[name].parse(input);
      return { observations: await creditScoresForUser(ctx), complete: true };
    }
    default:
      throw new ConvexError("This read tool is unavailable.");
  }
}

export async function executeAgentWrite(
  ctx: UserMutationCtx,
  name: AgentToolName,
  input: unknown,
): Promise<unknown> {
  switch (name) {
    case "update_transaction": {
      const args = agentToolSchemas[name].parse(input);
      const id = agentId(ctx, "transactions", args.id);
      const before = await owned(ctx, id);
      const { categoryId, merchantId, tagIds, splits, ...annotations } =
        args.patch;
      await updateOne(ctx, id, {
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
      });
      return { before, after: await owned(ctx, id) };
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
      await owned(ctx, recurringId);
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
      };
    }
    case "save_forecast": {
      const args = agentToolSchemas[name].parse(input);
      const id = args.id
        ? agentId(ctx, "forecastScenarios", args.id)
        : undefined;
      const before = id ? await owned(ctx, id) : null;
      const saved = await saveForecastForUser(ctx, { ...args, id });
      return { before, after: await owned(ctx, saved._id) };
    }
    default:
      throw new ConvexError("This edit tool is unavailable.");
  }
}
