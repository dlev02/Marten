/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { publicIpv4 } from "./lib/safeWebsiteRequest";

const modules = import.meta.glob("./**/*.ts");

test("file capabilities cannot cross owners or survive revocation, migration or workspace clearing", async () => {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "alice-security@example.test" }),
    await ctx.db.insert("users", { email: "bob-security@example.test" }),
  ]);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", {
      userId: a,
      expirationTime: Date.now() + 86400_000,
    }),
  );
  const alice = t.withIdentity({ subject: `${a}|${sessionId}` });
  const bob = t.withIdentity({ subject: b });
  await alice.mutation(api.workspace.initialize, { sample: false });
  await bob.mutation(api.workspace.initialize, { sample: false });
  const { accounts, categories } = await alice.mutation(
    api.imports.prepareDestinations,
    {
      accounts: [{ name: "Fictional Checking", kind: "cash", closed: false }],
      categories: [
        { name: "Fictional purchases", kind: "expense", emoji: "🛒" },
      ],
    },
  );
  const ids = await t.run(async (ctx) => {
    const merchantId = await ctx.db.insert("merchants", {
      userId: a,
      name: "Fictional shop",
      normalizedName: "fictional shop",
      color: "var(--muted)",
      transactionCount: 1,
    });
    const transactionId = await ctx.db.insert("transactions", {
      userId: a,
      accountId: accounts[0]._id,
      categoryId: categories[0]._id,
      merchantId,
      date: "2026-01-01",
      amountCents: 100,
      originalName: "Fictional shop",
      notes: "",
      tagIds: [],
      reviewed: false,
      hidden: false,
      pending: false,
      splits: [],
      source: "manual",
      updatedAt: Date.now(),
      editedFields: [],
      searchText: "fictional shop",
    });
    const storageId = await ctx.storage.store(
      new Blob(["%PDF-1.7 fictional receipt"], { type: "application/pdf" }),
    );
    const receiptId = await ctx.db.insert("attachments", {
      userId: a,
      transactionId,
      storageId,
      name: "receipt.pdf",
      contentType: "application/pdf",
      size: 27,
    });
    await ctx.db.insert("merchantAliases", {
      userId: a,
      merchantId,
      normalizedName: "old shop",
    });
    return { receiptId, storageId, transactionId };
  });
  expect((await t.fetch(`/receipts?id=${ids.receiptId}`)).status).toBe(404);
  expect((await bob.fetch(`/receipts?id=${ids.receiptId}`)).status).toBe(404);
  const download = await alice.fetch(`/receipts?id=${ids.receiptId}`);
  expect(download.status).toBe(200);
  expect(download.headers.get("cache-control")).toContain("no-store");
  expect(await download.text()).toContain("fictional receipt");
  const detail = await alice.query(api.transactions.detail, {
    id: ids.transactionId,
  });
  expect(detail.attachments[0]).not.toHaveProperty("storageId");
  expect(detail.attachments[0]).not.toHaveProperty("url");
  // The former storage-ID attack now fails shape validation before any blob is touched.
  expect(
    (
      await bob.fetch("/imports/upload?kind=transactions", {
        method: "POST",
        body: JSON.stringify({ storageId: ids.storageId, total: 1 }),
      })
    ).status,
  ).toBe(400);
  expect(
    await t.run(async (ctx) => (await ctx.storage.get(ids.storageId)) !== null),
  ).toBe(true);
  expect(
    (
      await bob.fetch("/imports/upload?kind=transactions", {
        method: "POST",
        headers: { "Content-Length": String(21 * 1024 * 1024) },
        body: "[]",
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await alice.fetch("/receipts?id=x", {
        headers: { Origin: "https://attacker.example" },
      })
    ).status,
  ).toBe(403);
  expect(
    await t.action(internal.securityMaintenance.rotateReceiptUrls, {
      cursor: null,
    }),
  ).toMatchObject({ changed: 1, done: true });
  expect(await t.run((ctx) => ctx.storage.get(ids.storageId))).toBeNull();
  expect((await alice.fetch(`/receipts?id=${ids.receiptId}`)).status).toBe(200);
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["[]"])));
  const jobId = await t.mutation(internal.imports.start, {
    userId: a,
    storageId,
    kind: "balances",
    total: 1,
  });
  // First clear call fences a job even if its scheduled action was already running.
  await alice.mutation(api.workspace.clearWorkspace, { confirmation: "CLEAR" });
  await expect(
    t.mutation(internal.imports.balanceBatch, {
      jobId,
      accountId: accounts[0]._id,
      rows: [{ date: "2026-01-01", balanceCents: 1 }],
      accounts: 1,
    }),
  ).rejects.toThrow();
  while (
    !(
      await alice.mutation(api.workspace.clearWorkspace, {
        confirmation: "CLEAR",
      })
    ).done
  ) {
    /* bounded batches */
  }
  expect(await t.run((ctx) => ctx.db.get(jobId))).toBeNull();
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("merchantAliases").collect()),
  ).toEqual([]);
  await t.run((ctx) => ctx.db.delete(sessionId));
  expect((await alice.fetch(`/receipts?id=${ids.receiptId}`)).status).toBe(404);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  for (const blocked of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
  ])
    expect(publicIpv4(blocked)).toBe(false);
  expect(publicIpv4("1.1.1.1")).toBe(true);
});
