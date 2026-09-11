import { describe, expect, test } from "vitest";
import { parsePlaidFlow } from "../src/lib/plaidLinkState";

const now = Date.parse("2026-09-10T18:00:00Z");
const flow = {
  linkToken: "link-sandbox-fictional",
  expiration: "2026-09-10T19:00:00Z",
  kind: "connect",
  userId: "sample-user",
  returnTo: "/accounts?filter=all",
};
describe("OAuth Link session boundaries", () => {
  test("accepts a fresh four-hour token when the browser clock is slightly behind", () => {
    const fresh = { ...flow, expiration: "2026-09-10T22:00:30Z" };
    expect(parsePlaidFlow(JSON.stringify(fresh), "sample-user", now)).toEqual(
      fresh,
    );
  });
  test("recovers the same short-lived token and safe local return route", () => {
    expect(parsePlaidFlow(JSON.stringify(flow), "sample-user", now)).toEqual(
      flow,
    );
    const update = { ...flow, kind: "update", itemId: "sample-item" };
    expect(parsePlaidFlow(JSON.stringify(update), "sample-user", now)).toEqual(
      update,
    );
  });
  test("rejects another user's session and expired or unbounded lifetimes", () => {
    expect(
      parsePlaidFlow(JSON.stringify(flow), "another-user", now),
    ).toBeNull();
    expect(
      parsePlaidFlow(
        JSON.stringify(flow),
        "sample-user",
        Date.parse(flow.expiration),
      ),
    ).toBeNull();
    expect(
      parsePlaidFlow(
        JSON.stringify({ ...flow, expiration: "2036-09-10T19:00:00Z" }),
        "sample-user",
        now,
      ),
    ).toBeNull();
  });
  test("rejects malformed flow state and external return destinations", () => {
    for (const returnTo of [
      "https://other.example",
      "//other.example",
      "/\\other.example",
    ])
      expect(
        parsePlaidFlow(
          JSON.stringify({ ...flow, returnTo }),
          "sample-user",
          now,
        ),
      ).toBeNull();
    expect(
      parsePlaidFlow(
        JSON.stringify({ ...flow, kind: "update" }),
        "sample-user",
        now,
      ),
    ).toBeNull();
    expect(parsePlaidFlow("broken-json", "sample-user", now)).toBeNull();
    expect(parsePlaidFlow(null, "sample-user", now)).toBeNull();
  });
  test("drops unrelated fields so only Link token and flow context are resumed", () => {
    expect(
      parsePlaidFlow(
        JSON.stringify({
          ...flow,
          accessToken: "should-not-persist",
          extra: { anything: true },
        }),
        "sample-user",
        now,
      ),
    ).toEqual(flow);
  });
});
