import { describe, expect, it } from "vitest";
import {
  displayCalendarDate,
  parseCalendarInput,
  readCalendarDate,
} from "./dateInput";

describe("calendar input boundaries", () => {
  it("accepts US and ISO dates without timezone shifts", () => {
    expect(parseCalendarInput("9/11/2026")).toBe("2026-09-11");
    expect(parseCalendarInput("2026-09-11")).toBe("2026-09-11");
    expect(displayCalendarDate("2026-09-11")).toBe("09/11/2026");
    expect(readCalendarDate("2026-09-11")?.getDate()).toBe(11);
  });
  it("rejects rollover dates and ambiguous incomplete input", () => {
    expect(parseCalendarInput("2/29/2025")).toBeNull();
    expect(parseCalendarInput("4/31/2026")).toBeNull();
    expect(parseCalendarInput("9/11/26")).toBeNull();
    expect(parseCalendarInput("2026-13-01")).toBeNull();
    expect(parseCalendarInput("2/29/2024")).toBe("2024-02-29");
  });
  it("supports clearing optional dates", () => {
    expect(parseCalendarInput("  ")).toBe("");
    expect(displayCalendarDate("")).toBe("");
  });
});
