import { describe, expect, test } from "vitest";
import {
  cleanMerchantName,
  merchantDisplayName,
  preferredAccountName,
} from "./lib/merchantNames";

describe("merchant name cleanup", () => {
  test("drops processor prefixes, masked digits, store numbers, and shouting", () => {
    expect(cleanMerchantName("SQ *BLUE BOTTLE COFFEE #0421 ****1234")).toBe(
      "Blue Bottle Coffee",
    );
    expect(cleanMerchantName("BUS/MRT ******")).toBe("Bus/Mrt");
    expect(cleanMerchantName("TST* MAMA PIZZA RESTAURANT")).toBe(
      "Mama Pizza Restaurant",
    );
    expect(cleanMerchantName("PAYPAL *CASTAWAY HOSTEL")).toBe(
      "Castaway Hostel",
    );
    expect(cleanMerchantName("CJ OLIVE YOUNG STARFIELD")).toBe(
      "Cj Olive Young Starfield",
    );
    expect(cleanMerchantName("WHOLEFDS MKT 10231 AUSTIN TX")).toBe(
      "Wholefds Mkt",
    );
    expect(cleanMerchantName("CASTAWAY HOSTEL HO")).toBe("Castaway Hostel");
    expect(cleanMerchantName("MAMA PIZZA RESTAURANT HL")).toBe(
      "Mama Pizza Restaurant",
    );
    expect(cleanMerchantName("IN N OUT")).toBe("In N Out");
    expect(cleanMerchantName("McDonald's F1234")).toBe("McDonald's F1234");
    expect(cleanMerchantName("Amazon.com")).toBe("Amazon.com");
    expect(cleanMerchantName("****")).toBe("");
    expect(merchantDisplayName("****")).toBe("Unknown merchant");
    expect(merchantDisplayName("  ")).toBe("Unknown merchant");
  });
  test("prefers an official product name over a bare nickname", () => {
    expect(preferredAccountName("drew", "360 Checking")).toBe("360 Checking");
    expect(preferredAccountName("Drew", "VENTURE X")).toBe("Venture X");
    expect(preferredAccountName("Plaid Checking", "Plaid Gold Standard")).toBe(
      "Plaid Checking",
    );
    expect(preferredAccountName("Card 1234", "Quicksilver")).toBe("Card 1234");
    expect(preferredAccountName("", "")).toBe("Bank account");
    expect(preferredAccountName(null, "Savings")).toBe("Savings");
  });
});
