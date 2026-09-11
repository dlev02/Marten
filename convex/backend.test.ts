/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";
import type { TransactionFields } from "./lib/transactions";

const modules = import.meta.glob("./**/*.ts");
const paginationOpts = { numItems: 100, cursor: null };
// Valid, generated 2x2 image files and a PDF containing that fictional image.
const receiptFiles = {
  "image/jpeg":
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3SiiirJP/2Q==",
  "image/png":
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8+PUnAwMDEwMYAAAilgLjdfe7hwAAAABJRU5ErkJggg==",
  "image/webp":
    "UklGRioAAABXRUJQVlA4IB4AAABwAQCdASoCAAIAAUAmJZwCdAFAAAD+/GOYZxcAAAA=",
  "application/pdf":
    "JVBERi0xLjQKJSBjcmVhdGVkIGJ5IFBpbGxvdyBQREYgZHJpdmVyCjQgMCBvYmo8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgNSAwIFIKPj5lbmRvYmoKNSAwIG9iajw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDIgMCBSIF0KPj5lbmRvYmoKMSAwIG9iajw8Ci9UeXBlIC9YT2JqZWN0Ci9TdWJ0eXBlIC9JbWFnZQovV2lkdGggMgovSGVpZ2h0IDIKL0ZpbHRlciAvRENURGVjb2RlCi9CaXRzUGVyQ29tcG9uZW50IDgKL0NvbG9yU3BhY2UgL0RldmljZVJHQgovTGVuZ3RoIDYzMQo+PnN0cmVhbQr/2P/gABBKRklGAAEBAAABAAEAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAAIAAgMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APdKKKKsk//ZCmVuZHN0cmVhbQplbmRvYmoKMiAwIG9iajw8Ci9SZXNvdXJjZXMgPDwKL1Byb2NTZXQgWyAvUERGIC9JbWFnZUMgXQovWE9iamVjdCA8PAovaW1hZ2UgMSAwIFIKPj4KPj4KL01lZGlhQm94IFsgMCAwIDIuMCAyLjAgXQovQ29udGVudHMgMyAwIFIKL1R5cGUgL1BhZ2UKL1BhcmVudCA1IDAgUgo+PmVuZG9iagozIDAgb2JqPDwKL0xlbmd0aCA0Mwo+PnN0cmVhbQpxIDIuMDAwMDAwIDAgMCAyLjAwMDAwMCAwIDAgY20gL2ltYWdlIERvIFEKCmVuZHN0cmVhbQplbmRvYmoKNiAwIG9iajw8Ci9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA5MTEwNDQ5NDJaKQovTW9kRGF0ZSAoRDoyMDI2MDkxMTA0NDk0MlopCj4+ZW5kb2JqCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzYgZiAKMDAwMDAwMDE0NCAwMDAwMCBuIAowMDAwMDAwOTM2IDAwMDAwIG4gCjAwMDAwMDEwOTQgMDAwMDAgbiAKMDAwMDAwMDA0MCAwMDAwMCBuIAowMDAwMDAwMDg3IDAwMDAwIG4gCjAwMDAwMDExODUgMDAwMDAgbiAKdHJhaWxlcgo8PAovUm9vdCA0IDAgUgovU2l6ZSA3Ci9JbmZvIDYgMCBSCj4+CnN0YXJ0eHJlZgoxMjY3CiUlRU9G",
};
const receiptBytes = (type: keyof typeof receiptFiles) =>
  Uint8Array.from(atob(receiptFiles[type]), (character) =>
    character.charCodeAt(0),
  ).buffer;

async function fixture() {
  const t = convexTest(schema, modules);
  const seed = await t.run(async (ctx) => {
    async function owner(email: string) {
      const userId = await ctx.db.insert("users", { email });
      const accountId = await ctx.db.insert("accounts", {
        userId,
        name: "Fictional checking",
        institution: "Sample Bank",
        mask: "0001",
        kind: "cash",
        subtype: "checking",
        balanceCents: 100000,
        currency: "USD",
        hidden: false,
        excludeNetWorth: false,
        closed: false,
        manual: true,
        updatedAt: 0,
      });
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
        emoji: "G",
        order: 0,
        enabled: true,
      });
      const otherCategoryId = await ctx.db.insert("categories", {
        userId,
        groupId,
        name: "Shopping",
        emoji: "S",
        order: 1,
        enabled: true,
      });
      const merchantId = await ctx.db.insert("merchants", {
        userId,
        name: "Sample Market",
        normalizedName: "sample market",
        color: "#123456",
        transactionCount: 0,
      });
      const otherMerchantId = await ctx.db.insert("merchants", {
        userId,
        name: "Sample Corner Store",
        normalizedName: "sample corner store",
        color: "#123456",
        transactionCount: 0,
      });
      const tagId = await ctx.db.insert("tags", {
        userId,
        name: "Sample tag",
        color: "#123456",
        order: 0,
      });
      const fields: TransactionFields = {
        accountId,
        merchantId,
        categoryId,
        amountCents: 1001,
        date: "2026-09-10",
        originalName: "SAMPLE MARKET 001",
        notes: "",
        tagIds: [],
        reviewed: false,
        hidden: false,
        pending: false,
        splits: [],
      };
      return {
        userId,
        accountId,
        groupId,
        categoryId,
        otherCategoryId,
        merchantId,
        otherMerchantId,
        tagId,
        fields,
      };
    }
    return {
      alice: await owner("alice@example.test"),
      bob: await owner("bob@example.test"),
    };
  });
  return {
    t,
    ...seed,
    asAlice: t.withIdentity({ subject: seed.alice.userId }),
    asBob: t.withIdentity({ subject: seed.bob.userId }),
  };
}
const ruleFields = (actions: Doc<"rules">["actions"], order = 0) => ({
  name: "Sample rule",
  match: "all" as const,
  conditions: [
    {
      field: "statement" as const,
      operator: "contains" as const,
      value: "SAMPLE",
    },
  ],
  actions,
  enabled: true,
  order,
});

describe("authenticated transaction boundaries", () => {
  test("rejects anonymous reads and writes; list isolates users", async () => {
    const { t, alice, bob, asAlice, asBob } = await fixture();
    await expect(
      t.query(api.transactions.list, { paginationOpts }),
    ).rejects.toThrow("sign in");
    await expect(
      t.mutation(api.transactions.create, alice.fields),
    ).rejects.toThrow("sign in");
    const aliceId = await asAlice.mutation(
      api.transactions.create,
      alice.fields,
    );
    await asBob.mutation(api.transactions.create, bob.fields);
    expect(
      (await asAlice.query(api.transactions.list, { paginationOpts })).page.map(
        (tx) => tx._id,
      ),
    ).toEqual([aliceId]);
  });

  test("blocks foreign direct IDs and rolls mixed-owner bulk edits back", async () => {
    const { t, alice, bob, asAlice, asBob } = await fixture();
    const aliceId = await asAlice.mutation(
      api.transactions.create,
      alice.fields,
    );
    const bobId = await asBob.mutation(api.transactions.create, bob.fields);
    await expect(
      asAlice.query(api.transactions.detail, { id: bobId }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.mutation(api.transactions.update, {
        id: bobId,
        patch: { notes: "forbidden" },
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.mutation(api.transactions.remove, { id: bobId }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.mutation(api.transactions.bulkUpdate, {
        ids: [aliceId, bobId],
        patch: { notes: "must roll back" },
      }),
    ).rejects.toThrow("unavailable");
    expect(await t.run((ctx) => ctx.db.get(aliceId))).toMatchObject({
      notes: "",
      editedFields: [],
    });
    expect(await t.run((ctx) => ctx.db.query("activity").collect())).toEqual(
      [],
    );
  });

  test("rejects foreign relationship IDs including tags and split categories", async () => {
    const { alice, bob, asAlice } = await fixture();
    const patches: Partial<TransactionFields>[] = [
      { accountId: bob.accountId },
      { merchantId: bob.merchantId },
      { categoryId: bob.categoryId },
      { tagIds: [bob.tagId] },
      {
        splits: [
          { categoryId: alice.categoryId, amountCents: 500 },
          { categoryId: bob.categoryId, amountCents: 501 },
        ],
      },
    ];
    for (const patch of patches)
      await expect(
        asAlice.mutation(api.transactions.create, {
          ...alice.fields,
          ...patch,
        }),
      ).rejects.toThrow("unavailable");
    await expect(
      asAlice.query(api.transactions.list, {
        paginationOpts,
        accountId: bob.accountId,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.query(api.transactions.list, {
        paginationOpts,
        merchantId: bob.merchantId,
      }),
    ).rejects.toThrow("unavailable");
  });

  test("rejects malformed dates, fractional cents, and split discrepancies", async () => {
    const { alice, asAlice } = await fixture();
    for (const patch of [
      { date: "2025-02-29" },
      { amountCents: 10.5 },
      { amountCents: Number.NaN },
      {
        splits: [
          { categoryId: alice.categoryId, amountCents: 500 },
          { categoryId: alice.categoryId, amountCents: 500 },
        ],
      },
    ]) {
      await expect(
        asAlice.mutation(api.transactions.create, {
          ...alice.fields,
          ...patch,
        }),
      ).rejects.toThrow();
    }
    expect(
      (await asAlice.query(api.transactions.list, { paginationOpts })).page,
    ).toEqual([]);
  });

  test("retries CSV rows idempotently without crossing user boundaries", async () => {
    const { t, alice, bob, asAlice, asBob } = await fixture();
    const batch = {
      batchId: "sample-import",
      rows: [{ ...alice.fields, key: "row-1" }],
    };
    expect(await asAlice.mutation(api.transactions.importCsv, batch)).toEqual({
      inserted: 1,
      skipped: 0,
    });
    expect(await asAlice.mutation(api.transactions.importCsv, batch)).toEqual({
      inserted: 0,
      skipped: 1,
    });
    expect(
      await asBob.mutation(api.transactions.importCsv, {
        ...batch,
        rows: [{ ...bob.fields, key: "row-1" }],
      }),
    ).toEqual({ inserted: 1, skipped: 0 });
    expect(await t.run((ctx) => ctx.db.get(alice.merchantId))).toMatchObject({
      transactionCount: 1,
    });
  });

  test("bank transactions retain provider-managed amounts and dates", async () => {
    const { t, alice, asAlice } = await fixture();
    const id = await asAlice.mutation(api.transactions.create, alice.fields);
    await t.run((ctx) =>
      ctx.db.patch(id, {
        source: "plaid",
        plaidTransactionId: "sample-provider-id",
      }),
    );
    await expect(
      asAlice.mutation(api.transactions.update, {
        id,
        patch: { amountCents: 900 },
      }),
    ).rejects.toThrow("managed");
    await expect(
      asAlice.mutation(api.transactions.remove, { id }),
    ).rejects.toThrow("Hide");
    await asAlice.mutation(api.transactions.update, {
      id,
      patch: { notes: "Keep this annotation", reviewed: true },
    });
    expect(
      (await asAlice.query(api.transactions.detail, { id })).transaction,
    ).toMatchObject({
      amountCents: 1001,
      notes: "Keep this annotation",
      reviewed: true,
      editedFields: ["notes", "reviewed"],
    });
  });

  test("receipt actions validate ownership, allowed types, and limits before storing", async () => {
    const { t, alice, bob, asAlice, asBob } = await fixture();
    const id = await asAlice.mutation(api.transactions.create, alice.fields);
    const foreignId = await asBob.mutation(api.transactions.create, bob.fields);
    const bytes = receiptBytes("application/pdf");
    await expect(
      asAlice.action(api.transactions.uploadAttachment, {
        transactionId: foreignId,
        name: "receipt.pdf",
        contentType: "application/pdf",
        bytes,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.action(api.transactions.uploadAttachment, {
        transactionId: id,
        name: "receipt.html",
        contentType: "text/html",
        bytes,
      }),
    ).rejects.toThrow("JPEG");
    await expect(
      asAlice.action(api.transactions.uploadAttachment, {
        transactionId: id,
        name: "receipt.pdf",
        contentType: "application/pdf",
        bytes: new ArrayBuffer(0),
      }),
    ).rejects.toThrow("5 MB");
    await expect(
      asAlice.action(api.transactions.uploadAttachment, {
        transactionId: id,
        name: "receipt.pdf",
        contentType: "application/pdf",
        bytes: new ArrayBuffer(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow("5 MB");
    const attachmentId = await asAlice.action(
      api.transactions.uploadAttachment,
      {
        transactionId: id,
        name: "receipt.pdf",
        contentType: "application/pdf",
        bytes,
      },
    );
    await expect(
      asBob.mutation(api.transactions.deleteAttachment, { id: attachmentId }),
    ).rejects.toThrow("unavailable");
    expect(
      (await asAlice.query(api.transactions.detail, { id })).attachments,
    ).toHaveLength(1);
    await asAlice.mutation(api.transactions.deleteAttachment, {
      id: attachmentId,
    });
    expect(await t.run((ctx) => ctx.db.query("attachments").collect())).toEqual(
      [],
    );
  });

  test("receipt uploads accept each supported format and reject mismatched or active-content files before storage", async () => {
    const { t, alice, asAlice } = await fixture();
    const transactionId = await asAlice.mutation(
      api.transactions.create,
      alice.fields,
    );
    for (const contentType of Object.keys(
      receiptFiles,
    ) as (keyof typeof receiptFiles)[]) {
      await asAlice.action(api.transactions.uploadAttachment, {
        transactionId,
        name: "Fictional receipt",
        contentType,
        bytes: receiptBytes(contentType),
      });
      await expect(
        asAlice.action(api.transactions.uploadAttachment, {
          transactionId,
          name: "Mislabeled receipt",
          contentType,
          bytes: new TextEncoder().encode(
            "<html><script>alert(1)</script></html>",
          ).buffer,
        }),
      ).rejects.toThrow("JPEG");
    }
    await expect(
      asAlice.action(api.transactions.uploadAttachment, {
        transactionId,
        name: "Mismatched receipt.png",
        contentType: "image/png",
        bytes: receiptBytes("application/pdf"),
      }),
    ).rejects.toThrow("JPEG");
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(4);
    expect(
      (await asAlice.query(api.transactions.detail, { id: transactionId }))
        .transaction.attachmentCount,
    ).toBe(4);
  });

  test("receipt-limit rejection cleans up the new blob and transaction deletion removes the retained receipts", async () => {
    const { t, alice, asAlice } = await fixture();
    const transactionId = await asAlice.mutation(
      api.transactions.create,
      alice.fields,
    );
    const upload = {
      transactionId,
      name: "Fictional receipt.pdf",
      contentType: "application/pdf",
      bytes: receiptBytes("application/pdf"),
    };
    for (let index = 0; index < 20; index++)
      await asAlice.action(api.transactions.uploadAttachment, upload);
    const before = await asAlice.query(api.transactions.detail, {
      id: transactionId,
    });
    expect(before.transaction.attachmentCount).toBe(20);
    expect(before.attachments).toHaveLength(20);

    await expect(
      asAlice.action(api.transactions.uploadAttachment, upload),
    ).rejects.toThrow("up to 20 receipts");
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(20);
    expect(
      (await asAlice.query(api.transactions.detail, { id: transactionId }))
        .transaction.attachmentCount,
    ).toBe(20);

    await asAlice.mutation(api.transactions.remove, { id: transactionId });
    expect(await t.run((ctx) => ctx.db.query("attachments").collect())).toEqual(
      [],
    );
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toEqual([]);
  });
});

describe("saved report filters", () => {
  const fields = {
    name: "Filtered report",
    report: "spending",
    groupBy: "category",
    chart: "bar",
    from: "2026-01-01",
    to: "2026-12-31",
  };
  test("rejects foreign filter references on create and update, and rejects edits to another user's report", async () => {
    const { t, alice, bob, asAlice, asBob } = await fixture();
    const filters = {
      accountId: alice.accountId,
      categoryId: alice.categoryId,
      merchantId: alice.merchantId,
      tagId: alice.tagId,
    };
    const id = await asAlice.mutation(api.workspace.saveReport, {
      ...fields,
      ...filters,
    });
    for (const foreign of [
      { accountId: bob.accountId },
      { categoryId: bob.categoryId },
      { merchantId: bob.merchantId },
      { tagId: bob.tagId },
    ]) {
      await expect(
        asAlice.mutation(api.workspace.saveReport, { ...fields, ...foreign }),
      ).rejects.toThrow("unavailable");
      await expect(
        asAlice.mutation(api.workspace.saveReport, {
          id,
          ...fields,
          ...filters,
          ...foreign,
        }),
      ).rejects.toThrow("unavailable");
    }
    await expect(
      asBob.mutation(api.workspace.saveReport, { id, ...fields }),
    ).rejects.toThrow("unavailable");
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      ...fields,
      ...filters,
      userId: alice.userId,
    });
    expect(
      await t.run((ctx) => ctx.db.query("savedReports").collect()),
    ).toHaveLength(1);
  });
  test("omitting saved filter IDs clears every old filter when updating a report", async () => {
    const { t, alice, asAlice } = await fixture();
    const id = await asAlice.mutation(api.workspace.saveReport, {
      ...fields,
      accountId: alice.accountId,
      categoryId: alice.categoryId,
      merchantId: alice.merchantId,
      tagId: alice.tagId,
    });
    const updatedId = await asAlice.mutation(api.workspace.saveReport, {
      id,
      ...fields,
      name: "All activity",
    });
    expect(updatedId).toBe(id);
    const saved = await t.run((ctx) => ctx.db.get(id));
    expect(saved).toMatchObject({
      ...fields,
      name: "All activity",
      userId: alice.userId,
    });
    expect(saved?.accountId).toBeUndefined();
    expect(saved?.categoryId).toBeUndefined();
    expect(saved?.merchantId).toBeUndefined();
    expect(saved?.tagId).toBeUndefined();
  });

  test("merchant merge keeps saved reports usable and retains every other filter", async () => {
    const { t, alice, bob, asAlice, asBob } = await fixture();
    const transactionId = await asAlice.mutation(api.transactions.create, {
      ...alice.fields,
      tagIds: [alice.tagId],
    });
    const reportId = await asAlice.mutation(api.workspace.saveReport, {
      ...fields,
      chart: "donut",
      stacked: true,
      accountId: alice.accountId,
      categoryId: alice.categoryId,
      merchantId: alice.merchantId,
      tagId: alice.tagId,
    });
    const unrelatedId = await asAlice.mutation(api.workspace.saveReport, {
      ...fields,
      name: "Another merchant",
      merchantId: alice.otherMerchantId,
    });
    const otherOwnerId = await asBob.mutation(api.workspace.saveReport, {
      ...fields,
      merchantId: bob.merchantId,
    });
    const before = await t.run(async (ctx) => ({
      report: await ctx.db.get(reportId),
      unrelated: await ctx.db.get(unrelatedId),
      otherOwner: await ctx.db.get(otherOwnerId),
    }));
    await asAlice.mutation(api.settings.mergeMerchants, {
      sourceId: alice.merchantId,
      targetId: alice.otherMerchantId,
    });
    const saved = await t.run((ctx) => ctx.db.get(reportId));
    expect(saved).toEqual({
      ...before.report,
      merchantId: alice.otherMerchantId,
    });
    expect(await t.run((ctx) => ctx.db.get(unrelatedId))).toEqual(
      before.unrelated,
    );
    expect(await t.run((ctx) => ctx.db.get(otherOwnerId))).toEqual(
      before.otherOwner,
    );
    const result = await asAlice.query(api.transactions.list, {
      paginationOpts,
      merchantId: saved!.merchantId,
      accountId: saved!.accountId,
      from: saved!.from,
      to: saved!.to,
    });
    expect(result.page.map((transaction) => transaction._id)).toEqual([
      transactionId,
    ]);
  });
});

describe("rules and settings", () => {
  test("applies enabled rules in ascending order, including later predicates", async () => {
    const { alice, asAlice } = await fixture();
    await asAlice.mutation(
      api.settings.saveRule,
      ruleFields({ categoryId: alice.otherCategoryId }, 10),
    );
    await asAlice.mutation(api.settings.saveRule, {
      ...ruleFields({ merchantId: alice.otherMerchantId }, 20),
      conditions: [
        { field: "category", operator: "equals", value: alice.otherCategoryId },
      ],
    });
    await asAlice.mutation(api.settings.saveRule, {
      ...ruleFields({ hidden: true }, 30),
      enabled: false,
    });
    const id = await asAlice.mutation(api.transactions.create, alice.fields);
    expect(
      (await asAlice.query(api.transactions.detail, { id })).transaction,
    ).toMatchObject({
      categoryId: alice.otherCategoryId,
      merchantId: alice.otherMerchantId,
      hidden: false,
    });
  });

  test("preview selects the same rows that explicit rule application updates", async () => {
    const { alice, asAlice } = await fixture();
    const matchId = await asAlice.mutation(
      api.transactions.create,
      alice.fields,
    );
    const otherId = await asAlice.mutation(api.transactions.create, {
      ...alice.fields,
      originalName: "UNRELATED",
    });
    const fields = ruleFields({ reviewed: true, tagIds: [alice.tagId] });
    const id = await asAlice.mutation(api.settings.saveRule, fields);
    const preview = await asAlice.query(api.settings.previewRule, {
      ...fields,
      paginationOpts,
    });
    expect(preview.page.map((tx) => tx._id)).toEqual([matchId]);
    expect(
      await asAlice.mutation(api.settings.applyRule, { id, paginationOpts }),
    ).toMatchObject({ updated: 1, isDone: true });
    expect(
      (await asAlice.query(api.transactions.detail, { id: matchId }))
        .transaction,
    ).toMatchObject({ reviewed: true, tagIds: [alice.tagId] });
    expect(
      (await asAlice.query(api.transactions.detail, { id: otherId }))
        .transaction.reviewed,
    ).toBe(false);
  });

  test("rejects foreign rule conditions/actions and settings relationships", async () => {
    const { alice, bob, asAlice, asBob } = await fixture();
    for (const actions of [
      { merchantId: bob.merchantId },
      { categoryId: bob.categoryId },
      { tagIds: [bob.tagId] },
      { splits: [{ categoryId: bob.categoryId, amountCents: 1001 }] },
    ]) {
      await expect(
        asAlice.mutation(api.settings.saveRule, ruleFields(actions)),
      ).rejects.toThrow("unavailable");
    }
    for (const field of ["account", "category"] as const) {
      const value = field === "account" ? bob.accountId : bob.categoryId;
      await expect(
        asAlice.mutation(api.settings.saveRule, {
          ...ruleFields({ reviewed: true }),
          conditions: [{ field, operator: "equals", value }],
        }),
      ).rejects.toThrow("unavailable");
    }
    const foreignRule = await asBob.mutation(
      api.settings.saveRule,
      ruleFields({ reviewed: true }),
    );
    await expect(
      asAlice.mutation(api.settings.applyRule, {
        id: foreignRule,
        paginationOpts,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.mutation(api.settings.saveCategory, {
        groupId: bob.groupId,
        name: "No",
        emoji: "X",
        order: 0,
        enabled: true,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.mutation(api.settings.mergeMerchants, {
        sourceId: alice.merchantId,
        targetId: bob.merchantId,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      asAlice.mutation(api.settings.reorder, {
        ids: [alice.categoryId, bob.categoryId],
      }),
    ).rejects.toThrow("unavailable");
  });

  test("merchant merge retains annotations, counts, recurring schedules, and rule actions", async () => {
    const { t, alice, asAlice } = await fixture();
    const sourceTx = await asAlice.mutation(api.transactions.create, {
      ...alice.fields,
      notes: "Keep me",
      tagIds: [alice.tagId],
    });
    await asAlice.mutation(api.transactions.create, {
      ...alice.fields,
      merchantId: alice.otherMerchantId,
    });
    const ruleId = await asAlice.mutation(
      api.settings.saveRule,
      ruleFields({ merchantId: alice.merchantId }),
    );
    const recurringId = await t.run((ctx) =>
      ctx.db.insert("recurring", {
        userId: alice.userId,
        merchantId: alice.merchantId,
        accountId: alice.accountId,
        categoryId: alice.categoryId,
        amountCents: 1001,
        frequency: "monthly",
        nextDate: "2026-09-30",
        active: true,
        source: "manual",
        note: "Keep schedule",
      }),
    );
    expect(
      await asAlice.mutation(api.settings.mergeMerchants, {
        sourceId: alice.merchantId,
        targetId: alice.otherMerchantId,
      }),
    ).toMatchObject({ done: true, updated: 1 });
    const state = await t.run(async (ctx) => ({
      source: await ctx.db.get(alice.merchantId),
      target: await ctx.db.get(alice.otherMerchantId),
      transaction: await ctx.db.get(sourceTx),
      rule: await ctx.db.get(ruleId),
      recurring: await ctx.db.get(recurringId),
    }));
    expect(state.source).toBeNull();
    expect(state.target).toMatchObject({ transactionCount: 2 });
    expect(state.transaction).toMatchObject({
      merchantId: alice.otherMerchantId,
      notes: "Keep me",
      tagIds: [alice.tagId],
      editedFields: ["merchantId"],
    });
    expect(state.transaction?.searchText).toContain("sample corner store");
    expect(state.rule?.actions.merchantId).toBe(alice.otherMerchantId);
    expect(state.recurring?.merchantId).toBe(alice.otherMerchantId);
  });
});
