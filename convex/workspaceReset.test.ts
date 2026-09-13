/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const now = Date.parse("2026-09-12T12:00:00Z");

test("clearing a workspace empties everything owned, keeps the sign-in and preferences, and restores default categories", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "reset-fixture@example.test",
    });
    const otherId = await ctx.db.insert("users", {
      email: "reset-other@example.test",
    });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Fictional owner",
      demo: true,
      reviewNew: true,
      allowPending: false,
      widgets: ["netWorth"],
    });
    await ctx.db.insert("profiles", {
      userId: otherId,
      name: "Fictional neighbour",
      demo: false,
      reviewNew: true,
      allowPending: false,
      widgets: [],
    });
    await ctx.db.insert("reminderPreferences", {
      userId,
      emailEnabled: false,
      daysBefore: 3,
      timeMinutes: 540,
      timeZone: "America/Chicago",
      updatedAt: now,
    });
    await ctx.db.insert("agentPreferences", {
      userId,
      browserEnabled: true,
      browserAllowEdits: false,
      updatedAt: now,
    });
    await ctx.db.insert("reminderDeliveries", {
      userId,
      occurrenceKey: "fixture",
      dueDate: "2026-09-15",
      channel: "browser",
      status: "sent",
      batchId: "b1",
      claimedAt: now,
    });
    await ctx.db.insert("simplefinConnections", {
      userId,
      accessUrl: "https://fixture:secret@bridge.example.org/simplefin",
      host: "bridge.example.org",
      status: "connected",
      syncVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    const seedAccount = async (owner: typeof userId) =>
      ctx.db.insert("accounts", {
        userId: owner,
        name: "Fixture checking",
        institution: "Fixture Bank",
        mask: "0001",
        kind: "cash",
        subtype: "checking",
        balanceCents: 1000,
        currency: "USD",
        hidden: false,
        excludeNetWorth: false,
        closed: false,
        manual: true,
        updatedAt: now,
      });
    const accountId = await seedAccount(userId);
    await seedAccount(otherId);
    const groupId = await ctx.db.insert("groups", {
      userId,
      name: "Spending",
      kind: "expense",
      order: 0,
    });
    const categoryId = await ctx.db.insert("categories", {
      userId,
      groupId,
      name: "Groceries",
      emoji: "",
      order: 0,
      enabled: true,
    });
    const merchantId = await ctx.db.insert("merchants", {
      userId,
      name: "Fixture market",
      normalizedName: "fixture market",
      color: "#123456",
      transactionCount: 1,
    });
    const tagId = await ctx.db.insert("tags", {
      userId,
      name: "Fixture tag",
      color: "#123456",
      order: 0,
    });
    await ctx.db.insert("rules", {
      userId,
      name: "Fixture rule",
      match: "all",
      conditions: [{ field: "merchant", operator: "contains", value: "fix" }],
      actions: { categoryId },
      enabled: true,
      order: 0,
    });
    const transactionId = await ctx.db.insert("transactions", {
      userId,
      accountId,
      merchantId,
      categoryId,
      amountCents: 1234,
      date: "2026-09-01",
      originalName: "FIXTURE MARKET",
      notes: "",
      tagIds: [tagId],
      reviewed: false,
      hidden: false,
      pending: false,
      splits: [],
      source: "csv",
      searchText: "fixture market",
      updatedAt: now,
      editedFields: [],
    });
    const storageId = await ctx.storage.store(
      new Blob(["fixture receipt"], { type: "application/pdf" }),
    );
    await ctx.db.insert("attachments", {
      userId,
      transactionId,
      storageId,
      name: "receipt.pdf",
      contentType: "application/pdf",
      size: 15,
    });
    await ctx.db.insert("balances", {
      userId,
      accountId,
      date: "2026-09-01",
      balanceCents: 1000,
    });
    const recurringId = await ctx.db.insert("recurring", {
      userId,
      merchantId,
      accountId,
      categoryId,
      amountCents: 1234,
      frequency: "monthly",
      nextDate: "2026-10-01",
      active: true,
      source: "manual",
      note: "",
    });
    await ctx.db.insert("recurringPayments", {
      userId,
      recurringId,
      date: "2026-09-01",
      paid: true,
    });
    await ctx.db.insert("savedReports", {
      userId,
      name: "Fixture report",
      report: "spending",
      groupBy: "category",
      chart: "bar",
      from: "2026-01-01",
      to: "2026-09-01",
    });
    await ctx.db.insert("creditScores", {
      userId,
      score: 742,
      date: "2026-09-01",
      bureau: "TransUnion",
      model: "FICO Score 8",
      source: "Fixture",
      entryMethod: "manual",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, otherId, profileId, storageId };
  });
  const asUser = t.withIdentity({ subject: seeded.userId });
  await expect(
    asUser.mutation(api.workspace.clearWorkspace, { confirmation: "nope" }),
  ).rejects.toThrow("Type CLEAR");
  let result = { done: false, deleted: 0 },
    total = 0,
    steps = 0;
  while (!result.done && steps++ < 100) {
    result = await asUser.mutation(api.workspace.clearWorkspace, {
      confirmation: "CLEAR",
    });
    total += result.deleted;
  }
  expect(result.done).toBe(true);
  expect(total).toBeGreaterThan(10);
  await t.run(async (ctx) => {
    for (const table of [
      "accounts",
      "transactions",
      "merchants",
      "tags",
      "rules",
      "recurring",
      "recurringPayments",
      "savedReports",
      "creditScores",
      "balances",
      "attachments",
      "simplefinConnections",
      "reminderDeliveries",
    ] as const)
      expect(
        (await ctx.db.query(table).collect()).filter(
          (row) => row.userId === seeded.userId,
        ),
        table,
      ).toHaveLength(0);
    expect(await ctx.storage.getUrl(seeded.storageId)).toBeNull();
    // The neighbour's account is untouched.
    expect(await ctx.db.query("accounts").collect()).toHaveLength(1);
    // Defaults are back and the profile is no longer a sample workspace.
    const categories = (await ctx.db.query("categories").collect()).filter(
      (row) => row.userId === seeded.userId,
    );
    expect(categories.length).toBeGreaterThan(5);
    expect(categories.some((row) => row.name === "Groceries")).toBe(true);
    expect(await ctx.db.get(seeded.profileId)).toMatchObject({
      name: "Fictional owner",
      demo: false,
      widgets: ["netWorth"],
    });
    expect(await ctx.db.get(seeded.userId)).not.toBeNull();
    expect(await ctx.db.query("reminderPreferences").collect()).toHaveLength(1);
    expect(await ctx.db.query("agentPreferences").collect()).toHaveLength(1);
  });
  // A workspace that is fresh already clears in one step.
  expect(
    await asUser.mutation(api.workspace.clearWorkspace, {
      confirmation: "CLEAR",
    }),
  ).toMatchObject({ done: false });
});

test("guests cannot clear a workspace", async () => {
  const t = convexTest(schema, modules);
  const guestId = await t.run((ctx) =>
    ctx.db.insert("users", { isAnonymous: true }),
  );
  await expect(
    t
      .withIdentity({ subject: guestId })
      .mutation(api.workspace.clearWorkspace, { confirmation: "CLEAR" }),
  ).rejects.toThrow("Exit the demo");
});
