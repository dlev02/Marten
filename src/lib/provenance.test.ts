import { describe, expect, test } from "vitest";
import { elapsedLabel, writtenByLabel } from "./provenance";

const now = Date.parse("2026-09-29T14:00:00Z");
describe("provenance labels", () => {
  test("describe elapsed time calmly and fall back to a date", () => {
    expect(elapsedLabel(now - 20_000, now)).toBe("just now");
    expect(elapsedLabel(now - 5 * 60_000, now)).toBe("5m ago");
    expect(elapsedLabel(now - 2 * 3_600_000, now)).toBe("2h ago");
    expect(elapsedLabel(now - 3 * 86_400_000, now)).toBe("3d ago");
    expect(elapsedLabel(Date.parse("2026-09-12T15:00:00Z"), now)).toBe(
      "Sep 12",
    );
    // A clock slightly behind the server never shows negative time.
    expect(elapsedLabel(now + 30_000, now)).toBe("just now");
  });
  test("names the connection that wrote the value", () => {
    expect(
      writtenByLabel({ name: "ChatGPT", at: now - 2 * 3_600_000 }, now),
    ).toBe("Updated by ChatGPT · 2h ago");
    expect(
      writtenByLabel({ name: "Muse key", at: now - 60_000 }, now, "Added"),
    ).toBe("Added by Muse key · 1m ago");
  });
});
