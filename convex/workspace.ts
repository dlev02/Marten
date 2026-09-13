import type { UserRead, UserMutationCtx } from "./lib/access";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { v, ConvexError } from "convex/values";
import schema from "./schema";
import {
  userQuery,
  userMutation,
  userAction,
  owned,
  text,
  date,
  cents,
} from "./lib/access";
import { accountKind, avatarPreset } from "./validators";
import { api, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { plaidRequest } from "./lib/plaidApi";
import { seedCategories, seedSample } from "./sample";
import {
  changeMerchantCount,
  findMatchingTransaction,
  refreshSearch,
  unionTags,
  type TransactionFields,
} from "./lib/transactions";

const institutions = schema
  .doc("plaidItems")
  .omit("accessToken", "plaidItemId", "cursor", "syncLease");
export async function readWorkspace(ctx: UserRead) {
  const [
    profile,
    accounts,
    groups,
    categories,
    merchants,
    tags,
    rules,
    recurring,
    savedReports,
    items,
  ] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique(),
    ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(201),
    ctx.db
      .query("groups")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(201),
    ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(501),
    ctx.db
      .query("merchants")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(2001),
    ctx.db
      .query("tags")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(201),
    ctx.db
      .query("rules")
      .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
      .take(201),
    ctx.db
      .query("recurring")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(501),
    ctx.db
      .query("savedReports")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(101),
    ctx.db
      .query("plaidItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(101),
  ]);
  if (
    accounts.length > 200 ||
    groups.length > 200 ||
    categories.length > 500 ||
    merchants.length > 2000 ||
    tags.length > 200 ||
    recurring.length > 500 ||
    savedReports.length > 100 ||
    items.length > 100
  )
    throw new ConvexError(
      "This workspace exceeds the supported item limit. Contact support before adding more items.",
    );
  return {
    profile: profile
      ? {
          ...profile,
          avatarUrl: profile.photoStorageId
            ? await ctx.storage.getUrl(profile.photoStorageId)
            : null,
        }
      : null,
    accounts,
    groups: groups.sort((a, b) => a.order - b.order),
    categories: categories.sort((a, b) => a.order - b.order),
    merchants: await Promise.all(
      merchants.map(async (m) => ({
        ...m,
        resolvedLogoUrl: m.logoStorageId
          ? await ctx.storage.getUrl(m.logoStorageId)
          : (m.logoUrl ?? null),
      })),
    ),
    tags: tags.sort((a, b) => a.order - b.order),
    rules,
    recurring,
    savedReports,
    institutions: items.map(
      ({
        accessToken: _token,
        plaidItemId: _item,
        cursor: _cursor,
        syncLease: _lease,
        ...safe
      }) => safe,
    ),
  };
}
export const metadata = userQuery({
  args: {},
  returns: v.object({
    profile: v.union(
      schema
        .doc("profiles")
        .extend({ avatarUrl: v.union(v.string(), v.null()) }),
      v.null(),
    ),
    accounts: v.array(schema.doc("accounts")),
    groups: v.array(schema.doc("groups")),
    categories: v.array(schema.doc("categories")),
    merchants: v.array(
      schema
        .doc("merchants")
        .extend({ resolvedLogoUrl: v.union(v.string(), v.null()) }),
    ),
    tags: v.array(schema.doc("tags")),
    rules: v.array(schema.doc("rules")),
    recurring: v.array(schema.doc("recurring")),
    savedReports: v.array(schema.doc("savedReports")),
    institutions: v.array(institutions),
  }),
  handler: readWorkspace,
});
export const initialize = userMutation({
  args: { name: v.optional(v.string()), sample: v.boolean() },
  returns: v.id("profiles"),
  handler: async (ctx, { name, sample }) => {
    const user = await ctx.db.get(ctx.userId);
    if (user?.isAnonymous && !sample)
      throw new ConvexError("Demo guests can only use fictional sample data.");
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (existing) return existing._id;
    if (
      (
        await ctx.db
          .query("accounts")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(1)
      ).length ||
      (
        await ctx.db
          .query("transactions")
          .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
          .take(1)
      ).length ||
      (
        await ctx.db
          .query("plaidItems")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(1)
      ).length
    )
      throw new ConvexError("Initialize an empty workspace first.");
    const id = await ctx.db.insert("profiles", {
      userId: ctx.userId,
      name: text(name ?? "My household"),
      demo: sample,
      reviewNew: true,
      allowPending: false,
      widgets: [
        "netWorth",
        "transactions",
        "recurring",
        "spending",
        "cashFlow",
      ],
    });
    const categories = await seedCategories(ctx);
    if (sample) await seedSample(ctx, categories);
    return id;
  },
});
export const balanceHistory = userQuery({
  args: {
    from: v.string(),
    to: v.string(),
    accountId: v.optional(v.id("accounts")),
  },
  returns: v.object({
    rows: v.array(schema.doc("balances")),
    complete: v.boolean(),
  }),
  handler: async (ctx, { from, to, accountId }) => {
    date(from);
    date(to);
    if (from > to || Date.parse(to) - Date.parse(from) > 10 * 366 * 86400000)
      throw new ConvexError("Choose a date range up to ten years.");
    if (accountId) await owned(ctx, accountId);
    const rows = accountId
      ? await ctx.db
          .query("balances")
          .withIndex("by_accountId_and_date", (q) =>
            q.eq("accountId", accountId).gte("date", from).lte("date", to),
          )
          .take(12001)
      : await ctx.db
          .query("balances")
          .withIndex("by_userId_and_date", (q) =>
            q.eq("userId", ctx.userId).gte("date", from).lte("date", to),
          )
          .take(12001);
    return { rows: rows.slice(0, 12000), complete: rows.length <= 12000 };
  },
});
const accountFields = {
  name: v.string(),
  institution: v.string(),
  mask: v.string(),
  kind: accountKind,
  subtype: v.string(),
  balanceCents: v.number(),
  currency: v.string(),
  hidden: v.boolean(),
  excludeNetWorth: v.boolean(),
  closed: v.boolean(),
  availableCents: v.optional(v.number()),
  limitCents: v.optional(v.number()),
  statementCents: v.optional(v.number()),
  minimumCents: v.optional(v.number()),
  dueDate: v.optional(v.string()),
  statementDate: v.optional(v.string()),
  apy: v.optional(v.number()),
  paymentPlan: v.optional(
    v.union(v.literal("statement"), v.literal("minimum")),
  ),
};
const accountInput = v.object(accountFields);
export async function saveAccountForUser(
  ctx: UserMutationCtx,
  { id, ...fields }: { id?: Id<"accounts"> } & Infer<typeof accountInput>,
) {
  fields.name = text(fields.name);
  fields.institution = text(fields.institution);
  cents(fields.balanceCents);
  if (!/^[A-Z]{3}$/.test(fields.currency))
    throw new ConvexError("Enter a three-letter currency code.");
  if (fields.currency !== "USD")
    throw new ConvexError("Marten currently supports USD accounts.");
  if (fields.mask.length > 8)
    throw new ConvexError("Enter the last digits only.");
  if (fields.dueDate) date(fields.dueDate);
  if (fields.statementDate) date(fields.statementDate);
  for (const value of [
    fields.availableCents,
    fields.limitCents,
    fields.statementCents,
    fields.minimumCents,
  ])
    if (value !== undefined) cents(value);
  if (
    fields.apy !== undefined &&
    (!Number.isFinite(fields.apy) || fields.apy < 0 || fields.apy > 100)
  )
    throw new ConvexError("Enter a valid APY.");
  if (id) {
    const current = await owned(ctx, id);
    const simplefinAssetType =
      !!current.simplefinConnectionId &&
      (current.kind === "cash" || current.kind === "investment") &&
      (fields.kind === "cash" || fields.kind === "investment");
    if (
      !current.manual &&
      (
        [
          "balanceCents",
          "kind",
          "institution",
          "currency",
          "subtype",
          "availableCents",
          "limitCents",
          "statementCents",
          "minimumCents",
          "dueDate",
          "statementDate",
          "apy",
        ] as const
      ).some(
        (key) =>
          !(simplefinAssetType && (key === "kind" || key === "subtype")) &&
          key in fields &&
          fields[key] !== current[key],
      )
    )
      throw new ConvexError(
        "Your bank manages this account's balances and statement details.",
      );
    if (!current.manual) {
      await ctx.db.patch(id, fields);
      return id;
    }
    await ctx.db.patch(id, {
      ...fields,
      apy: fields.apy,
      updatedAt: Date.now(),
    });
  } else
    id = await ctx.db.insert("accounts", {
      ...fields,
      userId: ctx.userId,
      manual: true,
      updatedAt: Date.now(),
    });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const balance = await ctx.db
    .query("balances")
    .withIndex("by_accountId_and_date", (q) =>
      q.eq("accountId", id).eq("date", today),
    )
    .unique();
  if (balance)
    await ctx.db.patch(balance._id, { balanceCents: fields.balanceCents });
  else
    await ctx.db.insert("balances", {
      userId: ctx.userId,
      accountId: id,
      date: today,
      balanceCents: fields.balanceCents,
    });
  return id;
}
export const saveAccount = userMutation({
  args: { id: v.optional(v.id("accounts")), ...accountFields },
  returns: v.id("accounts"),
  handler: saveAccountForUser,
});
export const saveProfile = userMutation({
  args: {
    name: v.optional(v.string()),
    reviewNew: v.optional(v.boolean()),
    allowPending: v.optional(v.boolean()),
    investmentActivity: v.optional(v.boolean()),
    widgets: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, fields) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (!profile) throw new ConvexError("Set up your workspace first.");
    if (fields.name !== undefined) fields.name = text(fields.name);
    if (
      fields.widgets &&
      (fields.widgets.length > 20 ||
        fields.widgets.some(
          (w) =>
            ![
              "netWorth",
              "spending",
              "cashFlow",
              "recurring",
              "transactions",
              "accounts",
              "topMerchants",
            ].includes(w),
        ))
    )
      throw new ConvexError("Choose supported dashboard widgets.");
    await ctx.db.patch(profile._id, fields);
    return null;
  },
});
export const profileForUpload = userQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (!profile) throw new ConvexError("Set up your workspace first.");
    return null;
  },
});

export const saveProfileAvatar = userMutation({
  args: { preset: v.union(avatarPreset, v.null()) },
  returns: v.null(),
  handler: async (ctx, { preset }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (!profile) throw new ConvexError("Set up your workspace first.");
    await ctx.db.patch(profile._id, {
      avatarPreset: preset ?? undefined,
      photoStorageId: undefined,
    });
    if (profile.photoStorageId)
      await ctx.storage.delete(profile.photoStorageId);
    return null;
  },
});

export const storeProfilePhoto = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { userId, storageId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new ConvexError("Set up your workspace first.");
    await ctx.db.patch(profile._id, {
      photoStorageId: storageId,
      avatarPreset: undefined,
    });
    if (profile.photoStorageId && profile.photoStorageId !== storageId)
      await ctx.storage.delete(profile.photoStorageId);
    return null;
  },
});

export const uploadProfilePhoto = userAction({
  args: { bytes: v.bytes(), contentType: v.string() },
  returns: v.null(),
  handler: async (ctx, { bytes, contentType }): Promise<null> => {
    await ctx.runQuery(api.workspace.profileForUpload, {});
    if (!bytes.byteLength || bytes.byteLength > 1024 * 1024)
      throw new ConvexError("Choose a cropped photo up to 1 MB.");
    const header = new Uint8Array(bytes);
    const jpeg =
      contentType === "image/jpeg" &&
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff;
    const png =
      contentType === "image/png" &&
      [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => header[index] === byte,
      );
    if (!jpeg && !png) throw new ConvexError("Choose a JPEG or PNG photo.");
    // The action creates storage IDs; clients cannot attach someone else's file.
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: contentType }),
    );
    try {
      await ctx.runMutation(internal.workspace.storeProfilePhoto, {
        userId: ctx.userId,
        storageId,
      });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
    return null;
  },
});

export const saveReport = userMutation({
  args: {
    id: v.optional(v.id("savedReports")),
    accountId: v.optional(v.id("accounts")),
    categoryId: v.optional(v.id("categories")),
    merchantId: v.optional(v.id("merchants")),
    tagId: v.optional(v.id("tags")),
    stacked: v.optional(v.boolean()),
    name: v.string(),
    report: v.string(),
    groupBy: v.string(),
    chart: v.string(),
    from: v.string(),
    to: v.string(),
  },
  returns: v.id("savedReports"),
  handler: async (ctx, { id, ...fields }) => {
    if (fields.accountId) await owned(ctx, fields.accountId);
    if (fields.categoryId) await owned(ctx, fields.categoryId);
    if (fields.merchantId) await owned(ctx, fields.merchantId);
    if (fields.tagId) await owned(ctx, fields.tagId);
    fields.name = text(fields.name);
    date(fields.from);
    date(fields.to);
    if (fields.from > fields.to)
      throw new ConvexError("Choose a valid report date range.");
    if (
      !["spending", "income", "cashflow", "cashFlow"].includes(fields.report) ||
      !["category", "merchant", "group", "account", "month"].includes(
        fields.groupBy,
      ) ||
      !["bar", "line", "sankey", "pie", "donut"].includes(fields.chart)
    )
      throw new ConvexError("Choose a supported report type.");
    if (id) {
      await owned(ctx, id);
      await ctx.db.patch(id, {
        ...fields,
        accountId: fields.accountId,
        categoryId: fields.categoryId,
        merchantId: fields.merchantId,
        tagId: fields.tagId,
      });
      return id;
    }
    return await ctx.db.insert("savedReports", {
      userId: ctx.userId,
      ...fields,
    });
  },
});
export const deleteReport = userMutation({
  args: { id: v.id("savedReports") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.delete(id);
    return null;
  },
});

export const importBalances = userMutation({
  args: {
    accountId: v.id("accounts"),
    rows: v.array(v.object({ date: v.string(), balanceCents: v.number() })),
  },
  returns: v.number(),
  handler: async (ctx, { accountId, rows }) => {
    await owned(ctx, accountId);
    if (rows.length > 100)
      throw new ConvexError("Import at most 100 balance rows per batch.");
    // Connected accounts keep today's provider snapshot and current balance;
    // older dates fill in history the provider never supplied.
    const today = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      date(row.date);
      cents(row.balanceCents);
      if (row.date > today)
        throw new ConvexError("Balance history cannot be dated in the future.");
      const existing = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q.eq("accountId", accountId).eq("date", row.date),
        )
        .unique();
      if (existing)
        await ctx.db.patch(existing._id, { balanceCents: row.balanceCents });
      else
        await ctx.db.insert("balances", {
          userId: ctx.userId,
          accountId,
          ...row,
        });
    }
    return rows.length;
  },
});

/**
 * Folds a manually tracked account into another account, in bounded steps the
 * client repeats until `done`. Spreadsheet rows that duplicate a synced
 * purchase on the target enrich that row and disappear; everything else moves.
 * Used after connecting a bank whose history was first imported by hand.
 */
export const mergeAccounts = userMutation({
  args: { sourceId: v.id("accounts"), targetId: v.id("accounts") },
  returns: v.object({
    done: v.boolean(),
    moved: v.number(),
    matched: v.number(),
  }),
  handler: async (ctx, { sourceId, targetId }) => {
    const source = await owned(ctx, sourceId),
      target = await owned(ctx, targetId);
    if (sourceId === targetId)
      throw new ConvexError("Choose a different account to merge into.");
    if (!source.manual)
      throw new ConvexError(
        "Only manually tracked accounts can be merged into another account.",
      );
    if (target.closed)
      throw new ConvexError("Choose an open account to merge into.");
    let moved = 0,
      matched = 0;
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_userId_and_accountId_and_date", (q) =>
        q.eq("userId", ctx.userId).eq("accountId", sourceId),
      )
      .take(50);
    for (const row of transactions) {
      const spreadsheetRow =
        row.source === "csv" &&
        !row.plaidTransactionId &&
        !row.simplefinTransactionId;
      const synced = spreadsheetRow
        ? await findMatchingTransaction(
            ctx,
            {
              accountId: targetId,
              date: row.date,
              amountCents: row.amountCents,
              originalName: row.originalName,
            },
            (candidate) =>
              candidate.source !== "csv" &&
              !candidate.importKey &&
              !candidate.removedFromBank,
          )
        : null;
      if (!synced) {
        await ctx.db.patch(row._id, {
          accountId: targetId,
          updatedAt: Date.now(),
        });
        moved++;
        continue;
      }
      const editedFields = [...synced.editedFields];
      const patch: Partial<TransactionFields> = {
        tagIds: unionTags(synced.tagIds, row.tagIds),
        reviewed: synced.reviewed || row.reviewed,
      };
      if (!synced.notes && row.notes) {
        patch.notes = row.notes;
        if (!editedFields.includes("notes")) editedFields.push("notes");
      }
      if (!editedFields.includes("categoryId")) {
        patch.categoryId = row.categoryId;
        editedFields.push("categoryId");
      }
      const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_transactionId", (q) => q.eq("transactionId", row._id))
        .take(21);
      for (const attachment of attachments)
        await ctx.db.patch(attachment._id, { transactionId: synced._id });
      const merged = { ...synced, ...patch };
      await ctx.db.patch(synced._id, {
        ...patch,
        editedFields,
        ...(row.importKey ? { importKey: row.importKey } : {}),
        attachmentCount:
          (synced.attachmentCount ?? 0) + attachments.length || undefined,
        updatedAt: Date.now(),
        searchText: await refreshSearch(ctx, merged),
      });
      const activity = await ctx.db
        .query("activity")
        .withIndex("by_transactionId", (q) => q.eq("transactionId", row._id))
        .take(50);
      for (const entry of activity)
        await ctx.db.patch(entry._id, { transactionId: synced._id });
      await changeMerchantCount(ctx, row.merchantId, null);
      await ctx.db.delete(row._id);
      matched++;
    }
    if (transactions.length) return { done: false, moved, matched };
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_accountId_and_date", (q) => q.eq("accountId", sourceId))
      .take(100);
    for (const row of balances) {
      const existing = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q.eq("accountId", targetId).eq("date", row.date),
        )
        .unique();
      // The target's own snapshot for a day is authoritative.
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { accountId: targetId });
      moved++;
    }
    if (balances.length) return { done: false, moved, matched };
    for (const table of ["recurring", "savedReports"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(500);
      for (const row of rows)
        if (row.accountId === sourceId)
          await ctx.db.patch(row._id, { accountId: targetId });
    }
    const holdings = await ctx.db
      .query("investmentHoldings")
      .withIndex("by_userId_and_accountId", (q) =>
        q.eq("userId", ctx.userId).eq("accountId", sourceId),
      )
      .take(100);
    for (const row of holdings)
      await ctx.db.patch(row._id, { accountId: targetId });
    const events = await ctx.db
      .query("investmentTransactions")
      .withIndex("by_userId_and_accountId_and_date", (q) =>
        q.eq("userId", ctx.userId).eq("accountId", sourceId),
      )
      .take(100);
    for (const row of events)
      await ctx.db.patch(row._id, { accountId: targetId });
    if (holdings.length || events.length)
      return { done: false, moved, matched };
    await ctx.db.delete(sourceId);
    return { done: true, moved, matched };
  },
});

// The UI asks for explicit confirmation before calling this destructive demo reset.
export const clearSample = userMutation({
  args: {},
  returns: v.object({ done: v.boolean(), deleted: v.number() }),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    if (user?.isAnonymous)
      throw new ConvexError(
        "Exit the demo and sign in to set up your own finances.",
      );
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (!profile) return { done: true, deleted: 0 };
    if (!profile.demo)
      throw new ConvexError("Only a sample workspace can be reset this way.");
    if (
      (
        await ctx.db
          .query("plaidItems")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(1)
      ).length
    )
      throw new ConvexError(
        "Disconnect all banks before resetting sample data.",
      );
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
      .take(100);
    if (rules.length) {
      for (const rule of rules) await ctx.db.delete(rule._id);
      return { done: false, deleted: rules.length };
    }
    for (const table of [
      "forecastScenarios",
      "investmentHoldings",
      "investmentTransactions",
      "investmentSecurities",
      "investmentSyncStates",
      "attachments",
      "uploads",
      "activity",
      "recurring",
      "savedReports",
      "tags",
      "merchants",
      "categories",
      "groups",
      "accounts",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(100);
      if (!rows.length) continue;
      for (const row of rows) {
        if ("storageId" in row) await ctx.storage.delete(row.storageId);
        if ("logoStorageId" in row && row.logoStorageId)
          await ctx.storage.delete(row.logoStorageId);
        await ctx.db.delete(row._id);
      }
      return { done: false, deleted: rows.length };
    }
    for (const table of [
      "transactions",
      "balances",
      "recurringPayments",
      "creditScores",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
        .take(100);
      if (!rows.length) continue;
      for (const row of rows) await ctx.db.delete(row._id);
      return { done: false, deleted: rows.length };
    }
    if (profile.photoStorageId)
      await ctx.storage.delete(profile.photoStorageId);
    await ctx.db.delete(profile._id);
    return { done: true, deleted: 1 };
  },
});

// Tables emptied by clearWorkspace, grouped by the index whose first field is
// userId. Preferences, reminders, assistant grants and the profile are kept.
const clearedByUserId = [
  "forecastScenarios",
  "investmentHoldings",
  "investmentTransactions",
  "investmentSecurities",
  "investmentSyncStates",
  "attachments",
  "uploads",
  "activity",
  "recurring",
  "savedReports",
  "tags",
  "merchants",
  "categories",
  "groups",
  "accounts",
  "simplefinConnections",
] as const;
const clearedByUserIdAndDate = [
  "transactions",
  "balances",
  "recurringPayments",
  "creditScores",
] as const;
const CLEAR_CONFIRMATION = "CLEAR";
/**
 * Start over without leaving. Removes every account, transaction, receipt,
 * category, merchant, rule, tag, recurring item, report, credit score,
 * forecast and bank connection, then restores the default categories. The
 * sign-in, name, photo and preferences stay. Runs in batches: call until done.
 */
export const clearWorkspace = userMutation({
  args: { confirmation: v.string() },
  returns: v.object({ done: v.boolean(), deleted: v.number() }),
  handler: async (ctx, { confirmation }) => {
    const user = await ctx.db.get(ctx.userId);
    if (!user || user.isAnonymous)
      throw new ConvexError(
        "Exit the demo and sign in before clearing a workspace.",
      );
    if (confirmation !== CLEAR_CONFIRMATION)
      throw new ConvexError(`Type ${CLEAR_CONFIRMATION} to confirm.`);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    if (!profile) throw new ConvexError("Set up your workspace first.");
    if (profile.deletionRequestedAt)
      throw new ConvexError("This account is already being deleted.");
    // Bank access at Plaid is revoked as the connection rows go. SimpleFIN
    // keeps no server-side grant; its access URL simply leaves with the row.
    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(20);
    if (items.length) {
      for (const item of items) {
        if (item.status !== "disconnected")
          await ctx.scheduler.runAfter(
            0,
            internal.workspace.revokePlaidAccess,
            {
              accessToken: item.accessToken,
              environment: item.environment,
            },
          );
        await ctx.db.delete(item._id);
      }
      return { done: false, deleted: items.length };
    }
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_userId_and_order", (q) => q.eq("userId", ctx.userId))
      .take(100);
    if (rules.length) {
      for (const rule of rules) await ctx.db.delete(rule._id);
      return { done: false, deleted: rules.length };
    }
    const deliveries = await ctx.db
      .query("reminderDeliveries")
      .withIndex("by_userId_and_channel_and_occurrenceKey", (q) =>
        q.eq("userId", ctx.userId),
      )
      .take(100);
    if (deliveries.length) {
      for (const row of deliveries) await ctx.db.delete(row._id);
      return { done: false, deleted: deliveries.length };
    }
    for (const table of clearedByUserId) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(100);
      if (!rows.length) continue;
      for (const row of rows) {
        if ("storageId" in row) await ctx.storage.delete(row.storageId);
        if ("logoStorageId" in row && row.logoStorageId)
          await ctx.storage.delete(row.logoStorageId);
        await ctx.db.delete(row._id);
      }
      return { done: false, deleted: rows.length };
    }
    for (const table of clearedByUserIdAndDate) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId_and_date", (q) => q.eq("userId", ctx.userId))
        .take(100);
      if (!rows.length) continue;
      for (const row of rows) await ctx.db.delete(row._id);
      return { done: false, deleted: rows.length };
    }
    // Everything is gone: a fresh workspace gets its default categories back so
    // the next import or manual entry has somewhere to land.
    await ctx.db.patch(profile._id, { demo: false });
    await seedCategories(ctx);
    return { done: true, deleted: 0 };
  },
});
/** Best-effort revocation; the token was already erased with its row. */
export const revokePlaidAccess = internalAction({
  args: {
    accessToken: v.string(),
    environment: v.union(v.literal("sandbox"), v.literal("production")),
  },
  returns: v.null(),
  handler: async (_ctx, { accessToken, environment }) => {
    try {
      await plaidRequest(
        "/item/remove",
        { access_token: accessToken },
        environment,
      );
    } catch (error) {
      console.warn(
        "Clear workspace: Plaid revocation failed",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  },
});
