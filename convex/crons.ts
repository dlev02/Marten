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
export default crons;
