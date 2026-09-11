import { describe, expect, test } from "vitest";
import { searchDestinations, searchMatches } from "./searchCatalog";

describe("search destinations", () => {
  test("finds appearance and individual settings from familiar words", () => {
    for (const [query, id] of [
      ["dark mode", "appearance"],
      ["light mode", "appearance"],
      ["system font", "font"],
      ["profile photo", "profile"],
      ["pending", "pending"],
      ["excel notes", "import"],
      ["receipt", "receipts"],
      ["reconnect", "institutions"],
    ]) {
      expect(
        searchMatches(searchDestinations, query).some((item) => item.id === id),
      ).toBe(true);
    }
  });
  test("matches every query word without depending on order or case", () => {
    expect(searchMatches(searchDestinations, "  MODE DARK ")[0].id).toBe(
      "appearance",
    );
    expect(searchMatches(searchDestinations, "dark refrigerator")).toEqual([]);
  });
  test("keeps unique destinations and valid internal links", () => {
    expect(new Set(searchDestinations.map((item) => item.id)).size).toBe(
      searchDestinations.length,
    );
    expect(
      searchDestinations.every(
        (item) => item.path.startsWith("/") && item.title.length > 0,
      ),
    ).toBe(true);
  });
});
