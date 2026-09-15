import { useState } from "react";
import { useAction, useMutation, useQuery } from "../../lib/convex";
import { Bell, Mail } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useData } from "../../lib/data";
import {
  browserNotificationsAvailable,
  requestBrowserReminders,
  setBrowserReminderEnabled,
  useBrowserReminderEnabled,
} from "../../lib/browserReminders";
import {
  Button,
  Field,
  Loading,
  Panel,
  Picker,
  useTask,
} from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import type { FunctionReturnType } from "convex/server";
import "./reminderSettings.css";

type Settings = FunctionReturnType<typeof api.reminders.settings>;
const timeLabel = (minutes: number) =>
  `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${minutes < 720 ? "AM" : "PM"}`;
const zoneLabel = (zone: string) =>
  zone.replace(/_/g, " ").replace(/\//g, " / ");
function timeZones(current: string) {
  const supported = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone");
  return [
    ...new Set([
      current,
      "UTC",
      ...(supported ?? [
        "America/Chicago",
        "America/New_York",
        "America/Denver",
        "America/Los_Angeles",
        "Europe/London",
        "Asia/Tokyo",
      ]),
    ]),
  ]
    .sort()
    .map((zone) => ({ value: zone, label: zoneLabel(zone) }));
}

export function ReminderSettings() {
  const settings = useQuery(api.reminders.settings, {});
  const { profile } = useData();
  return (
    <div id="reminders" tabIndex={-1}>
      <Panel
        title="Reminders"
        className="settings-preference-panel reminder-settings"
      >
        {settings && profile ? (
          <ReminderControls settings={settings} userId={profile.userId} />
        ) : (
          <Loading text="Loading reminder settings…" />
        )}
      </Panel>
    </div>
  );
}
function ReminderControls({
  settings,
  userId,
}: {
  settings: Settings;
  userId: string;
}) {
  const browserEnabled = useBrowserReminderEnabled(userId);
  const [daysBefore, setDaysBefore] = useState(settings.daysBefore);
  const [timeMinutes, setTimeMinutes] = useState(settings.timeMinutes);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [code, setCode] = useState("");
  const [enteringCode, setEnteringCode] = useState(
    settings.verificationPending,
  );
  const save = useMutation(api.reminders.saveSettings);
  const requestCode = useAction(api.reminderDelivery.requestVerification);
  const verifyEmail = useAction(api.reminderDelivery.verifyEmail);
  const task = useTask();
  const dirty =
    daysBefore !== settings.daysBefore ||
    timeMinutes !== settings.timeMinutes ||
    timeZone !== settings.timeZone;
  const emailTiming = {
    daysBefore: settings.daysBefore,
    timeMinutes: settings.timeMinutes,
    timeZone: settings.timeZone,
  };
  const permissionBlocked =
    browserNotificationsAvailable() && Notification.permission === "denied";
  const allowedBrowser =
    settings.eligible &&
    browserEnabled &&
    browserNotificationsAvailable() &&
    Notification.permission === "granted";
  return (
    <div className="reminder-content">
      <p className="settings-helper">
        Get a reminder for recurring payments and statements. Paid items, paused
        schedules, and past due dates stay quiet.
      </p>
      {!settings.eligible && (
        <p className="reminder-notice">
          Reminders are available in your own workspace. The sample workspace
          doesn’t send notifications or email.
        </p>
      )}
      <div className="reminder-channel">
        <Bell size={19} aria-hidden="true" />
        <div>
          <strong>In this browser</strong>
          <p>
            Notifications while a Marten tab is open. Browser and system
            settings control when they appear.
          </p>
          {permissionBlocked && (
            <p className="reminder-notice">
              Notifications are blocked in this site’s browser settings.
            </p>
          )}
          {!browserNotificationsAvailable() && (
            <p className="reminder-notice">
              This browser can’t show notifications here. You can use email
              reminders.
            </p>
          )}
        </div>
        <Button
          disabled={
            !settings.eligible || task.busy || !browserNotificationsAvailable()
          }
          onClick={() =>
            void task.run(async () => {
              if (browserEnabled) setBrowserReminderEnabled(userId, false);
              else await requestBrowserReminders(userId);
            })
          }
        >
          {browserEnabled ? "Turn off" : "Enable"}
        </Button>
      </div>
      {allowedBrowser && (
        <p className="reminder-channel-status">
          Browser reminders are on for this device.
        </p>
      )}
      {settings.lastBrowserStatus === "failed" && (
        <p className="reminder-notice" role="status">
          The browser couldn’t display the last reminder. Check browser and
          system notification settings before enabling it again.
        </p>
      )}
      <div className="reminder-channel">
        <Mail size={19} aria-hidden="true" />
        <div>
          <strong>By email</strong>
          <p>
            Reminders even when Marten is closed.
            {settings.email && (
              <>
                {" "}
                Sent to{" "}
                <span className="reminder-email-address">{settings.email}</span>
                .
              </>
            )}
          </p>
          {!settings.emailAvailable && (
            <p className="reminder-notice">
              Email delivery hasn’t been configured on this server.
            </p>
          )}
        </div>
        <Button
          disabled={
            !settings.eligible ||
            (!settings.emailAvailable && !settings.emailEnabled) ||
            task.busy
          }
          onClick={() =>
            void task.run(async () => {
              if (settings.emailEnabled)
                await save({ ...emailTiming, emailEnabled: false });
              else if (settings.emailVerified)
                await save({ ...emailTiming, emailEnabled: true });
              else {
                await requestCode({});
                setEnteringCode(true);
              }
            })
          }
        >
          {settings.emailEnabled
            ? "Turn off"
            : settings.emailVerified
              ? "Enable"
              : "Verify email"}
        </Button>
      </div>
      {settings.emailEnabled && (
        <p className="reminder-channel-status">Email reminders are on.</p>
      )}
      {enteringCode && !settings.emailEnabled && (
        <form
          className="reminder-verification"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(async () => {
              await verifyEmail({ code });
              setCode("");
              setEnteringCode(false);
            }, "Email reminders enabled");
          }}
        >
          <Field
            label="Verification code"
            hint="Enter the eight-digit code sent to your sign-in email. It expires in 15 minutes."
          >
            <input
              className="f-input reminder-code"
              aria-label="Reminder email verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              maxLength={8}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              required
            />
          </Field>
          <div className="reminder-verification-actions">
            <Button
              type="submit"
              tone="primary"
              disabled={task.busy || code.length !== 8}
            >
              Verify & enable email
            </Button>
            <Button
              type="button"
              disabled={task.busy}
              onClick={() =>
                void task.run(() => requestCode({}), "A new code was sent")
              }
            >
              Resend code
            </Button>
          </div>
        </form>
      )}
      {(settings.lastEmailStatus === "failed" ||
        settings.lastEmailStatus === "unconfirmed") && (
        <p className="reminder-notice" role="status">
          The last reminder email couldn’t be confirmed. Check Recurring for
          anything due. Marten won’t repeat an uncertain email.
        </p>
      )}
      <form
        className="reminder-timing"
        onSubmit={(event) => {
          event.preventDefault();
          void task.run(
            () => save({ daysBefore, timeMinutes, timeZone }),
            "Reminder timing saved",
          );
        }}
      >
        <fieldset disabled={!settings.eligible || task.busy}>
          <legend>When to remind you</legend>
          <div className="reminder-time-pair">
            <Field label="Before the due date">
              <Select
                aria-label="Reminder lead time"
                value={String(daysBefore)}
                onValueChange={(value) => setDaysBefore(Number(value))}
                options={[
                  { value: "0", label: "On the due date" },
                  { value: "1", label: "1 day before" },
                  { value: "3", label: "3 days before" },
                  { value: "7", label: "7 days before" },
                ]}
              />
            </Field>
            <Field label="Time">
              <Select
                aria-label="Reminder time"
                value={String(timeMinutes)}
                onValueChange={(value) => setTimeMinutes(Number(value))}
                options={[
                  ...new Set([
                    480,
                    540,
                    600,
                    720,
                    1080,
                    1200,
                    settings.timeMinutes,
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((minutes) => ({
                    value: String(minutes),
                    label: timeLabel(minutes),
                  }))}
              />
            </Field>
          </div>
          <Field label="Time zone">
            <Picker
              label="Reminder time zone"
              value={timeZone}
              onChange={setTimeZone}
              options={timeZones(timeZone)}
            />
          </Field>
          <p className="settings-helper">
            Each payment gets one reminder per channel, from your chosen time
            through its due date. Email checks run about every 15 minutes.
          </p>
          <Button type="submit" tone="primary" disabled={!dirty || task.busy}>
            Save reminder timing
          </Button>
        </fieldset>
      </form>
      <p className="reminder-privacy">
        Notifications and emails leave out merchant names, account details, and
        amounts. Reminders never make a payment.
      </p>
    </div>
  );
}
