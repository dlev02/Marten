/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const a = await t.run((ctx) =>
    ctx.db.insert("users", { email: "import-qa@example.test" }),
  );
  const b = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other-import-qa@example.test" }),
  );
  return {
    t,
    a,
    alice: t.withIdentity({ subject: a }),
    bob: t.withIdentity({ subject: b }),
  };
}
const args = {
  accounts: [
    { name: "Old Visa (...1234)", kind: "credit" as const, closed: true },
  ],
  categories: [{ name: "Hotels", kind: "expense" as const, emoji: "🏨" }],
};
test("destinations are owned, retry-safe and preserve history without an invented snapshot", async () => {
  const { t, alice, bob } = await fixture();
  const first = await alice.mutation(api.imports.prepareDestinations, args);
  expect(first.accounts[0]).toMatchObject({
    manual: true,
    closed: true,
    balanceCents: 0,
    mask: "1234",
  });
  expect(await alice.mutation(api.imports.prepareDestinations, args)).toEqual(
    first,
  );
  const other = await bob.mutation(api.imports.prepareDestinations, args);
  expect(other.accounts[0]._id).not.toBe(first.accounts[0]._id);
  expect(other.categories[0]._id).not.toBe(first.categories[0]._id);
  expect(await t.run((ctx) => ctx.db.query("balances").collect())).toHaveLength(
    0,
  );
  const result = await alice.mutation(api.transactions.importMapped, {
    rows: [
      {
        key: "a".repeat(64),
        accountId: first.accounts[0]._id,
        categoryId: first.categories[0]._id,
        categoryMatched: true,
        merchantName: "Fictional Hotel",
        date: "2020-01-01",
        amountCents: 12000,
        originalName: "FICTIONAL HOTEL",
        notes: "Historical purchase",
      },
    ],
  });
  expect(result.inserted).toBe(1);
});
test("invalid preparation rolls back accounts and categories together", async () => {
  const { t, alice } = await fixture();
  await expect(
    alice.mutation(api.imports.prepareDestinations, {
      ...args,
      categories: [{ ...args.categories[0], name: "" }],
    }),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("accounts").collect())).toEqual([]);
  await expect(
    alice.mutation(api.imports.prepareDestinations, {
      accounts: Array.from({ length: 101 }, () => args.accounts[0]),
      categories: [],
    }),
  ).rejects.toThrow("100");
});
test("new workspaces start with complete illustrated groups and keep user changes on later visits", async () => {
  const { t, alice, bob } = await fixture();
  await alice.mutation(api.workspace.initialize, { sample: false });
  const initial = await alice.query(api.workspace.metadata, {});
  expect(initial.categories.length).toBeGreaterThan(70);
  expect(new Set(initial.categories.map((c) => c.name)).size).toBe(
    initial.categories.length,
  );
  for (const name of [
    "Housing",
    "Food & drink",
    "Auto & transport",
    "Travel",
    "Shopping",
    "Health & wellness",
    "Education",
    "Bills & utilities",
    "Financial",
  ])
    expect(
      initial.groups.some((g) => g.name === name),
      name,
    ).toBe(true);
  const kind = (name: string) =>
    initial.groups.find(
      (g) => g._id === initial.categories.find((c) => c.name === name)?.groupId,
    )?.kind;
  expect(kind("Credit card payment")).toBe("transfer");
  expect(kind("Loan principal")).toBe("transfer");
  expect(kind("Pharmacy")).toBe("expense");
  expect(kind("Paycheck")).toBe("income");
  const deleted = initial.categories.find((c) => c.name === "Souvenirs")!;
  const renamed = initial.categories.find((c) => c.name === "Groceries")!;
  await t.run(async (ctx) => {
    await ctx.db.delete(deleted._id);
    await ctx.db.patch(renamed._id, { name: "My groceries", enabled: false });
  });
  await alice.mutation(api.workspace.initialize, { sample: false });
  const revisited = await alice.query(api.workspace.metadata, {});
  expect(revisited.categories).toHaveLength(initial.categories.length - 1);
  expect(revisited.categories.find((c) => c._id === renamed._id)).toMatchObject(
    { name: "My groceries", enabled: false },
  );
  expect((await bob.query(api.workspace.metadata, {})).categories).toHaveLength(
    0,
  );
});

test("a background job saves uploaded rows in batches, reports progress, and cleans up", async () => {
  const { t, alice, bob } = await fixture();
  await alice.mutation(api.workspace.initialize, { name: "QA", sample: false });
  const { accounts, categories } = await alice.mutation(
    api.imports.prepareDestinations,
    {
      accounts: [{ name: "Job checking", kind: "cash", closed: false }],
      categories: [{ name: "Job groceries", kind: "expense", emoji: "🥑" }],
    },
  );
  const rows = Array.from({ length: 205 }, (_, index) => ({
    key: index.toString(16).padStart(64, "0"),
    accountId: accounts[0]._id,
    categoryId: categories[0]._id,
    merchantName: "Job Market",
    date: "2026-03-01",
    amountCents: 100 + index,
    originalName: `JOB MARKET ${index}`,
    notes: "",
    tags: index % 2 ? ["weekly"] : [],
    reviewed: false,
  }));
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([JSON.stringify(rows)])),
  );
  await expect(
    bob.mutation(api.imports.start, {
      kind: "transactions",
      storageId,
      total: 0,
    }),
  ).rejects.toThrow("between 1 and 50,000");
  const jobId = await alice.mutation(api.imports.start, {
    kind: "transactions",
    storageId,
    total: rows.length,
  });
  expect(await alice.query(api.imports.latest, {})).toMatchObject({
    _id: jobId,
    status: "queued",
    processed: 0,
  });
  await expect(
    alice.mutation(api.imports.start, {
      kind: "transactions",
      storageId,
      total: rows.length,
    }),
  ).rejects.toThrow("already running");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  const job = await alice.query(api.imports.latest, {});
  expect(job).toMatchObject({
    status: "done",
    processed: 205,
    inserted: 205,
    matched: 0,
    skipped: 0,
    acknowledged: false,
  });
  expect(job?.storageId).toBeUndefined();
  expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
  expect(
    (await t.run((ctx) => ctx.db.query("transactions").collect())).length,
  ).toBe(205);
  // Bob never sees Alice's job, and acknowledging is idempotent.
  expect(await bob.query(api.imports.latest, {})).toBeNull();
  await alice.mutation(api.imports.acknowledge, { jobId });
  expect((await alice.query(api.imports.latest, {}))?.acknowledged).toBe(true);
  // Re-running the same rows skips them all.
  const again = await t.run((ctx) =>
    ctx.storage.store(new Blob([JSON.stringify(rows)])),
  );
  await alice.mutation(api.imports.start, {
    kind: "transactions",
    storageId: again,
    total: rows.length,
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  expect(await alice.query(api.imports.latest, {})).toMatchObject({
    status: "done",
    inserted: 0,
    skipped: 205,
  });
});

test("a balance job groups rows by account and sets manual balances", async () => {
  const { t, alice } = await fixture();
  await alice.mutation(api.workspace.initialize, { name: "QA", sample: false });
  const { accounts } = await alice.mutation(api.imports.prepareDestinations, {
    accounts: [
      { name: "Job savings", kind: "cash", closed: false },
      { name: "Job card", kind: "credit", closed: false },
    ],
    categories: [],
  });
  const rows = [
    { accountId: accounts[0]._id, date: "2026-01-01", balanceCents: 1000 },
    { accountId: accounts[1]._id, date: "2026-01-01", balanceCents: 500 },
    { accountId: accounts[0]._id, date: "2026-01-02", balanceCents: 1200 },
  ];
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([JSON.stringify(rows)])),
  );
  await alice.mutation(api.imports.start, {
    kind: "balances",
    storageId,
    total: rows.length,
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  expect(await alice.query(api.imports.latest, {})).toMatchObject({
    status: "done",
    processed: 3,
    updates: 3,
    accounts: 2,
  });
  expect(
    (await t.run((ctx) => ctx.db.get(accounts[0]._id)))?.balanceCents,
  ).toBe(1200);
  expect(
    (await t.run((ctx) => ctx.db.get(accounts[1]._id)))?.balanceCents,
  ).toBe(500);
});

test("a job whose upload is malformed fails with a readable reason", async () => {
  const { t, alice } = await fixture();
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["not json"])),
  );
  await alice.mutation(api.imports.start, {
    kind: "transactions",
    storageId,
    total: 3,
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  expect(await alice.query(api.imports.latest, {})).toMatchObject({
    status: "failed",
    error: "The uploaded rows could not be read.",
  });
});
