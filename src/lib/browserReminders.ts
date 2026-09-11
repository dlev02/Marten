import { useSyncExternalStore } from "react";

const changed = "marten-reminder-preference";
const key = (userId: string) => `marten-browser-reminders:${userId}`;
export function browserNotificationsAvailable() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window
  );
}
export function browserReminderEnabled(userId: string) {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}
export function setBrowserReminderEnabled(userId: string, enabled: boolean) {
  localStorage.setItem(key(userId), enabled ? "1" : "0");
  window.dispatchEvent(new Event(changed));
}
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener("focus", listener);
  };
}
export function useBrowserReminderEnabled(userId: string) {
  return useSyncExternalStore(
    subscribe,
    () => browserReminderEnabled(userId),
    () => false,
  );
}

export async function requestBrowserReminders(userId: string) {
  if (!browserNotificationsAvailable())
    throw new Error(
      "This browser cannot show notifications here. Use a supported browser with HTTPS, or choose email reminders.",
    );
  if (Notification.permission === "denied")
    throw new Error(
      "Notifications are blocked. Allow them in this site’s browser settings, then try again.",
    );
  // Permission must be requested directly from the Enable button's user gesture.
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Browser reminders are off. You can enable them whenever you’re ready.",
    );
  setBrowserReminderEnabled(userId, true);
}

export async function showBrowserReminder(
  count: number,
  batchId: string,
  stillEnabled: () => boolean = () => true,
) {
  if (!browserNotificationsAvailable() || Notification.permission !== "granted")
    throw new Error("Browser notification permission is unavailable.");
  const options: NotificationOptions = {
    body:
      count === 1
        ? "You have an upcoming payment. Open Marten to review it."
        : `You have ${count} upcoming payment reminders. Open Marten to review them.`,
    tag: `marten-reminders-${batchId}`,
    icon: "/marten-mark.png",
  };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.register(
      "/reminders-worker.js",
    );
    if (!registration.active) {
      await new Promise<void>((resolve, reject) => {
        const worker = registration.installing ?? registration.waiting;
        if (!worker) {
          reject(new Error("Notification worker is unavailable."));
          return;
        }
        const timeout = window.setTimeout(
          () => reject(new Error("Notification setup timed out.")),
          10_000,
        );
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") {
            window.clearTimeout(timeout);
            resolve();
          }
          if (worker.state === "redundant") {
            window.clearTimeout(timeout);
            reject(new Error("Notification setup failed."));
          }
        });
      });
    }
    if (!stillEnabled()) return false;
    await registration.showNotification("Marten payment reminder", options);
    return true;
  }
  if (!stillEnabled()) return false;
  const notification = new Notification("Marten payment reminder", options);
  notification.onclick = () => {
    window.focus();
    window.location.assign("/recurring");
    notification.close();
  };
  await new Promise<void>((resolve, reject) => {
    notification.onshow = () => resolve();
    notification.onerror = () =>
      reject(new Error("The browser could not display a reminder."));
  });
  return true;
}
