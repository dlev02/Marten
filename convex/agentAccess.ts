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
  ACCESS_KEY_CLIENT_ID,
  ACCESS_KEY_PREFIX,
  AGENT_ACCESS_MS,
  AGENT_GRANT_TOUCH_MS,
  AGENT_IDLE_MS,
  AGENT_NEVER,
  AGENT_REFRESH_GRACE_MS,
  AGENT_REFRESH_GRACE_REUSES,
  AGENT_REQUEST_MS,
  AGENT_USED_REFRESH_RETAIN_MS,
  accessKeyLifetimes,
  authorizationRedirect,
  cleanClientName,
  clientTrust,
  grantDeadline,
  hashSecret,
  randomSecret,
  timingSafeEqual,
} from "./lib/agentAuth";
import { agentConfiguration } from "./lib/agentConfig";
import { BROWSER_ASSISTANT } from "./lib/agentActor";
import { auditWrite } from "./lib/agentAudit";
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
  // An account with a pending deletion must not keep sharing data while the
  // deletion sweep runs.
  return Boolean(
    user &&
      !user.isAnonymous &&
      profile &&
      !profile.demo &&
      profile.deletionRequestedAt === undefined,
  );
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
    (token.kind !== "access" && token.kind !== "key") ||
    token.expiresAt <= now ||
    token.usedAt !== undefined
  )
    return null;
  const grant = await ctx.db.get(token.grantId);
  const config = agentConfiguration();
  if (
    !grant ||
    // An access key only authenticates its own key grant, and vice versa.
    (token.kind === "key") !== (grant.credential === "key") ||
    grant.revokedAt !== undefined ||
    grant.expiresAt <= now ||
    grant.resource !== config.mcpUrl ||
    grant.issuer !== config.issuer ||
    !grant.scopes.includes("finance:read") ||
    !(await eligibleOwner(ctx, grant.userId))
  )
    return null;
  // A refresh may narrow one access token; it never widens past the grant.
  const scopes = (token.scopes ?? grant.scopes).filter((scope) =>
    grant.scopes.includes(scope),
  );
  if (!scopes.includes("finance:read")) return null;
  return { grant, scopes };
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
      connection: BROWSER_ASSISTANT,
    };
  }
  const authenticated = await tokenGrant(ctx, auth.tokenHash, now);
  if (!authenticated)
    throw new ConvexError(
      "Agent access expired or was revoked. Reconnect from your AI app.",
    );
  const { grant, scopes } = authenticated;
  if (!tool.readOnly && !scopes.includes("finance:write"))
    throw new ConvexError(
      "This connection has read-only access. Reconnect and approve editing to make this change.",
    );
  return {
    userId: grant.userId,
    grantId: grant._id,
    source: "mcp" as const,
    connection: grant.clientName,
  };
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
    const visible = rows
      .slice(0, 100)
      .map(
        ({
          userId: _owner,
          resource: _resource,
          issuer: _issuer,
          ...grant
        }) => ({
          ...grant,
          lifetime: grant.lifetime ?? ("fixed" as const),
          trust: clientTrust(grant.clientId),
        }),
      );
    const names = new Map(
      visible.map((grant) => [grant._id, grant.clientName]),
    );
    return {
      mcpUrl,
      appOrigin,
      remoteReady,
      canEnable: await eligibleOwner(ctx, ctx.userId),
      grants: visible.filter((grant) => grant.credential !== "key"),
      keys: visible.filter((grant) => grant.credential === "key"),
      grantsComplete: rows.length <= 100,
      activity: events.map(
        ({ userId: _owner, changes: _changes, ...event }) => ({
          ...event,
          connection:
            event.connection ??
            (event.grantId ? names.get(event.grantId) : undefined),
        }),
      ),
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
/** Revocation also deletes the grant's tokens so nothing lingers until expiry. */
async function revokeGrant(
  ctx: MutationCtx,
  grantId: Id<"agentGrants">,
  now: number,
) {
  await ctx.db.patch(grantId, { revokedAt: now });
  const tokens = await ctx.db
    .query("agentTokens")
    .withIndex("by_grantId", (q) => q.eq("grantId", grantId))
    .take(200);
  for (const token of tokens) await ctx.db.delete(token._id);
}
export const revoke = userMutation({
  args: { id: v.id("agentGrants") },
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await revokeGrant(ctx, id, Date.now());
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
      trust: clientTrust(row.clientId),
      redirectUri: row.redirectUri,
      requestedScopes: row.scopes,
      expiresAt: row.expiresAt,
    };
  },
});
const grantLifetime = v.union(
  v.literal("idle"),
  v.literal("fixed"),
  v.literal("untilRevoked"),
);
export const authorize = userAction({
  args: {
    request: v.string(),
    allowEdits: v.boolean(),
    lifetime: v.optional(grantLifetime),
  },
  handler: async (ctx, args): Promise<{ redirectUrl: string }> => {
    const code = randomSecret("code");
    const info = await ctx.runMutation(internal.agentAccess.approveRequest, {
      userId: ctx.userId,
      requestHash: hashSecret(args.request),
      codeHash: hashSecret(code),
      allowEdits: args.allowEdits,
      lifetime: args.lifetime ?? "idle",
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
    lifetime: grantLifetime,
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
    await requireGrantCapacity(ctx, args.userId, now);
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
      expiresAt: grantDeadline(args.lifetime, now),
      lifetime: args.lifetime,
      credential: "oauth",
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
async function requireGrantCapacity(
  ctx: QueryCtx,
  userId: Id<"users">,
  now: number,
) {
  const grants = await ctx.db
    .query("agentGrants")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .filter((q) =>
      q.and(
        q.eq(q.field("revokedAt"), undefined),
        q.gt(q.field("expiresAt"), now),
      ),
    )
    .take(50);
  if (grants.length >= 50)
    throw new ConvexError(
      "Disconnect an old connection or access key before adding another.",
    );
}
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
  kind: "access" | "refresh" | "key",
  tokenHash: string,
  expiresAt: number,
  scopes?: string[],
) {
  const id = await ctx.db.insert("agentTokens", {
    grantId,
    kind,
    tokenHash,
    expiresAt,
    ...(scopes ? { scopes } : {}),
  });
  // Long-lived refresh tokens and keys are removed by the hourly sweep (or on
  // revocation) rather than one scheduled job each.
  if (kind === "access")
    await ctx.scheduler.runAt(
      expiresAt + 60_000,
      internal.agentAccess.expireToken,
      { id },
    );
}
/** Hourly cron: deletes expired token rows in bounded batches. */
export const sweepTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("agentTokens")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(200);
    for (const token of expired) await ctx.db.delete(token._id);
    if (expired.length === 200)
      await ctx.scheduler.runAfter(0, internal.agentAccess.sweepTokens, {});
    return null;
  },
});
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
    let request: Doc<"agentAuthorizationRequests"> | undefined;
    let refresh: Doc<"agentTokens"> | undefined;
    let retry = false;
    if (args.grantType === "authorization_code") {
      const row = await ctx.db
        .query("agentAuthorizationRequests")
        .withIndex("by_codeHash", (q) => q.eq("codeHash", args.credentialHash))
        .unique();
      if (
        !row ||
        !row.grantId ||
        row.expiresAt <= now ||
        row.clientId !== args.clientId ||
        row.resource !== args.resource ||
        row.redirectUri !== args.redirectUri ||
        !timingSafeEqual(row.challenge, args.challenge ?? "")
      )
        return { error: "invalid_grant" as const };
      grant = await ctx.db.get(row.grantId);
      if (row.redeemedAt !== undefined) {
        if (grant) await revokeGrant(ctx, grant._id, now);
        return { error: "invalid_grant" as const };
      }
      request = row;
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
        grant.credential === "key" ||
        grant.clientId !== args.clientId ||
        grant.resource !== args.resource
      )
        return { error: "invalid_grant" as const };
      if (token.usedAt !== undefined) {
        // A hosted client that lost the response retries with the same token.
        // Shortly after rotation that is a retry; later, it is replay.
        if (now - token.usedAt > AGENT_REFRESH_GRACE_MS) {
          await revokeGrant(ctx, grant._id, now);
          return { error: "invalid_grant" as const };
        }
        if ((token.graceReuses ?? 0) >= AGENT_REFRESH_GRACE_REUSES)
          return { error: "invalid_grant" as const };
        retry = true;
      }
      refresh = token;
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
    const consented = grant.scopes;
    // offline_access describes refresh-token delivery, not data access, and
    // refresh tokens are always issued, so asking for it is never escalation.
    const requested = args.scope?.filter(
      (scope) => scope !== "offline_access" || consented.includes(scope),
    );
    if (requested && requested.some((scope) => !consented.includes(scope)))
      return { error: "invalid_scope" as const };
    const scopes = requested ?? grant.scopes;
    if (!scopes.includes("finance:read"))
      return { error: "invalid_scope" as const };
    // Only consume an otherwise valid credential after every grant/scope check.
    if (request) await ctx.db.patch(request._id, { redeemedAt: now });
    if (refresh && retry)
      await ctx.db.patch(refresh._id, {
        graceReuses: (refresh.graceReuses ?? 0) + 1,
      });
    else if (refresh)
      await ctx.db.patch(refresh._id, {
        usedAt: now,
        // Keep the used row only long enough to recognise replay.
        expiresAt: Math.min(
          refresh.expiresAt,
          now + AGENT_USED_REFRESH_RETAIN_MS,
        ),
      });
    // Per RFC 6749 §6 a narrower scope narrows this access token only; the
    // grant, and the refresh token issued with it, keep the consented scopes.
    // A "while in use" grant's deadline moves forward with each refresh.
    const deadline =
      grant.lifetime === "idle" ? now + AGENT_IDLE_MS : grant.expiresAt;
    if (refresh && deadline !== grant.expiresAt)
      await ctx.db.patch(grant._id, { expiresAt: deadline });
    const narrowed = consented.some((scope) => !scopes.includes(scope));
    const accessExpires = Math.min(now + AGENT_ACCESS_MS, deadline);
    await insertToken(
      ctx,
      grant._id,
      "access",
      args.accessHash,
      accessExpires,
      narrowed ? scopes : undefined,
    );
    await insertToken(ctx, grant._id, "refresh", args.refreshHash, deadline);
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
    // RFC 7009 revocation is for OAuth clients; access keys are revoked in Settings.
    if (
      grant &&
      grant.credential !== "key" &&
      (!args.clientId || grant.clientId === args.clientId)
    )
      await revokeGrant(ctx, grant._id, Date.now());
    return null;
  },
});
export const authenticateMcp = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, { tokenHash, now }) => {
    const authenticated = await tokenGrant(ctx, tokenHash, now);
    return authenticated
      ? {
          clientId: authenticated.grant.clientId,
          scopes: authenticated.scopes,
          grantId: authenticated.grant._id,
        }
      : null;
  },
});

/**
 * Every call reads its grant, so rewriting it on every call made parallel
 * tool calls from one assistant conflict. Last use, and a "while in use"
 * grant's deadline, move at most once an hour (and on each token refresh).
 */
async function touchGrant(ctx: MutationCtx, grantId?: Id<"agentGrants">) {
  if (!grantId) return;
  const grant = await ctx.db.get(grantId);
  const now = Date.now();
  if (!grant || now - (grant.lastUsedAt ?? 0) < AGENT_GRANT_TOUCH_MS) return;
  await ctx.db.patch(grantId, {
    lastUsedAt: now,
    ...(grant.lifetime === "idle" ? { expiresAt: now + AGENT_IDLE_MS } : {}),
  });
}

/**
 * Personal access keys are for assistants that call Marten with a stored
 * bearer key instead of OAuth (for example Meta Muse custom connectors). A key
 * is a grant with its own credential type, so it shares the grant's scope
 * checks, rate limit, activity log, revocation and account-deletion sweep.
 * The key is returned once and only its hash is stored.
 */
export const createAccessKey = userAction({
  args: {
    name: v.string(),
    allowEdits: v.boolean(),
    lifetime: v.union(
      v.literal("30d"),
      v.literal("90d"),
      v.literal("1y"),
      v.literal("never"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ key: string; id: Id<"agentGrants"> }> => {
    const name = cleanClientName(args.name);
    if (!name || args.name.trim().length > 60)
      throw new ConvexError("Name this key with up to 60 characters.");
    const key = randomSecret(ACCESS_KEY_PREFIX);
    const id: Id<"agentGrants"> = await ctx.runMutation(
      internal.agentAccess.insertAccessKey,
      {
        userId: ctx.userId,
        name,
        allowEdits: args.allowEdits,
        lifetime: args.lifetime,
        tokenHash: hashSecret(key),
      },
    );
    return { key, id };
  },
});
export const insertAccessKey = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    allowEdits: v.boolean(),
    lifetime: v.union(
      v.literal("30d"),
      v.literal("90d"),
      v.literal("1y"),
      v.literal("never"),
    ),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRealOwner(ctx, args.userId);
    const limited = await agentRateLimiter.limit(ctx, "agentKeyCreate", {
      key: args.userId,
    });
    if (!limited.ok)
      throw new ConvexError(
        "Too many access keys were created recently. Try again later.",
      );
    const now = Date.now();
    await requireGrantCapacity(ctx, args.userId, now);
    const duration = accessKeyLifetimes[args.lifetime];
    const expiresAt = duration === null ? AGENT_NEVER : now + duration;
    const config = agentConfiguration();
    const grantId = await ctx.db.insert("agentGrants", {
      userId: args.userId,
      clientId: ACCESS_KEY_CLIENT_ID,
      clientName: args.name,
      scopes: args.allowEdits
        ? ["finance:read", "finance:write"]
        : ["finance:read"],
      resource: config.mcpUrl,
      issuer: config.issuer,
      createdAt: now,
      expiresAt,
      lifetime: duration === null ? "untilRevoked" : "fixed",
      credential: "key",
    });
    await insertToken(ctx, grantId, "key", args.tokenHash, expiresAt);
    return grantId;
  },
});

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
      {
        ...ctx,
        userId: access.userId,
        agent: { grantId: access.grantId, name: access.connection },
      },
      tool.name,
      args.arguments,
    );
    await ctx.db.insert("agentActivity", {
      ...access,
      ...auditWrite(tool.name, args.arguments, result),
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
  args: {
    auth: executionAuth,
    name: v.string(),
    success: v.boolean(),
    // apply_rule's writes run in page mutations; its summary arrives here.
    summary: v.optional(v.string()),
    counts: v.optional(v.record(v.string(), v.number())),
  },
  handler: async (ctx, args) => {
    const access = await authorizeExecution(
      ctx,
      args.auth,
      args.name,
      Date.now(),
    );
    await ctx.db.insert("agentActivity", {
      ...access,
      ...(args.summary ? { summary: args.summary.slice(0, 200) } : {}),
      ...(args.counts ? { counts: args.counts } : {}),
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
    const owner = {
      ...ctx,
      userId: access.userId,
      agent: { grantId: access.grantId, name: access.connection },
    };
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

/** Activity older than this is removed; Settings describes the window. */
export const AGENT_ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60_000;
const PRUNE_BATCH = 500;
/** Daily retention sweep, oldest first in bounded batches. */
export const pruneActivity = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - AGENT_ACTIVITY_RETENTION_MS;
    const rows = await ctx.db
      .query("agentActivity")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(PRUNE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === PRUNE_BATCH)
      await ctx.scheduler.runAfter(0, internal.agentAccess.pruneActivity, {});
    return null;
  },
});
