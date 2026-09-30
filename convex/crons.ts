import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
// Cached balances, holdings, and activity only; no on-demand refresh endpoints.
crons.interval(
  "Catch up bank connections",
  { hours: 6 },
  internal.plaidInternal.sweep,
  { cursor: null },
);
// SimpleFIN Bridge refreshes about daily and expects few requests; one catch-up a day.
crons.cron(
  "Catch up SimpleFIN connections",
  "17 9 * * *",
  internal.simplefin.sweep,
  {},
);
crons.interval(
  "Deliver opted-in payment reminders",
  { minutes: 15 },
  internal.reminders.sweep,
  { cursor: null },
);
crons.daily(
  "Remove old reminder delivery records",
  { hourUTC: 7, minuteUTC: 43 },
  internal.reminders.cleanup,
  {},
);
// AI connections: expired token rows, then app registrations nobody uses.
crons.interval(
  "Remove expired AI connection tokens",
  { hours: 1 },
  internal.agentAccess.sweepTokens,
  {},
);
crons.cron(
  "Remove unused AI app registrations",
  "29 8 * * *",
  internal.agentClients.sweep,
  { cursor: null },
);
// AI connection activity (with its before/after values) is kept 90 days.
crons.cron(
  "Remove old AI connection activity",
  "41 8 * * *",
  internal.agentAccess.pruneActivity,
  {},
);
export default crons;
