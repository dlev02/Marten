import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  categoryIcons,
  getCategoryIcon,
  normalizeCategoryEmoji,
  searchCategoryIcons,
} from "./categoryIcons";

describe("Marten category library", () => {
  it("keeps existing saved emoji working, including variation selectors", () => {
    for (const emoji of [
      "💵",
      "🌱",
      "✨",
      "🏡",
      "💡",
      "🌐",
      "🛡️",
      "🥑",
      "🍜",
      "☕",
      "🛍️",
      "🚙",
      "❤️",
      "📁",
      "🎟️",
      "🔄",
      "✈️",
      "🏋️",
      "🎁",
      "↔️",
      "💳",
    ]) {
      expect(getCategoryIcon(emoji), emoji).toBeDefined();
      expect(getCategoryIcon(normalizeCategoryEmoji(emoji))).toBe(
        getCategoryIcon(emoji),
      );
    }
    expect(getCategoryIcon("✨")?.name).toBe("Other income");
    expect(getCategoryIcon("💰")).toBe(getCategoryIcon("✨"));
    expect(getCategoryIcon("🦄")).toBeUndefined();
  });

  it("gives each portable emoji one artwork and ships every referenced local asset", () => {
    const values = categoryIcons.flatMap((icon) =>
      [icon.emoji, ...icon.aliases].map(normalizeCategoryEmoji),
    );
    expect(new Set(values).size).toBe(values.length);
    for (const icon of categoryIcons) {
      for (const file of [icon.file, icon.darkFile]) {
        const svg = readFileSync(
          new URL(`../../public/category-icons/${file}`, import.meta.url),
          "utf8",
        );
        expect(svg).toContain('viewBox="0 0 32 32"');
        expect(svg).not.toMatch(/<script|<image|href=|<foreignObject|<text/);
      }
    }
  });

  it("finds specific everyday categories by familiar terms, with collection filters", () => {
    for (const query of [
      "video games",
      "car payment",
      "gas",
      "subway",
      "rideshare",
      "scooters",
      "bus",
      "hotels",
      "hostels",
      "airbnb",
      "convenience",
      "postage shipping",
      "pharmacy",
      "haircut",
      "dentist",
      "interest",
      "resale",
      "daily cash",
      "reimbursement",
      "streaming",
      "bowling",
      "meal delivery",
      "meal prep kits",
      "vending",
      "e-sim",
      "travel subscriptions",
      "souvenirs",
      "edibles",
      "digital services",
      "AI assistants",
      "APIs",
      "domains",
      "toiletries",
      "doctor visits",
      "taxes",
      "financial fees",
      "loan repayment",
      "legal services",
      "balance adjustments",
      "office supplies",
      "advertising",
      "charity",
      "child care",
      "gas electric",
      "garbage",
    ]) {
      expect(searchCategoryIcons(query).length, query).toBeGreaterThan(0);
    }
    expect(searchCategoryIcons("  VIDEO   games ")[0].name).toBe("Gaming");
    expect(
      searchCategoryIcons("", "Transport").every(
        (icon) => icon.group === "Transport",
      ),
    ).toBe(true);
    expect(searchCategoryIcons("dentist", "Transport")).toEqual([]);
    expect(searchCategoryIcons("no-such-category")).toEqual([]);
    expect(searchCategoryIcons("✨")[0].name).toBe("Other income");
  });
});
