import { v } from "convex/values";
export const avatarPreset = v.union(
  v.literal("sage"),
  v.literal("ocean"),
  v.literal("clay"),
  v.literal("dusk"),
  v.literal("sunrise"),
  v.literal("slate"),
);
export const kind = v.union(
  v.literal("income"),
  v.literal("expense"),
  v.literal("transfer"),
);
export const accountKind = v.union(
  v.literal("cash"),
  v.literal("credit"),
  v.literal("investment"),
  v.literal("loan"),
  v.literal("asset"),
);
export const frequency = v.union(
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly"),
);
export const recurringFields = {
  merchantId: v.id("merchants"),
  accountId: v.id("accounts"),
  categoryId: v.id("categories"),
  name: v.optional(v.string()),
  amountCents: v.number(),
  amountToleranceCents: v.optional(v.number()),
  statementContains: v.optional(v.string()),
  frequency,
  nextDate: v.string(),
  active: v.boolean(),
  source: v.union(v.literal("manual"), v.literal("detected")),
  note: v.string(),
};
export const statementReminderFields = {
  dueDate: v.string(),
  statementCents: v.optional(v.number()),
  minimumCents: v.optional(v.number()),
};
export const split = v.object({
  categoryId: v.id("categories"),
  amountCents: v.number(),
  note: v.optional(v.string()),
});
export const condition = v.object({
  field: v.union(
    v.literal("merchant"),
    v.literal("statement"),
    v.literal("amount"),
    v.literal("account"),
    v.literal("category"),
  ),
  operator: v.union(
    v.literal("contains"),
    v.literal("equals"),
    v.literal("greater"),
    v.literal("less"),
  ),
  value: v.string(),
});
export const ruleActions = v.object({
  merchantId: v.optional(v.id("merchants")),
  categoryId: v.optional(v.id("categories")),
  tagIds: v.optional(v.array(v.id("tags"))),
  hidden: v.optional(v.boolean()),
  reviewed: v.optional(v.boolean()),
  splits: v.optional(v.array(split)),
});
export const ruleFields = {
  name: v.string(),
  match: v.union(v.literal("all"), v.literal("any")),
  conditions: v.array(condition),
  actions: ruleActions,
  enabled: v.boolean(),
  order: v.number(),
};
export const transactionFields = {
  accountId: v.id("accounts"),
  merchantId: v.id("merchants"),
  categoryId: v.id("categories"),
  date: v.string(),
  amountCents: v.number(),
  originalName: v.string(),
  notes: v.string(),
  tagIds: v.array(v.id("tags")),
  reviewed: v.boolean(),
  hidden: v.boolean(),
  pending: v.boolean(),
  splits: v.array(split),
};
