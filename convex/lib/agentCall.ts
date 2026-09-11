import { ConvexError } from "convex/values";
import { ZodError } from "zod";
import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { ExecutionAuth } from "../agentAccess";
import { agentToolSchemas, getAgentTool } from "./agentTools";
import { agentData } from "./agentExecution";
import { summarize } from "../../src/lib/reporting";
import type { Metadata } from "../../src/lib/types";
import { date } from "./access";

export function agentErrorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data;
  if (error instanceof ZodError)
    return `Review the tool input: ${error.issues[0]?.message ?? "invalid value"}`;
  return "Marten could not complete this tool call. Check the supplied inputs or reconnect your AI app, then try again.";
}

async function report(ctx: ActionCtx, auth: ExecutionAuth, value: unknown) {
  const input = agentToolSchemas.get_report.parse(value);
  date(input.from);
  date(input.to);
  if (input.from > input.to)
    throw new ConvexError("Choose a valid date range.");
  const transactions: Doc<"transactions">[] = [];
  let cursor: string | null = null,
    complete = false;
  // Mirror the application's paginated report loading. A hard bound is explicit;
  // no partial total is labeled as the report for the requested date range.
  for (let page = 0; page < 60; page++) {
    const result: {
      page: Doc<"transactions">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.agentAccess.reportPage, {
      auth,
      input,
      paginationOpts: { cursor, numItems: 200 },
      now: Date.now(),
    });
    transactions.push(...result.page);
    if (result.isDone) {
      complete = true;
      break;
    }
    if (result.continueCursor === cursor) break;
    cursor = result.continueCursor;
  }
  if (!complete)
    return {
      complete: false,
      summary: null,
      from: input.from,
      to: input.to,
      scannedTransactions: transactions.length,
      message:
        "This range exceeds the report scan limit. Narrow the dates or choose one account; no partial totals are shown.",
    };
  const data: Metadata = await ctx.runQuery(
    internal.agentAccess.reportContext,
    { auth, input, now: Date.now() },
  );
  const usd = new Set(
    data.accounts
      .filter((account) => account.currency === "USD")
      .map((account) => account._id),
  );
  const selected = transactions.filter(
    (transaction) =>
      usd.has(transaction.accountId) &&
      (!input.tagId ||
        transaction.tagIds.includes(input.tagId as Doc<"tags">["_id"])),
  );
  return {
    complete: true,
    from: input.from,
    to: input.to,
    currency: "USD",
    amounts: "integer cents",
    transactionCount: selected.length,
    nonUsdTransactionsExcluded:
      transactions.length -
      transactions.filter((transaction) => usd.has(transaction.accountId))
        .length,
    summary: summarize(selected, data, input.groupBy, input.categoryId),
    consistency:
      "Pages reflect data read during this call. Bank syncs or edits made during loading may change the next report.",
  };
}

export async function performAgentCall(
  ctx: ActionCtx,
  auth: ExecutionAuth,
  name: string,
  input: unknown,
): Promise<unknown> {
  const tool = getAgentTool(name);
  agentToolSchemas[tool.name].parse(input);
  if (
    !(await ctx.runMutation(internal.agentAccess.reserveCall, { auth, name }))
  )
    throw new ConvexError("Agent access is busy. Wait a moment and retry.");
  try {
    if (!tool.readOnly)
      return await ctx.runMutation(internal.agentAccess.write, {
        auth,
        name,
        arguments: input,
      });
    const result =
      name === "get_report"
        ? await report(ctx, auth, input)
        : await ctx.runQuery(internal.agentAccess.read, {
            auth,
            name,
            arguments: input,
            now: Date.now(),
          });
    // The final authorization check also fences a long report against revocation.
    await ctx.runMutation(internal.agentAccess.logRead, {
      auth,
      name,
      success: true,
    });
    return agentData(result);
  } catch (error) {
    try {
      await ctx.runMutation(internal.agentAccess.logRead, {
        auth,
        name,
        success: false,
      });
    } catch {
      /* A revoked grant must not prevent the original failure from being returned. */
    }
    throw new ConvexError(agentErrorMessage(error));
  }
}
