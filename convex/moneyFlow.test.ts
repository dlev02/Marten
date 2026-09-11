import { describe, expect, test } from "vitest";
import {
  buildMoneyFlow,
  condenseMoneyFlow,
  type MoneyFlowRow,
  type MoneyFlowSummary,
} from "../src/lib/moneyFlow";
const row = (id: string, value: number): MoneyFlowRow => ({
  id,
  name: id,
  value,
  color: "#669988",
});
function summary(
  earnings: MoneyFlowRow[],
  spending: MoneyFlowRow[],
): MoneyFlowSummary {
  const income = earnings.reduce((sum, row) => sum + row.value, 0),
    expense = spending.reduce((sum, row) => sum + row.value, 0);
  return { earnings, spending, income, expense, savings: income - expense };
}
function conserved(value: ReturnType<typeof buildMoneyFlow>) {
  expect(value.valid).toBe(true);
  expect(value.sources.reduce((sum, node) => sum + node.value, 0)).toBe(
    value.total,
  );
  expect(value.destinations.reduce((sum, node) => sum + node.value, 0)).toBe(
    value.total,
  );
  expect(
    [...value.sources, ...value.destinations].every(
      (node) => Number.isSafeInteger(node.value) && node.value > 0,
    ),
  ).toBe(true);
}
describe("money flow conservation", () => {
  test("shows income, spending, and exact remaining cents", () => {
    const result = buildMoneyFlow(
      summary([row("Pay", 100001)], [row("Groceries", 20002)]),
    );
    conserved(result);
    expect(
      result.destinations.find((node) => node.kind === "surplus")?.value,
    ).toBe(79999);
  });
  test("treats refunds as sources and income reversals as destinations", () => {
    const result = buildMoneyFlow(
      summary(
        [row("Pay", 10000), row("Income adjustment", -2500)],
        [row("Food", 6000), row("Refund", -1200)],
      ),
    );
    conserved(result);
    expect(result.total).toBe(11200);
    expect(result.sources.find((node) => node.kind === "refund")?.value).toBe(
      1200,
    );
    expect(
      result.destinations.find((node) => node.kind === "reversal")?.value,
    ).toBe(2500);
    expect(
      result.destinations.find((node) => node.kind === "surplus")?.value,
    ).toBe(2700);
  });
  test("represents a shortfall without inventing extra income", () => {
    const result = buildMoneyFlow(
      summary([row("Pay", 10000)], [row("Food", 13000)]),
    );
    conserved(result);
    expect(
      result.sources.find((node) => node.kind === "shortfall")?.value,
    ).toBe(3000);
    expect(
      result.sources
        .filter((node) => node.kind === "income")
        .reduce((sum, node) => sum + node.value, 0),
    ).toBe(10000);
    expect(result.destinations.some((node) => node.kind === "surplus")).toBe(
      false,
    );
  });
  test("handles only refunds, only reversals, zero activity, and exact balance", () => {
    for (const value of [
      summary([], [row("Refund", -1200)]),
      summary([row("Reversal", -2000)], []),
      summary([], []),
      summary([row("Pay", 500)], [row("Food", 500)]),
    ])
      conserved(buildMoneyFlow(value));
  });
  test("groups small categories without losing cents or hiding the balance", () => {
    const result = buildMoneyFlow(
      summary(
        [row("Pay", 10000)],
        Array.from({ length: 12 }, (_, index) =>
          row(`Expense ${index}`, index + 1),
        ),
      ),
    );
    const condensed = condenseMoneyFlow(result.destinations, "outflows");
    expect(condensed).toHaveLength(5);
    expect(condensed.reduce((sum, node) => sum + node.value, 0)).toBe(
      result.total,
    );
    expect(condensed.some((node) => node.kind === "surplus")).toBe(true);
  });
  test("rejects mismatched, fractional, and unsafe amounts rather than charting misleading proportions", () => {
    const value = summary([row("Pay", 10000)], [row("Food", 5000)]);
    for (const patch of [
      { income: 10001 },
      { savings: 5001 },
      { income: Infinity },
      { earnings: [row("Pay", 10000.5)] },
      { earnings: [row("Pay", Number.MAX_SAFE_INTEGER + 1)] },
    ])
      expect(buildMoneyFlow({ ...value, ...patch }).valid).toBe(false);
  });
});
