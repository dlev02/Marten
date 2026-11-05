import { RateLimiter, HOUR, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * User-entered provider credentials are verified against the provider before
 * they are saved. Each check is a live request signed with a key the user
 * typed, so a small per-user budget keeps a mistyped key or a loop from
 * hammering the provider.
 */
export const providerRateLimiter = new RateLimiter(components.rateLimiter, {
  plaidLink: { kind: "token bucket", rate: 12, period: HOUR, capacity: 4 },
  plaidExchange: { kind: "token bucket", rate: 12, period: HOUR, capacity: 4 },
  bankSync: { kind: "token bucket", rate: 12, period: HOUR, capacity: 10 },
  bankPreview: { kind: "token bucket", rate: 30, period: HOUR, capacity: 5 },
  webhookAddress: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE,
    capacity: 30,
  },
  webhookGlobal: {
    kind: "token bucket",
    rate: 600,
    period: MINUTE,
    capacity: 120,
  },
  demoSignup: { kind: "token bucket", rate: 60, period: HOUR, capacity: 15 },
  simplefinConnect: {
    kind: "token bucket",
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
});
