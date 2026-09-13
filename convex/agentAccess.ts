import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { userAction, userMutation, userQuery, owned } from "./lib/access";
import { getAgentTool, agentToolSchemas } from "./lib/agentTools";
import {
  executeAgentRead,
  executeAgentWrite,
  agentData,
  agentId,
} from "./lib/agentExecution";
import {
  AGENT_ACCESS_MS,
  AGENT_GRANT_MS,
  AGENT_REQUEST_MS,
  authorizationRedirect,
  hashSecret,
  randomSecret,
} from "./lib/agentAuth";
import { agentConfiguration } from "./lib/agentConfig";
import { agentRateLimiter } from "./lib/agentLimits";
import { performAgentCall } from "./lib/agentCall";
import { readWorkspace } from "./workspace";
import { listTransactionsForUser } from "./transactions";
import { applyRuleForUser } from "./settings";
import { paginationOptsValidator } from "convex/server";

export const executionAuth = v.union(
  v.object({ kind: v.literal("browser"), userId: v.id("users") }),
  v.object({ kind: v.literal("mcp"), tokenHash: v.string() }),
);
export type ExecutionAuth =
  | { kind: "browser"; userId: Id<"users"> }
  | { kind: "mcp"; tokenHash: string };

async function eligibleOwner(ctx: QueryCtx, userId: Id<"users">) {
  const [user, profile] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  ]);
  return Boolean(user && !user.isAnonymous && profile && !profile.demo);
}
async function requireRealOwner(ctx: QueryCtx, userId: Id<"users">) {
  if (!(await eligibleOwner(ctx, userId)))
    throw new ConvexError(
      "Agent access requires a signed-in account with a personal workspace. Demo and sample workspaces cannot share finance data.",
    );
}

async function tokenGrant(ctx: QueryCtx, tokenHash: string, now: number) {
  const token = await ctx.db
    .query("agentTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    !token ||
    token.kind !== "access" ||
    token.expiresAt <= now ||
    token.usedAt !== undefined
  )
    return null;
  const grant = await ctx.db.get(token.grantId);
  const config = agentConfiguration();
  if (
    !grant ||
    grant.revokedAt !== undefined ||
    grant.expiresAt <= now ||
    grant.resource !== config.mcpUrl ||
    grant.issuer !== config.issuer ||
    !grant.scopes.includes("finance:read") ||
    !(await eligibleOwner(ctx, grant.userId))
  )
    return null;
  return grant;
}

async function authorizeExecution(
  ctx: QueryCtx,
  auth: ExecutionAuth,
  name: string,
  now: number,
) {
  const tool = getAgentTool(name);
  if (auth.kind === "browser") {
    await requireRealOwner(ctx, auth.userId);
    const pref = await ctx.db
      .query("agentPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", auth.userId))
      .unique();
    if (!pref?.browserEnabled)
      throw new ConvexError(
        "Turn on browser agent access in Settings before using these tools.",
      );
    if (!tool.readOnly && !pref.browserAllowEdits)
      throw new ConvexError(
        "This connection has read-only access. Enable edits in Settings to make this change.",
      );
    return {
      userId: auth.userId,
      grantId: undefined,
      source: "browser" as const,
    };
  }
  const grant = await tokenGrant(ctx, auth.tokenHash, now);
  if (!grant)
    throw new ConvexError(
      "Agent access expired or was revoked. Reconnect from your AI app.",
    );
  if (!tool.readOnly && !grant.scopes.includes("finance:write"))
    throw new ConvexError(
      "This connection has read-only access. Reconnect and approve editing to make this change.",
    );
  return { userId: grant.userId, grantId: grant._id, source: "mcp" as const };
}

export const browserStatus = userQuery({
  args: {},
  handler: async (ctx) => {
    const pref = await ctx.db
      .query("agentPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    const canEnable = await eligibleOwner(ctx, ctx.userId);
    return {
      enabled: canEnable && Boolean(pref?.browserEnabled),
      allowEdits:
        canEnable && Boolean(pref?.browserEnabled && pref.browserAllowEdits),
      canEnable,
    };
  },
});
export const status = userQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const rows = await ctx.db
      .query("agentGrants")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("revokedAt"), undefined),
          q.gt(q.field("expiresAt"), now),
        ),
      )
      .order("desc")
      .take(101);
    const events = await ctx.db
      .query("agentActivity")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(50);
    const { mcpUrl, appOrigin, remoteReady } = agentConfiguration();
    return {
      mcpUrl,
      appOrigin,
      remoteReady,
      canEnable: await eligibleOwner(ctx, ctx.userId),
      grants: rows
        .slice(0, 100)
        .map(
          ({
            userId: _owner,
            resource: _resource,
            issuer: _issuer,
            ...grant
          }) => grant,
        ),
      grantsComplete: rows.length <= 100,
      activity: events.map(({ userId: _owner, ...event }) => event),
    };
  },
});
export const setBrowserAccess = userMutation({
  args: { enabled: v.boolean(), allowEdits: v.boolean() },
  handler: async (ctx, args) => {
    if (args.enabled) await requireRealOwner(ctx, ctx.userId);
    const previous = await ctx.db
      .query("agentPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    const value = {
      browserEnabled: args.enabled,
      browserAllowEdits: args.enabled && args.allowEdits,
      updatedAt: Date.now(),
    };
    if (previous) await ctx.db.patch(previous._id, value);
    else
      await ctx.db.insert("agentPreferences", { ...value, userId: ctx.userId });
    return null;
  },
});
export const revoke = userMutation({
  args: { id: v.id("agentGrants") },
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.patch(id, { revokedAt: Date.now() });
    return null;
  },
});

export const authorizationRequest = userQuery({
  args: { request: v.string() },
  handler: async (ctx, { request }) => {
    await requireRealOwner(ctx, ctx.userId);
    if (!/^request_[A-Za-z0-9_-]{43}$/.test(request)) return null;
    const row = await ctx.db
      .query("agentAuthorizationRequests")
      .withIndex("by_requestHash", (q) =>
        q.eq("requestHash", hashSecret(request)),
      )
      .unique();
    if (!row || row.completedAt !== undefined) return null;
    return {
      clientId: row.clientId,
      clientName: row.clientName,
      redirectUri: row.redirectUri,
      requestedScopes: row.scopes,
      expiresAt: row.expiresAt,
    };
  },
});
export const authorize = userAction({
  args: { request: v.string(), allowEdits: v.boolean() },
  handler: async (ctx, args): Promise<{ redirectUrl: string }> => {
    const code = randomSecret("code");
    const info = await ctx.runMutation(internal.agentAccess.approveRequest, {
      userId: ctx.userId,
      requestHash: hashSecret(args.request),
      codeHash: hashSecret(code),
      allowEdits: args.allowEdits,
    });
    return {
      redirectUrl: authorizationRedirect(
        info.redirectUri,
        info.state,
        info.issuer,
        { code },
      ),
    };
  },
});
export const denyAuthorization = userMutation({
  args: { request: v.string() },
  handler: async (ctx, { request }) => {
    await requireRealOwner(ctx, ctx.userId);
    const row = await ctx.db
      .query("agentAuthorizationRequests")
      .withIndex("by_requestHash", (q) =>
        q.eq("requestHash", hashSecret(request)),
      )
      .unique();
    if (!row || row.completedAt !== undefined || row.expiresAt <= Date.now())
      throw new ConvexError(
        "This authorization request expired. Start again from your AI app.",
      );
    await ctx.db.patch(row._id, { completedAt: Date.now() });
    return {
      redirectUrl: authorizationRedirect(
        row.redirectUri,
        row.state,
        row.issuer,
        { error: "access_denied" },
      ),
    };
  },
});
export const approveRequest = internalMutation({
  args: {
    userId: v.id("users"),
    requestHash: v.string(),
    codeHash: v.string(),
    allowEdits: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRealOwner(ctx, args.userId);
    const row = await ctx.db
      .query("agentAuthorizationRequests")
      .withIndex("by_requestHash", (q) => q.eq("requestHash", args.requestHash))
      .unique();
    const now = Date.now();
    if (!row || row.completedAt !== undefined || row.expiresAt <= now)
      throw new ConvexError(
        "This authorization request expired. Start again from your AI app.",
      );
    const config = agentConfiguration();
    if (row.resource !== config.mcpUrl || row.issuer !== config.issuer)
      throw new ConvexError(
        "The server configuration changed. Start again from your AI app.",
      );
    const grants = await ctx.db
      .query("agentGrants")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("revokedAt"), undefined),
          q.gt(q.field("expiresAt"), now),
        ),
      )
      .take(50);
    if (grants.length >= 50)
      throw new ConvexError("Revoke an old connection before adding another.");
    const scopes = row.scopes.filter(
      (scope) => scope !== "finance:write" || args.allowEdits,
    );
    const grantId = await ctx.db.insert("agentGrants", {
      userId: args.userId,
      clientId: row.clientId,
      clientName: row.clientName,
      scopes,
      resource: row.resource,
      issuer: row.issuer,
      createdAt: now,
      expiresAt: now + AGENT_GRANT_MS,
    });
    await ctx.db.patch(row._id, {
      codeHash: args.codeHash,
      grantId,
      completedAt: now,
    });
    return {
      redirectUri: row.redirectUri,
      state: row.state,
      issuer: row.issuer,
    };
  },
});
export const createRequest = internalMutation({
  args: {
    requestHash: v.string(),
    clientId: v.string(),
    clientName: v.string(),
    redirectUri: v.string(),
    challenge: v.string(),
    scopes: v.array(v.string()),
    resource: v.string(),
    issuer: v.string(),
    state: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limited = await agentRateLimiter.limit(ctx, "agentOAuthGlobal");
    if (!limited.ok) return false;
    const now = Date.now();
    const id = await ctx.db.insert("agentAuthorizationRequests", {
      ...args,
      createdAt: now,
      expiresAt: now + AGENT_REQUEST_MS,
    });
    await ctx.scheduler.runAt(
      now + AGENT_REQUEST_MS + 60_000,
      internal.agentAccess.expireRequest,
      { id },
    );
    return true;
  },
});
export const expireRequest = internalMutation({
  args: { id: v.id("agentAuthorizationRequests") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
  },
});
export const expireToken = internalMutation({
  args: { id: v.id("agentTokens") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
  },
});

async function insertToken(
  ctx: MutationCtx,
  grantId: Id<"agentGrants">,
  kind: "access" | "refresh",
  tokenHash: string,
  expiresAt: number,
) {
  const id = await ctx.db.insert("agentTokens", {
    grantId,
    kind,
    tokenHash,
    expiresAt,
  });
  await ctx.scheduler.runAt(
    expiresAt + 60_000,
    internal.agentAccess.expireToken,
    { id },
  );
}
export const exchange = internalMutation({
  args: {
    grantType: v.union(
      v.literal("authorization_code"),
      v.literal("refresh_token"),
    ),
    credentialHash: v.string(),
    clientId: v.string(),
    resource: v.string(),
    redirectUri: v.optional(v.string()),
    challenge: v.optional(v.string()),
    accessHash: v.string(),
    refreshHash: v.string(),
    scope: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const limited = await agentRateLimiter.limit(ctx, "agentTokenGlobal");
    if (!limited.ok) return { error: "temporarily_unavailable" as const };
    const now = Date.now();
    let grant: Doc<"agentGrants"> | null = null;
    let requestId: Id<"agentAuthorizationRequests"> | undefined;
    let refreshId: Id<"agentTokens"> | undefined;
    if (args.grantType === "authorization_code") {
      const request = await ctx.db
        .query("agentAuthorizationRequests")
        .withIndex("by_codeHash", (q) => q.eq("codeHash", args.credentialHash))
        .unique();
      if (
        !request ||
        !request.grantId ||
        request.expiresAt <= now ||
        request.clientId !== args.clientId ||
        request.resource !== args.resource ||
        request.redirectUri !== args.redirectUri ||
        request.challenge !== args.challenge
      )
        return { error: "invalid_grant" as const };
      grant = await ctx.db.get(request.grantId);
      if (request.redeemedAt !== undefined) {
        if (grant) await ctx.db.patch(grant._id, { revokedAt: now });
        return { error: "invalid_grant" as const };
      }
      requestId = request._id;
    } else {
      const token = await ctx.db
        .query("agentTokens")
        .withIndex("by_tokenHash", (q) =>
          q.eq("tokenHash", args.credentialHash),
        )
        .unique();
      if (!token || token.kind !== "refresh" || token.expiresAt <= now)
        return { error: "invalid_grant" as const };
      grant = await ctx.db.get(token.grantId);
      if (
        !grant ||
        grant.clientId !== args.clientId ||
        grant.resource !== args.resource
      )
        return { error: "invalid_grant" as const };
      if (token.usedAt !== undefined) {
        await ctx.db.patch(grant._id, { revokedAt: now });
        return { error: "invalid_grant" as const };
      }
      refreshId = token._id;
    }
    const config = agentConfiguration();
    if (
      !grant ||
      grant.revokedAt !== undefined ||
      grant.expiresAt <= now ||
      grant.issuer !== config.issuer ||
      grant.resource !== config.mcpUrl ||
      !(await eligibleOwner(ctx, grant.userId))
    )
      return { error: "invalid_grant" as const };
    if (args.scope && args.scope.some((scope) => !grant.scopes.includes(scope)))
      return { error: "invalid_scope" as const };
    const scopes = args.scope ?? grant.scopes;
    if (!scopes.includes("finance:read"))
      return { error: "invalid_scope" as const };
    // Only consume an otherwise valid credential after every grant/scope check.
    if (requestId) await ctx.db.patch(requestId, { redeemedAt: now });
    if (refreshId) await ctx.db.patch(refreshId, { usedAt: now });
    if (args.scope) await ctx.db.patch(grant._id, { scopes });
    const accessExpires = Math.min(now + AGENT_ACCESS_MS, grant.expiresAt);
    await insertToken(ctx, grant._id, "access", args.accessHash, accessExpires);
    await insertToken(
      ctx,
      grant._id,
      "refresh",
      args.refreshHash,
      grant.expiresAt,
    );
    return { scopes, expiresIn: Math.floor((accessExpires - now) / 1000) };
  },
});
export const revokeToken = internalMutation({
  args: { tokenHash: v.string(), clientId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("agentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    const grant = token ? await ctx.db.get(token.grantId) : null;
    if (grant && (!args.clientId || grant.clientId === args.clientId))
      await ctx.db.patch(grant._id, { revokedAt: Date.now() });
    return null;
  },
});
export const authenticateMcp = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, { tokenHash, now }) => {
    const grant = await tokenGrant(ctx, tokenHash, now);
    return grant
      ? { clientId: grant.clientId, scopes: grant.scopes, grantId: grant._id }
      : null;
  },
});

/**
 * Every call reads its grant, so rewriting lastUsedAt on every call made
 * parallel tool calls from one assistant conflict and occasionally fail.
 * Settings only shows the time coarsely; once a minute is enough.
 */
const GRANT_TOUCH_MS = 60_000;
async function touchGrant(ctx: MutationCtx, grantId?: Id<"agentGrants">) {
  if (!grantId) return;
  const grant = await ctx.db.get(grantId);
  const now = Date.now();
  if (grant && now - (grant.lastUsedAt ?? 0) >= GRANT_TOUCH_MS)
    await ctx.db.patch(grantId, { lastUsedAt: now });
}

export const execute = userAction({
  args: { name: v.string(), arguments: v.any() },
  handler: async (ctx, args): Promise<unknown> =>
    await performAgentCall(
      ctx,
      { kind: "browser", userId: ctx.userId },
      args.name,
      args.arguments,
    ),
});
export const reserveCall = internalMutation({
  args: { auth: executionAuth, name: v.string() },
  handler: async (ctx, args) => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      args.name,
      Date.now(),
    );
    const limited = await agentRateLimiter.limit(ctx, "agentCall", {
      key: access.grantId ?? access.userId,
    });
    return limited.ok;
  },
});
export const read = internalQuery({
  args: {
    auth: executionAuth,
    name: v.string(),
    arguments: v.any(),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      args.name,
      args.now,
    );
    return agentData(
      await executeAgentRead(
        { ...ctx, userId: access.userId },
        getAgentTool(args.name).name,
        args.arguments,
        args.now,
      ),
    );
  },
});
export const write = internalMutation({
  args: { auth: executionAuth, name: v.string(), arguments: v.any() },
  handler: async (ctx, args): Promise<unknown> => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      args.name,
      Date.now(),
    );
    const tool = getAgentTool(args.name);
    const result = await executeAgentWrite(
      { ...ctx, userId: access.userId },
      tool.name,
      args.arguments,
    );
    await ctx.db.insert("agentActivity", {
      ...access,
      tool: args.name,
      readOnly: false,
      success: true,
      createdAt: Date.now(),
    });
    await touchGrant(ctx, access.grantId);
    return agentData(result);
  },
});
export const logRead = internalMutation({
  args: { auth: executionAuth, name: v.string(), success: v.boolean() },
  handler: async (ctx, args) => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      args.name,
      Date.now(),
    );
    await ctx.db.insert("agentActivity", {
      ...access,
      tool: args.name,
      readOnly: getAgentTool(args.name).readOnly,
      success: args.success,
      createdAt: Date.now(),
    });
    await touchGrant(ctx, access.grantId);
    return null;
  },
});
export const applyRulePage = internalMutation({
  args: {
    auth: executionAuth,
    id: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      "apply_rule",
      Date.now(),
    );
    const owner = { ...ctx, userId: access.userId };
    return await applyRuleForUser(owner, {
      id: agentId(owner, "rules", args.id),
      paginationOpts: { cursor: args.cursor, numItems: 100 },
    });
  },
});
export const reportPage = internalQuery({
  args: {
    auth: executionAuth,
    input: v.any(),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      "get_report",
      args.now,
    );
    const owner = { ...ctx, userId: access.userId },
      input = agentToolSchemas.get_report.parse(args.input);
    return await listTransactionsForUser(owner, {
      from: input.from,
      to: input.to,
      accountId: input.accountId
        ? agentId(owner, "accounts", input.accountId)
        : undefined,
      merchantId: input.merchantId
        ? agentId(owner, "merchants", input.merchantId)
        : undefined,
      paginationOpts: args.paginationOpts,
    });
  },
});
export const reportContext = internalQuery({
  args: { auth: executionAuth, input: v.any(), now: v.number() },
  handler: async (ctx, args) => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      "get_report",
      args.now,
    );
    const owner = { ...ctx, userId: access.userId },
      input = agentToolSchemas.get_report.parse(args.input);
    if (input.categoryId)
      await owned(owner, agentId(owner, "categories", input.categoryId));
    if (input.tagId) await owned(owner, agentId(owner, "tags", input.tagId));
    return await readWorkspace(owner);
  },
});
