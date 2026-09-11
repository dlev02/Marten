/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  defaultReminderPreferences,
  dueReminders,
  localReminderTime,
  validReminderTiming,
} from "./lib/reminders";
import { reminderEmailContent } from "./lib/reminderEmail";

const modules = import.meta.glob("./**/*.ts");
let now: number;
let mail: {
  to: { email: string }[];
  textContent: string;
  htmlContent: string;
  headers: { idempotencyKey: string };
}[];
let failDelivery = false;
beforeEach(() => {
  now = Date.parse("2026-09-11T14:10:00Z"); // 09:10 in Chicago, still September 10 in Hawaii at earlier UTC boundaries.
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubEnv("AUTH_BREVO_KEY", "fictional-provider-key");
  vi.stubEnv("AUTH_EMAIL_FROM", "marten@example.test");
  vi.stubEnv("SITE_URL", "https://marten.example.test");
  mail = [];
  failDelivery = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input) !== "https://api.brevo.com/v3/smtp/email" ||
        init?.method !== "POST"
      )
        throw new Error("No real network calls are allowed in reminder tests.");
      if (failDelivery) throw new Error("fictional-private-provider-error");
      mail.push(JSON.parse(String(init.body)) as (typeof mail)[number]);
      return new Response(JSON.stringify({ messageId: "mocked-acceptance" }), {
        status: 201,
      });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture(demo = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "reminder-alice@example.test",
    });
    const otherId = await ctx.db.insert("users", {
      email: "reminder-bob@example.test",
    });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Sample Alice",
      demo,
      reviewNew: true,
      allowPending: false,
      widgets: [],
    });
    const accountId = await ctx.db.insert("accounts", {
      userId,
      name: "Fictional credit card",
      institution: "Sample Bank",
      mask: "0000",
      kind: "credit",
      subtype: "credit card",
      balanceCents: 12345,
      currency: "USD",
      hidden: false,
      excludeNetWorth: false,
      closed: false,
      manual: true,
      updatedAt: now,
      statementReminder: {
        dueDate: "2026-09-13",
        statementCents: 12345,
        updatedAt: now,
      },
    });
    const groupId = await ctx.db.insert("groups", {
      userId,
      name: "Expenses",
      kind: "expense",
      order: 0,
    });
    const categoryId = await ctx.db.insert("categories", {
      userId,
      groupId,
      name: "Subscriptions",
      emoji: "",
      order: 0,
      enabled: true,
    });
    const merchantId = await ctx.db.insert("merchants", {
      userId,
      name: "Fictional Merchant",
      normalizedName: "fictional merchant",
      transactionCount: 0,
      color: "#356587",
    });
    const recurringId = await ctx.db.insert("recurring", {
      userId,
      accountId,
      merchantId,
      categoryId,
      name: "Fictional subscription",
      amountCents: 1607,
      frequency: "monthly",
      nextDate: "2026-09-14",
      active: true,
      source: "manual",
      note: "",
    });
    return { userId, otherId, profileId, accountId, recurringId };
  });
  return {
    t,
    ...ids,
    alice: t.withIdentity({ subject: ids.userId }),
    bob: t.withIdentity({ subject: ids.otherId }),
  };
}
const uuid = (suffix = "1") =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
async function verify(f: Awaited<ReturnType<typeof fixture>>) {
  await f.alice.action(api.reminderDelivery.requestVerification, {});
  const code =
    mail[mail.length - 1].textContent.match(/code is (\d{8})\./)?.[1];
  if (!code) throw new Error("Expected a mocked verification code.");
  await f.alice.action(api.reminderDelivery.verifyEmail, { code });
  return code;
}

describe("reminder consent and ownership", () => {
  test("email starts off, requires a verified sign-in address, and signed-out access fails", async () => {
    const f = await fixture();
    expect(await f.alice.query(api.reminders.settings, {})).toMatchObject({
      emailEnabled: false,
      emailVerified: false,
      eligible: true,
    });
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toHaveLength(0);
    await expect(
      f.alice.mutation(api.reminders.saveSettings, {
        ...defaultReminderPreferences,
        emailEnabled: true,
      }),
    ).rejects.toThrow("Verify");
    await expect(f.t.query(api.reminders.settings, {})).rejects.toThrow(
      "sign in",
    );
    await verify(f);
    expect(mail[0].to).toEqual([{ email: "reminder-alice@example.test" }]);
    expect(await f.alice.query(api.reminders.settings, {})).toMatchObject({
      emailEnabled: true,
      emailVerified: true,
    });
    expect(await f.bob.query(api.reminders.settings, {})).toMatchObject({
      emailEnabled: false,
      emailVerified: false,
    });
    await f.alice.mutation(api.reminders.saveSettings, {
      ...defaultReminderPreferences,
      emailEnabled: false,
    });
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toHaveLength(1);
  });
  test("demo has no browser claims, email verification, or delivery even with stale enabled preferences", async () => {
    const f = await fixture(true);
    await f.t.run((ctx) =>
      ctx.db.insert("reminderPreferences", {
        userId: f.userId,
        ...defaultReminderPreferences,
        emailEnabled: true,
        verifiedEmail: "reminder-alice@example.test",
        updatedAt: now,
      }),
    );
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }),
    ).toBeNull();
    await expect(
      f.alice.action(api.reminderDelivery.requestVerification, {}),
    ).rejects.toThrow("own workspace");
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toEqual([]);
  });
  test("verification codes expire, cannot cross accounts or replay, and failed attempts persist", async () => {
    const f = await fixture();
    await f.alice.action(api.reminderDelivery.requestVerification, {});
    const code = mail[0].textContent.match(/code is (\d{8})\./)![1];
    await expect(
      f.bob.action(api.reminderDelivery.verifyEmail, { code }),
    ).rejects.toThrow("incorrect or expired");
    await expect(
      f.alice.action(api.reminderDelivery.requestVerification, {}),
    ).rejects.toThrow("wait a minute");
    const wrong = code === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < 5; i++)
      await expect(
        f.alice.action(api.reminderDelivery.verifyEmail, { code: wrong }),
      ).rejects.toThrow();
    await expect(
      f.alice.action(api.reminderDelivery.verifyEmail, { code }),
    ).rejects.toThrow();
    expect(
      (
        await f.t.run((ctx) =>
          ctx.db.query("reminderEmailVerifications").first(),
        )
      )?.attempts,
    ).toBe(5);
    now += 60_001;
    await f.alice.action(api.reminderDelivery.requestVerification, {});
    const expired = mail[1].textContent.match(/code is (\d{8})\./)![1];
    now += 15 * 60_000 + 1;
    await expect(
      f.alice.action(api.reminderDelivery.verifyEmail, { code: expired }),
    ).rejects.toThrow();
    const newCode = await verify(f);
    await expect(
      f.alice.action(api.reminderDelivery.verifyEmail, { code: newCode }),
    ).rejects.toThrow();
  });
  test("changing the authenticated email invalidates previously verified delivery consent", async () => {
    const f = await fixture();
    await verify(f);
    await f.t.run((ctx) =>
      ctx.db.patch(f.userId, { email: "changed@example.test" }),
    );
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toHaveLength(1);
    expect(
      (await f.alice.query(api.reminders.settings, {})).emailVerified,
    ).toBe(false);
  });
});

describe("current-state delivery and duplicate prevention", () => {
  test("an occurrence is claimed once across tabs; another owner cannot acknowledge it", async () => {
    const f = await fixture();
    const batch = await f.alice.mutation(api.reminders.claimBrowser, {
      batchId: uuid(),
    });
    expect(batch).toMatchObject({ count: 2, firstDue: "2026-09-13" });
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, {
        batchId: uuid("2"),
      }),
    ).toBeNull();
    await f.bob.mutation(api.reminders.finishBrowser, {
      ids: batch!.ids,
      batchId: batch!.batchId,
      status: "sent",
    });
    expect((await f.t.run((ctx) => ctx.db.get(batch!.ids[0])))?.status).toBe(
      "claimed",
    );
    await f.alice.mutation(api.reminders.finishBrowser, {
      ids: batch!.ids,
      batchId: batch!.batchId,
      status: "sent",
    });
    expect((await f.t.run((ctx) => ctx.db.get(batch!.ids[0])))?.status).toBe(
      "sent",
    );
  });
  test("paid schedules, paid statements, paused schedules and closed accounts are excluded", async () => {
    const f = await fixture();
    await f.alice.mutation(api.recurring.setPaid, {
      recurringId: f.recurringId,
      date: "2026-09-14",
      paid: true,
    });
    await f.alice.mutation(api.recurring.setStatementPaid, {
      accountId: f.accountId,
      dueDate: "2026-09-13",
      paid: true,
    });
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }),
    ).toBeNull();
    await f.alice.mutation(api.recurring.setPaid, {
      recurringId: f.recurringId,
      date: "2026-09-14",
      paid: false,
    });
    await f.t.run((ctx) => ctx.db.patch(f.recurringId, { active: false }));
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }),
    ).toBeNull();
    await f.t.run((ctx) => ctx.db.patch(f.recurringId, { active: true }));
    await f.t.run((ctx) => ctx.db.patch(f.accountId, { closed: true }));
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }),
    ).toBeNull();
  });
  test("edits before delivery use the new due date; editing amounts or toggling paid does not resend a sent occurrence", async () => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.recurringId, { nextDate: "2026-10-14" }),
    );
    await f.alice.mutation(api.recurring.clearStatementReminder, {
      accountId: f.accountId,
    });
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }),
    ).toBeNull();
    await f.t.run((ctx) =>
      ctx.db.patch(f.recurringId, { nextDate: "2026-09-14" }),
    );
    const first = await f.alice.mutation(api.reminders.claimBrowser, {
      batchId: uuid(),
    });
    expect(first?.count).toBe(1);
    await f.t.run((ctx) => ctx.db.patch(f.recurringId, { amountCents: 9999 }));
    await f.alice.mutation(api.recurring.setPaid, {
      recurringId: f.recurringId,
      date: "2026-09-14",
      paid: true,
    });
    await f.alice.mutation(api.recurring.setPaid, {
      recurringId: f.recurringId,
      date: "2026-09-14",
      paid: false,
    });
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, {
        batchId: uuid("2"),
      }),
    ).toBeNull();
    await f.t.run((ctx) =>
      ctx.db.patch(f.recurringId, { nextDate: "2026-09-12" }),
    );
    expect(
      (
        await f.alice.mutation(api.reminders.claimBrowser, {
          batchId: uuid("3"),
        })
      )?.count,
    ).toBe(1);
  });
  test("email uses the current state and one digest, and an ambiguous failure is not resent", async () => {
    const f = await fixture();
    await verify(f);
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toHaveLength(2);
    expect(mail[1].textContent).toContain("2 upcoming payment reminders");
    expect(mail[1].textContent).not.toMatch(/Fictional|12345|1607|16\.07/);
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toHaveLength(2);
    await f.t.run((ctx) =>
      ctx.db.patch(f.recurringId, { nextDate: "2026-09-12" }),
    );
    failDelivery = true;
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    failDelivery = false;
    await f.t.action(internal.reminderDelivery.sendDue, { userId: f.userId });
    expect(mail).toHaveLength(2);
    expect(
      (await f.alice.query(api.reminders.settings, {})).lastEmailStatus,
    ).toBe("failed");
  });
  test("statement checkmarks are owned, date-specific, and do not change financial balances", async () => {
    const f = await fixture();
    await expect(
      f.bob.mutation(api.recurring.setStatementPaid, {
        accountId: f.accountId,
        dueDate: "2026-09-13",
        paid: true,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.alice.mutation(api.recurring.setStatementPaid, {
        accountId: f.accountId,
        dueDate: "2026-10-13",
        paid: true,
      }),
    ).rejects.toThrow("current statement");
    await f.alice.mutation(api.recurring.setStatementPaid, {
      accountId: f.accountId,
      dueDate: "2026-09-13",
      paid: true,
    });
    expect(await f.t.run((ctx) => ctx.db.get(f.accountId))).toMatchObject({
      balanceCents: 12345,
      statementPaidDate: "2026-09-13",
    });
    await f.alice.mutation(api.recurring.saveStatementReminder, {
      accountId: f.accountId,
      dueDate: "2026-09-14",
      statementCents: 5000,
    });
    expect(
      (await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }))
        ?.count,
    ).toBe(2);
  });
});

describe("local calendar boundaries", () => {
  test("reminders respect the chosen local clock and never send for past due dates", async () => {
    const f = await fixture();
    now = Date.parse("2026-09-11T13:59:00Z");
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }),
    ).toBeNull();
    now = Date.parse("2026-09-11T14:00:00Z");
    expect(
      (await f.alice.mutation(api.reminders.claimBrowser, { batchId: uuid() }))
        ?.count,
    ).toBe(2);
    now = Date.parse("2026-09-15T14:10:00Z");
    expect(
      await f.alice.mutation(api.reminders.claimBrowser, {
        batchId: uuid("2"),
      }),
    ).toBeNull();
  });
  test("IANA zones handle spring/fall DST and UTC date boundaries without moving due dates", () => {
    expect(
      localReminderTime(Date.parse("2026-03-08T08:01:00Z"), "America/Chicago"),
    ).toEqual({ date: "2026-03-08", minutes: 181 });
    expect(
      localReminderTime(Date.parse("2026-11-01T06:30:00Z"), "America/Chicago"),
    ).toEqual(
      localReminderTime(Date.parse("2026-11-01T07:30:00Z"), "America/Chicago"),
    );
    expect(
      localReminderTime(
        Date.parse("2026-09-11T00:30:00Z"),
        "America/Los_Angeles",
      ),
    ).toEqual({ date: "2026-09-10", minutes: 1050 });
    for (const patch of [
      { timeZone: "Not/AZone" },
      { timeMinutes: -1 },
      { timeMinutes: 1440 },
      { daysBefore: 400 },
    ])
      expect(
        validReminderTiming({ ...defaultReminderPreferences, ...patch }),
      ).toBe(false);
  });
  test("unknown statement amounts can remind, while zero balances and income never do", () => {
    const account = {
      _id: "account",
      kind: "credit",
      closed: false,
      dueDate: "2026-09-13",
    } as Doc<"accounts">;
    const schedule = {
      _id: "schedule",
      accountId: account._id,
      active: true,
      amountCents: -1000,
      nextDate: "2026-09-13",
      frequency: "monthly",
    } as Doc<"recurring">;
    expect(
      dueReminders({
        accounts: [account],
        schedules: [schedule],
        paid: new Set(),
        timing: defaultReminderPreferences,
        now,
      }),
    ).toHaveLength(1);
    expect(
      dueReminders({
        accounts: [{ ...account, statementCents: 0 }],
        schedules: [schedule],
        paid: new Set(),
        timing: defaultReminderPreferences,
        now,
      }),
    ).toEqual([]);
  });
});

test("the email template includes a safe app link and leaves out financial details", () => {
  const content = reminderEmailContent(
    2,
    "2026-09-13",
    "https://marten.example.test/path?q=secret",
  );
  expect(content.htmlContent).toContain(
    'href="https://marten.example.test/recurring"',
  );
  expect(content.textContent).not.toContain("secret");
  expect(content.textContent).toContain("September 13, 2026");
  expect(
    reminderEmailContent(1, "2026-09-13", "javascript:alert(1)").htmlContent,
  ).not.toContain("href=");
});
