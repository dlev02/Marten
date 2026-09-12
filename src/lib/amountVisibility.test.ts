import { afterEach, describe, expect, it, vi } from "vitest";
import { money, compactMoney, csv, parseMoney } from "./format";
import {
  amountsHidden,
  displayMoney,
  displayCompactMoney,
  displayFinancialValue,
  hiddenAmount,
  setAmountsHidden,
} from "./amountVisibility";

afterEach(() => {
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});
describe("amount display privacy", () => {
  it("conceals magnitude, sign and currency with the same fixed mask", () => {
    setAmountsHidden(true);
    for (const cents of [0, -125, 7917, 100000000]) {
      expect(displayMoney(cents)).toBe(hiddenAmount);
      expect(displayMoney(cents, false, "EUR")).toBe(hiddenAmount);
      expect(displayCompactMoney(cents)).toBe(hiddenAmount);
    }
    expect(displayFinancialValue("125.3456 shares")).toBe(hiddenAmount);
  });
  it("leaves parsing and export formatting intact, and restores exact values", () => {
    setAmountsHidden(true);
    expect(money(7917)).toBe("$79.17");
    expect(parseMoney("79.17")).toBe(7917);
    expect(csv([["amount", 79.17]])).toBe('"amount","79.17"');
    setAmountsHidden(false);
    expect(displayMoney(7917)).toBe(money(7917));
    expect(displayCompactMoney(100000000)).toBe(compactMoney(100000000));
    expect(displayFinancialValue("12.5")).toBe("12.5");
  });
  it("persists the device preference and still hides when storage fails", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    setAmountsHidden(true);
    expect(setItem).toHaveBeenCalledWith("marten-hide-amounts", "true");
    setItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    setAmountsHidden(false);
    expect(amountsHidden()).toBe(false);
    setAmountsHidden(true);
    expect(displayMoney(123)).toBe(hiddenAmount);
  });
});
