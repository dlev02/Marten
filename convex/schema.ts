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
const owner = { userId: v.id("users") };
export default defineSchema({
  ...authTables,
  creditScores: defineTable({
    ...owner,
    ...creditScoreFields,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_bureau_and_model_and_date", ["userId", "bureau", "model", "date"]),
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
  profiles: defineTable({
    ...owner,
    name: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    avatarPreset: v.optional(avatarPreset),
    demo: v.boolean(),
    reviewNew: v.boolean(),
    allowPending: v.boolean(),
    widgets: v.array(v.string()),
  }).index("by_userId", ["userId"]),
  accounts: defineTable({
    ...owner,
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
    logoUrl: v.optional(v.string()),
    availableCents: v.optional(v.number()),
    limitCents: v.optional(v.number()),
    statementCents: v.optional(v.number()),
    minimumCents: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    statementDate: v.optional(v.string()),
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
      v.literal("sample"),
      v.literal("csv"),
    ),
    searchText: v.string(),
    updatedAt: v.number(),
    editedFields: v.array(v.string()),
    plaidTransactionId: v.optional(v.string()),
    pendingTransactionId: v.optional(v.string()),
    removedFromBank: v.optional(v.boolean()),
    splitDraft: v.optional(v.array(split)),
    attachmentCount: v.optional(v.number()),
    importKey: v.optional(v.string()),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_plaidTransactionId", ["userId", "plaidTransactionId"])
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
    itemId: v.optional(v.id("plaidItems")),
    ...securityFields,
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"]),
  investmentHoldings: defineTable({
    ...owner,
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
