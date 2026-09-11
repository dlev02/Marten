import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  browserReminderEnabled,
  requestBrowserReminders,
  setBrowserReminderEnabled,
  showBrowserReminder,
} from "./browserReminders";

let permission: NotificationPermission;
let permissionResult: NotificationPermission;
let requestPermission: ReturnType<typeof vi.fn>;
let showNotification: ReturnType<typeof vi.fn>;
let registration: ServiceWorkerRegistration;
beforeEach(() => {
  permission = "default";
  permissionResult = "granted";
  requestPermission = vi.fn(() => {
    permission = permissionResult;
    return Promise.resolve(permission);
  });
  const NotificationStub = {
    get permission() {
      return permission;
    },
    requestPermission,
  };
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("Notification", NotificationStub);
  vi.stubGlobal("window", {
    isSecureContext: true,
    Notification: NotificationStub,
    dispatchEvent: vi.fn(),
    setTimeout,
    clearTimeout,
  });
  showNotification = vi.fn(() => Promise.resolve());
  registration = {
    active: {},
    showNotification,
  } as unknown as ServiceWorkerRegistration;
  vi.stubGlobal("navigator", {
    serviceWorker: { register: vi.fn(() => Promise.resolve(registration)) },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("browser reminders start off and their local preference is specific to the signed-in user", async () => {
  expect(browserReminderEnabled("alice")).toBe(false);
  await requestBrowserReminders("alice");
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(browserReminderEnabled("alice")).toBe(true);
  expect(browserReminderEnabled("bob")).toBe(false);
  setBrowserReminderEnabled("alice", false);
  expect(browserReminderEnabled("alice")).toBe(false);
});
test("denied or dismissed permission does not enable reminders or repeatedly prompt", async () => {
  permission = "denied";
  await expect(requestBrowserReminders("alice")).rejects.toThrow("blocked");
  expect(requestPermission).not.toHaveBeenCalled();
  permission = "default";
  permissionResult = "default";
  await expect(requestBrowserReminders("alice")).rejects.toThrow(
    "reminders are off",
  );
  expect(browserReminderEnabled("alice")).toBe(false);
  expect(showNotification).not.toHaveBeenCalled();
});
test("insecure contexts and revoked permissions cannot display native notices", async () => {
  window.isSecureContext = false;
  await expect(requestBrowserReminders("alice")).rejects.toThrow("cannot show");
  window.isSecureContext = true;
  permission = "denied";
  await expect(showBrowserReminder(2, "batch")).rejects.toThrow("permission");
  expect(showNotification).not.toHaveBeenCalled();
});
test("the service worker receives only generic reminder text and a duplicate tag", async () => {
  permission = "granted";
  expect(await showBrowserReminder(2, "fictional-batch")).toBe(true);
  expect(showNotification).toHaveBeenCalledExactlyOnceWith(
    "Marten payment reminder",
    {
      body: "You have 2 upcoming payment reminders. Open Marten to review them.",
      tag: "marten-reminders-fictional-batch",
      icon: "/marten-mark.png",
    },
  );
});
test("turning off reminders before display cancels the native notice", async () => {
  permission = "granted";
  expect(await showBrowserReminder(2, "fictional-batch", () => false)).toBe(
    false,
  );
  expect(showNotification).not.toHaveBeenCalled();
});
test("a failed browser display reports failure to the dispatcher", async () => {
  permission = "granted";
  showNotification.mockRejectedValue(new Error("OS notifications unavailable"));
  await expect(showBrowserReminder(1, "fictional-batch")).rejects.toThrow(
    "OS notifications unavailable",
  );
});
