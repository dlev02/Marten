import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { forecastInputs } from "./lib/forecastValidators";
import { creditScoreFields } from "./lib/creditScores";
import {
  securityFields,
  positionFields,
  investmentEventFields,
} from "./lib/investmentData";
import {
  accountKind,
  recurringFields,
  statementReminderFields,
  kind,
  ruleFields,
  transactionFields,
  split,
  avatarPreset,
} from "./validators";
import { chartDefaults } from "./lib/chartDefaults";
import { bankProvider } from "./lib/bankProviders";
const owner = { userId: v.id("users") };
export default defineSchema({
  ...authTables,
  agentPreferences: defineTable({
    ...owner,
    browserEnabled: v.boolean(),
    browserAllowEdits: v.boolean(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  agentAuthorizationRequests: defineTable({
    requestHash: v.string(),
    clientId: v.string(),
    clientName: v.string(),
    redirectUri: v.string(),
    challenge: v.string(),
    scopes: v.array(v.string()),
    resource: v.string(),
    issuer: v.string(),
    state: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    codeHash: v.optional(v.string()),
    grantId: v.optional(v.id("agentGrants")),
    completedAt: v.optional(v.number()),
    redeemedAt: v.optional(v.number()),
  })
    .index("by_requestHash", ["requestHash"])
    .index("by_codeHash", ["codeHash"])
    .index("by_expiresAt", ["expiresAt"]),
  agentGrants: defineTable({
    ...owner,
    clientId: v.string(),
    clientName: v.string(),
    scopes: v.array(v.string()),
    resource: v.string(),
    issuer: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),
  agentTokens: defineTable({
    grantId: v.id("agentGrants"),
    tokenHash: v.string(),
    kind: v.union(v.literal("access"), v.literal("refresh")),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_grantId", ["grantId"])
    .index("by_expiresAt", ["expiresAt"]),
  agentActivity: defineTable({
    ...owner,
    grantId: v.optional(v.id("agentGrants")),
    tool: v.string(),
    source: v.union(v.literal("browser"), v.literal("mcp")),
    readOnly: v.boolean(),
    success: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"]),
  creditScores: defineTable({
    ...owner,
    ...creditScoreFields,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_bureau_and_model_and_date", [
      "userId",
      "bureau",
      "model",
      "date",
    ]),
  forecastScenarios: defineTable({
    ...owner,
    name: v.string(),
    inputs: forecastInputs,
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  resetEmailLimits: defineTable({
    email: v.string(),
    lastSentAt: v.number(),
    windowStartedAt: v.number(),
    requests: v.number(),
  }).index("by_email", ["email"]),
  reminderPreferences: defineTable({
    ...owner,
    emailEnabled: v.boolean(),
    verifiedEmail: v.optional(v.string()),
    daysBefore: v.number(),
    timeMinutes: v.number(),
    timeZone: v.string(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_emailEnabled", ["emailEnabled"]),
  reminderEmailVerifications: defineTable({
    ...owner,
    email: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    sentAt: v.number(),
    attempts: v.number(),
    windowStartedAt: v.number(),
    requests: v.number(),
  }).index("by_userId", ["userId"]),
  reminderDeliveries: defineTable({
    ...owner,
    occurrenceKey: v.string(),
    dueDate: v.string(),
    channel: v.union(v.literal("browser"), v.literal("email")),
    status: v.union(
      v.literal("claimed"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    batchId: v.string(),
    claimedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId_and_channel_and_occurrenceKey", [
      "userId",
      "channel",
      "occurrenceKey",
    ])
    .index("by_userId_and_channel_and_claimedAt", [
      "userId",
      "channel",
      "claimedAt",
    ])
    .index("by_dueDate", ["dueDate"]),
  profiles: defineTable({
    ...owner,
    name: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    avatarPreset: v.optional(avatarPreset),
    demo: v.boolean(),
    reviewNew: v.boolean(),
    allowPending: v.boolean(),
    // Whether trades, dividends and sweeps from investment accounts are imported
    // as transactions. Off (the default) keeps brokerage activity to balances
    // and holdings so a share purchase never reads as spending.
    investmentActivity: v.optional(v.boolean()),
    widgets: v.array(v.string()),
    chartDefaults: v.optional(chartDefaults),
    // Set when the owner asked to delete the account; the scheduled sweep in
    // accountDeletion.ts is emptying every table and will remove the sign-in last.
    deletionRequestedAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),
  // One connection per user and provider. Legacy simplefin table/field names
  // remain for persisted IDs; absent provider means SimpleFIN. accessUrl holds
  // the server-only credential (an API key for Lunch Flow).
  simplefinConnections: defineTable({
    ...owner,
    provider: v.optional(bankProvider),
    accessUrl: v.string(),
    host: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("syncing"),
      v.literal("error"),
      v.literal("disconnected"),
    ),
    syncVersion: v.number(),
    syncLease: v.optional(v.number()),
    syncedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    warning: v.optional(v.string()),
    providerErrors: v.optional(v.array(v.string())),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status_and_syncedAt", ["status", "syncedAt"]),
  accounts: defineTable({
    ...owner,
    importName: v.optional(v.string()),
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
    manual: v.boolean(),
    updatedAt: v.number(),
    itemId: v.optional(v.id("plaidItems")),
    plaidAccountId: v.optional(v.string()),
    simplefinConnectionId: v.optional(v.id("simplefinConnections")),
    simplefinAccountId: v.optional(v.string()),
    bankProvider: v.optional(bankProvider),
    connectionProvider: v.optional(v.string()),
    simplefinImportFromDate: v.optional(v.string()),
    simplefinUpdatedAt: v.optional(v.number()),
    logoUrl: v.optional(v.string()),
    availableCents: v.optional(v.number()),
    limitCents: v.optional(v.number()),
    statementCents: v.optional(v.number()),
    minimumCents: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    statementDate: v.optional(v.string()),
    statementPaidDate: v.optional(v.string()),
    // How the upcoming card/loan payment is planned: the full statement (default) or the minimum.
    paymentPlan: v.optional(
      v.union(v.literal("statement"), v.literal("minimum")),
    ),
    statementReminder: v.optional(
      v.object({
        ...statementReminderFields,
        updatedAt: v.number(),
      }),
    ),
    apy: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"])
    .index("by_simplefinConnectionId", ["simplefinConnectionId"])
    .index("by_simplefinConnectionId_and_simplefinAccountId", [
      "simplefinConnectionId",
      "simplefinAccountId",
    ])
    .index("by_userId_and_plaidAccountId", ["userId", "plaidAccountId"]),
  balances: defineTable({
    ...owner,
    accountId: v.id("accounts"),
    date: v.string(),
    balanceCents: v.number(),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_accountId_and_date", ["accountId", "date"]),
  groups: defineTable({
    ...owner,
    name: v.string(),
    kind,
    order: v.number(),
  }).index("by_userId", ["userId"]),
  categories: defineTable({
    ...owner,
    importName: v.optional(v.string()),
    groupId: v.id("groups"),
    name: v.string(),
    emoji: v.string(),
    order: v.number(),
    enabled: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_groupId", ["groupId"]),
  merchants: defineTable({
    ...owner,
    name: v.string(),
    normalizedName: v.string(),
    color: v.string(),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    transactionCount: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_normalizedName", ["userId", "normalizedName"]),
  tags: defineTable({
    ...owner,
    name: v.string(),
    color: v.string(),
    order: v.number(),
  }).index("by_userId", ["userId"]),
  transactions: defineTable({
    ...owner,
    ...transactionFields,
    source: v.union(
      v.literal("manual"),
      v.literal("plaid"),
      v.literal("simplefin"),
      v.literal("lunchflow"),
      v.literal("sample"),
      v.literal("csv"),
    ),
    searchText: v.string(),
    updatedAt: v.number(),
    editedFields: v.array(v.string()),
    plaidTransactionId: v.optional(v.string()),
    simplefinTransactionId: v.optional(v.string()),
    pendingTransactionId: v.optional(v.string()),
    removedFromBank: v.optional(v.boolean()),
    splitDraft: v.optional(v.array(split)),
    attachmentCount: v.optional(v.number()),
    importKey: v.optional(v.string()),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_plaidTransactionId", ["userId", "plaidTransactionId"])
    .index("by_accountId_and_simplefinTransactionId", [
      "accountId",
      "simplefinTransactionId",
    ])
    .index("by_userId_and_importKey", ["userId", "importKey"])
    .index("by_userId_and_merchantId_and_date", [
      "userId",
      "merchantId",
      "date",
    ])
    .index("by_userId_and_accountId_and_date", ["userId", "accountId", "date"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["userId"],
    }),
  attachments: defineTable({
    ...owner,
    transactionId: v.id("transactions"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  })
    .index("by_transactionId", ["transactionId"])
    .index("by_userId", ["userId"])
    .index("by_storageId", ["storageId"]),
  uploads: defineTable({
    ...owner,
    storageId: v.id("_storage"),
    purpose: v.union(v.literal("receipt"), v.literal("merchant")),
  })
    .index("by_storageId", ["storageId"])
    .index("by_userId", ["userId"]),
  activity: defineTable({
    ...owner,
    transactionId: v.id("transactions"),
    message: v.string(),
  })
    .index("by_transactionId", ["transactionId"])
    .index("by_userId", ["userId"]),
  rules: defineTable({ ...owner, ...ruleFields }).index("by_userId_and_order", [
    "userId",
    "order",
  ]),
  recurring: defineTable({
    ...owner,
    ...recurringFields,
  }).index("by_userId", ["userId"]),
  recurringPayments: defineTable({
    ...owner,
    recurringId: v.id("recurring"),
    date: v.string(),
    paid: v.boolean(),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_recurringId_and_date", ["recurringId", "date"]),
  savedReports: defineTable({
    ...owner,
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
  }).index("by_userId", ["userId"]),
  investmentSecurities: defineTable({
    ...owner,
    simplefinConnectionId: v.optional(v.id("simplefinConnections")),
    itemId: v.optional(v.id("plaidItems")),
    ...securityFields,
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"]),
  investmentHoldings: defineTable({
    ...owner,
    simplefinConnectionId: v.optional(v.id("simplefinConnections")),
    itemId: v.optional(v.id("plaidItems")),
    accountId: v.id("accounts"),
    securityId: v.id("investmentSecurities"),
    ...positionFields,
    syncedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_accountId", ["userId", "accountId"])
    .index("by_itemId", ["itemId"]),
  investmentTransactions: defineTable({
    ...owner,
    itemId: v.optional(v.id("plaidItems")),
    accountId: v.id("accounts"),
    securityId: v.union(v.id("investmentSecurities"), v.null()),
    ...investmentEventFields,
    canceled: v.boolean(),
    removed: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_accountId_and_date", ["userId", "accountId", "date"]),
  investmentSyncStates: defineTable({
    ...owner,
    itemId: v.id("plaidItems"),
    syncedAt: v.union(v.number(), v.null()),
    historyFrom: v.union(v.string(), v.null()),
    historyTo: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"]),
  plaidItems: defineTable({
    ...owner,
    plaidItemId: v.string(),
    accessToken: v.string(),
    institutionId: v.string(),
    institution: v.string(),
    logoUrl: v.optional(v.string()),
    cursor: v.optional(v.string()),
    environment: v.union(v.literal("sandbox"), v.literal("production")),
    status: v.union(
      v.literal("connected"),
      v.literal("syncing"),
      v.literal("error"),
      v.literal("disconnected"),
    ),
    products: v.array(v.string()),
    error: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
    syncLease: v.optional(v.number()),
    syncVersion: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_plaidItemId", ["plaidItemId"])
    .index("by_userId_and_institutionId", ["userId", "institutionId"]),
});
