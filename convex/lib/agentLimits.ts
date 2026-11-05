import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const agentRateLimiter = new RateLimiter(components.rateLimiter, {
  agentOAuthGlobal: {
    kind: "token bucket",
    rate: 1200,
    period: HOUR,
    capacity: 120,
  },
  agentTokenGlobal: {
    kind: "token bucket",
    rate: 6000,
    period: HOUR,
    capacity: 300,
  },
  agentCall: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 30 },
  agentOAuthAddress: {
    kind: "token bucket",
    rate: 120,
    period: HOUR,
    capacity: 20,
  },
  agentOAuthClient: {
    kind: "token bucket",
    rate: 300,
    period: HOUR,
    capacity: 40,
  },
  agentTokenAddress: {
    kind: "token bucket",
    rate: 600,
    period: HOUR,
    capacity: 40,
  },
  // Dynamic client registration, keyed by a hash of the caller's address.
  agentRegister: {
    kind: "token bucket",
    rate: 10,
    period: HOUR,
    capacity: 5,
  },
  // Personal access key creation, keyed by the signed-in owner.
  agentKeyCreate: {
    kind: "token bucket",
    rate: 20,
    period: HOUR,
    capacity: 5,
  },
});
