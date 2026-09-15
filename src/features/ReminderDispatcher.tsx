import { useEffect } from "react";
import { useMutation } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useData } from "../lib/data";
import { isDemoSession } from "../lib/demo";
import {
  browserNotificationsAvailable,
  browserReminderEnabled,
  setBrowserReminderEnabled,
  showBrowserReminder,
  useBrowserReminderEnabled,
} from "../lib/browserReminders";

/** Mount once inside the signed-in DataProvider. The server owns due/paid checks. */
export function ReminderDispatcher() {
  const { profile } = useData();
  const userId = profile?.userId ?? "";
  const demo = !profile || profile.demo || isDemoSession();
  const enabled = useBrowserReminderEnabled(userId);
  const claim = useMutation(api.reminders.claimBrowser);
  const finish = useMutation(api.reminders.finishBrowser);
  useEffect(() => {
    if (!enabled || !userId || demo) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (
        !active ||
        checking ||
        !browserNotificationsAvailable() ||
        Notification.permission !== "granted"
      )
        return;
      checking = true;
      try {
        const batch = await claim({ batchId: crypto.randomUUID() });
        if (!batch) return;
        if (!active) {
          await finish({
            ids: batch.ids,
            batchId: batch.batchId,
            status: "canceled",
          });
          return;
        }
        let status: "sent" | "failed" | "canceled" = "sent";
        try {
          if (
            !(await showBrowserReminder(
              batch.count,
              batch.batchId,
              () => active && browserReminderEnabled(userId),
            ))
          )
            status = "canceled";
        } catch {
          status = "failed";
          // Avoid retry loops when the OS/browser rejects the notification.
          setBrowserReminderEnabled(userId, false);
        }
        await finish({ ids: batch.ids, batchId: batch.batchId, status });
      } catch {
        /* An offline tab checks again after it reconnects. */
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    const wake = () => void check();
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [enabled, userId, demo, claim, finish]);
  return null;
}
