import { describe, expect, it } from "vitest";
import { axisMoneyFormatter, axisWidth, moneyTicks } from "./chartAxis";

const labels = (values: number[]) => {
  const ticks = moneyTicks(values);
  return ticks.map(axisMoneyFormatter(ticks));
};

describe("money axis ticks", () => {
  it("never repeats a label for a narrow range in the thousands", () => {
    // $1,980 to $2,519 used to render as "$2K $2K $2K $3K".
    const result = labels([198_000, 206_900, 251_875]);
    expect(new Set(result).size).toBe(result.length);
    expect(result).toEqual(["$1.8K", "$2K", "$2.2K", "$2.4K", "$2.6K"]);
  });

  it("uses round steps and covers every value", () => {
    const ticks = moneyTicks([41_200, 45_012]);
    expect(ticks[0]).toBeLessThanOrEqual(41_200);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(45_012);
    const steps = new Set(ticks.slice(1).map((tick, i) => tick - ticks[i]));
    expect(steps.size).toBe(1);
    expect(labels([41_200, 45_012])).toEqual([
      "$410",
      "$420",
      "$430",
      "$440",
      "$450",
      "$460",
    ]);
  });

  it("anchors bar charts at zero, including negative flows", () => {
    expect(moneyTicks([1_200_00, 0], { includeZero: true })[0]).toBe(0);
    const ticks = moneyTicks([-675, 0], { includeZero: true });
    expect(ticks[ticks.length - 1]).toBe(0);
    expect(ticks.map(axisMoneyFormatter(ticks))).toEqual([
      "-$8",
      "-$6",
      "-$4",
      "-$2",
      "$0",
    ]);
  });

  it("prefers a denser round step over a sparse axis", () => {
    const ticks = moneyTicks([0, 1_050_000], { includeZero: true });
    expect(ticks.map(axisMoneyFormatter(ticks))).toEqual([
      "$0",
      "$2.5K",
      "$5K",
      "$7.5K",
      "$10K",
      "$12.5K",
    ]);
  });

  it("gives a flat or empty series a readable band", () => {
    expect(new Set(labels([250_000, 250_000])).size).toBeGreaterThan(1);
    expect(moneyTicks([], { includeZero: true })).toEqual([0, 100]);
  });

  it("keeps labels exact with the fewest decimals", () => {
    const format = axisMoneyFormatter([150_000, 200_000, 250_000_000]);
    expect(format(150_000)).toBe("$1.5K");
    expect(format(200_000)).toBe("$2K");
    expect(format(250_000_000)).toBe("$2.5M");
    expect(axisMoneyFormatter([0, 50_000])(50_000)).toBe("$500");
  });

  it("sizes the axis to its longest label", () => {
    expect(axisWidth(["$2K", "$2.25M"])).toBeGreaterThan(axisWidth(["$2K"]));
  });
});
