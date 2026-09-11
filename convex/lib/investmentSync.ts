import { ConvexError } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { plaidRequest } from "./plaidApi";
import {
  investmentLimits,
  normalizeInvestmentEvent,
  normalizePosition,
  normalizeSecurity,
  responseArray,
  responseTotal,
  type InvestmentEventData,
  type SecurityData,
} from "./investmentData";

export async function syncInvestments(
  ctx: ActionCtx,
  item: Doc<"plaidItems">,
  version: number,
) {
  const lease = { itemId: item._id, version };
  await ctx.runMutation(internal.plaidInternal.heartbeat, lease);
  const positions = await plaidRequest<unknown>(
    "/investments/holdings/get",
    {
      access_token: item.accessToken,
    },
    item.environment,
  );
  const holdings = responseArray(positions, "holdings").map(normalizePosition);
  const securities = new Map<string, SecurityData>();
  for (const security of responseArray(positions, "securities").map(
    normalizeSecurity,
  ))
    securities.set(security.providerSecurityId, security);
  if (holdings.length > investmentLimits.holdings)
    throw new ConvexError(
      "This connection has more than 1,000 holdings. Previous data has been kept.",
    );
  const to = new Date().toISOString().slice(0, 10);
  const start = new Date(to + "T12:00:00Z");
  start.setUTCFullYear(start.getUTCFullYear() - 2);
  const from = start.toISOString().slice(0, 10);
  const events = new Map<string, InvestmentEventData>();
  let offset = 0;
  let expectedTotal: number | null = null;
  while (expectedTotal === null || offset < expectedTotal) {
    await ctx.runMutation(internal.plaidInternal.heartbeat, lease);
    const response = await plaidRequest<unknown>(
      "/investments/transactions/get",
      {
        access_token: item.accessToken,
        start_date: from,
        end_date: to,
        options: { count: 500, offset },
      },
      item.environment,
    );
    const total = responseTotal(response);
    if (total > investmentLimits.events)
      throw new ConvexError(
        "This investment history exceeds Marten's 5,000-event sync limit. Previous data has been kept.",
      );
    if (expectedTotal !== null && total !== expectedTotal)
      throw new ConvexError(
        "Investment activity changed while loading. Sync again to get a complete snapshot.",
      );
    expectedTotal = total;
    const page = responseArray(response, "investment_transactions").map(
      normalizeInvestmentEvent,
    );
    for (const event of page) {
      if (events.has(event.providerTransactionId))
        throw new ConvexError(
          "Investment activity changed while loading. Sync again to get a complete snapshot.",
        );
      events.set(event.providerTransactionId, event);
    }
    for (const security of responseArray(response, "securities").map(
      normalizeSecurity,
    ))
      securities.set(security.providerSecurityId, security);
    if (securities.size > investmentLimits.securities)
      throw new ConvexError(
        "This investment snapshot has too many securities. Previous data has been kept.",
      );
    offset += page.length;
    if (offset === total) break;
    if (!page.length || offset > total)
      throw new ConvexError(
        "Investment activity was incomplete. Previous data has been kept.",
      );
  }
  await ctx.runMutation(internal.plaidInternal.heartbeat, lease);
  await ctx.runMutation(internal.investmentInternal.commit, {
    ...lease,
    holdings,
    securities: [...securities.values()],
    events: [...events.values()],
    from,
    to,
  });
}
