import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * User-entered provider credentials are verified against the provider before
 * they are saved. Each check is a live request signed with a key the user
 * typed, so a small per-user budget keeps a mistyped key or a loop from
 * hammering the provider.
 */
export const providerRateLimiter = new RateLimiter(components.rateLimiter, {
  simplefinConnect: {
    kind: "token bucket",
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
});
