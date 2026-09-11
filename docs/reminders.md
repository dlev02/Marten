# Payment reminders

Marten can show a browser notification while a tab is open, and can send an
email while the app is closed. Both channels start off. Configure them in
**Settings → Preferences → Reminders**; the Recurring page links there.

## Consent and delivery

- Browser reminders are an opt-in preference for the signed-in user on the
  current browser. The Enable button requests native notification permission.
  Blocked, dismissed, unsupported, or insecure browser contexts remain off.
  Browser/system notification settings can still suppress a notice.
- Email reminders go only to the authenticated user's sign-in address. The
  user requests an eight-digit verification code, then explicitly chooses
  **Verify & enable email**. Codes expire after 15 minutes, allow five failed
  attempts, and cannot cross accounts or be reused. Requests are limited to
  one per minute and five per hour. Only the code hash is stored.
- Each channel can be turned off independently. Email consent is tied to the
  verified address; a changed sign-in address must be verified again.
- Anonymous sessions and sample workspaces cannot claim a browser reminder,
  request an email code, or receive reminder email. The server enforces this
  even if an old enabled preference exists.
- Notifications and emails contain a reminder count and an invitation to open
  Marten. Email also includes the earliest due date. Neither channel includes
  merchant names, account names/numbers, or financial amounts.

## What is due

Users choose the due date or 1, 3, or 7 days beforehand, a local time, and an IANA
time zone. The default is three days before at 9:00 AM, America/Chicago. Due
dates remain calendar dates: DST and UTC offsets change the wall clock check,
not the payment's date. A missed lead-day check can catch up at the chosen local
time through the due date. Past due dates are not notified.

Eligible items are active, positive-amount recurring schedules on open
accounts, and current credit-card/loan statement dates. A manual statement
reminder takes precedence over provider statement fields. A known zero or
negative statement balance is not a payment reminder; an unknown amount can
still have a meaningful due date. Income schedules stay quiet.

Paid schedule occurrences are excluded. Statement cards now have a separate
**Mark paid / Mark unpaid** control. Its checkmark belongs to that statement's
due date, does not change balances or transactions, and stops reminders for
that statement. A new due date is a new statement. Clearing a manual reminder
reveals any bank-provided statement details as before.

The delivery job recomputes current schedules, accounts, and paid records when
it claims work. Editing a due date, pausing/deleting a schedule, closing an
account, marking an item paid, or disabling email before that claim changes
what will be delivered. A notice already handed to the OS or email provider
cannot be recalled by a later edit.

## Delivery records and bounds

The browser checks on mount, once per minute while the tab runs, and on focus
or reconnection. Its small service worker displays notices and handles their
click; it does not cache financial data or subscribe to Web Push. There is no
closed-tab browser delivery in this version. Email is the available channel
for reminders when Marten is closed.

A Convex cron checks opted-in email preferences about every 15 minutes. It
paginates users in groups of 50 and schedules independent internal actions.
Current metadata limits remain 200 accounts and 500 recurring schedules;
incomplete data fails closed rather than assuming a missing paid record means
unpaid.

Each occurrence has a durable claim keyed by user, channel, source record, and
due date. Concurrent tabs and repeated cron jobs cannot claim it twice.
Amounts, names, and paid/unpaid toggles do not reset an already claimed
occurrence. A changed due date is a new occurrence. Browser and email claims
are independent, so enabling both intentionally permits one of each.

Claims permit at most one delivery attempt. Brevo also receives a stable
idempotency key for the batch. If a sender or browser fails after claiming,
Marten does not blindly retry an uncertain result and risk duplicate mail.
Settings shows a failed/unconfirmed email attempt or a failed browser display;
a browser display error turns off the local channel. A tab/sender crash can
therefore miss a notice. `sent` records mean browser/provider acceptance, not
proof that a person saw a notification or received an email in their inbox.
Old delivery records are removed after their due dates are more than 32 days
old. They cannot cause old dates to be replayed because overdue reminders are
ineligible.

## Hosting setup

Reminder email reuses the existing password-reset configuration:

- `AUTH_BREVO_KEY`: the deployment's existing Brevo transactional email key.
- `AUTH_EMAIL_FROM`: an authorized sender address for that Brevo account.
- `SITE_URL`: the app's browser URL, used for the reminder's Recurring link.

Keys stay on the server. If the email configuration is absent, the UI explains
that email delivery is unavailable. No external account, purchase, or provider
subscription is created by this feature. Delivery uses the configured
provider's normal quota.

## Code and verification

- `convex/lib/reminders.ts` owns calendar/time-zone eligibility.
- `convex/reminders.ts` owns consent, rate limits, duplicate claims, and cron
  pagination. `convex/reminderDelivery.ts` owns external sending.
- `convex/lib/reminderEmail.ts` builds the verification/reminder templates and
  makes the existing Brevo API request without leaking provider diagnostics.
- `src/features/settings/ReminderSettings.tsx` and
  `src/features/ReminderDispatcher.tsx` supply settings and open-tab delivery.
- `src/lib/browserReminders.ts` and `public/reminders-worker.js` wrap native
  permission, display, and click behavior.

On September 11, 2026, the focused recurring/reminder backend run passed 30
tests across four suites. Six browser API tests also passed. These cover
consent and owner isolation, code expiry/replay/rate limits, demo guards,
calendar/DST boundaries, current paid/paused/edited state, duplicate claims,
safe template content, denied/revoked permission, canceled display, and
provider/browser failure. Email and native notification calls were mocked;
no real messages were sent. Rendered fictional-demo checks covered 1440, 820,
and 390 pixel widths in light appearance and 1440/390 in dark appearance.
Every reminder section has 22px horizontal content padding; the phone timing
fields stack with a 14px gap and no horizontal overflow. Delivery controls remain
disabled in the sample workspace. Final assembled checks are recorded in
[verification.md](verification.md).

## References

- [MDN: Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)
  explains permission, secure contexts, nonpersistent notifications, and
  service-worker display.
- [Convex: Cron jobs](https://docs.convex.dev/scheduling/cron-jobs) documents
  interval jobs, UTC scheduling, and pagination through scheduled functions.
- [Brevo: Send a transactional email](https://developers.brevo.com/reference/send-transac-email)
  documents the existing send endpoint, message content, recipient, and
  provider acceptance response.
- [Brevo: Idempotency for batch emails](https://developers.brevo.com/docs/heterogenous-versions-batch-emails)
  documents its short-lived duplicate protection. Marten's durable database
  claims provide protection beyond the provider's idempotency window.
