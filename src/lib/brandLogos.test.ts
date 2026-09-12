import { describe, expect, it } from "vitest";
import { brandLogo } from "./brandLogos";

describe("local brand resolution", () => {
  it("recognizes requested fitness and restaurant brands without broad substring matching", () => {
    expect(brandLogo("Equinox Fitness Club")).toBe("/brands/equinox.png");
    expect(brandLogo("sweetgreen")).toBe("/brands/sweetgreen.svg");
    expect(brandLogo("Equinox Consulting")).toBeNull();
    expect(brandLogo("Tailscale Inc")).toBe(brandLogo("Tailscale"));
  });
  it("covers the generated catalog beyond the original curated merchants", () => {
    expect(brandLogo("IKEA")).toBe("/brands/catalog/ikea.svg");
    expect(brandLogo("  Airbnb  ")).toBe("/brands/catalog/airbnb.svg");
    expect(brandLogo("Delta")).toBe("/brands/catalog/delta.svg");
  });
  it("preserves reviewed aliases and normalizes typographic apostrophes", () => {
    expect(brandLogo("Trader Joe’s")).toBe("/brands/traderjoes.svg");
    expect(brandLogo("Walgreens Pharmacy")).toBe("/brands/walgreens.svg");
    expect(brandLogo("Amazon Marketplace")).toBe("/brands/amazon.svg");
  });
  it("does not infer a merchant from a transaction string or partial match", () => {
    expect(brandLogo("Amazon Consulting Partners")).toBeNull();
    expect(brandLogo("CARD TARGET #1234 CHICAGO")).toBeNull();
    expect(brandLogo("Taylor's neighborhood coffee shop")).toBeNull();
  });
});
