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
export default crons;
