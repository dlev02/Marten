import { expect, test } from "vitest";
import { creditBand, creditScaleFraction } from "./creditBands";

test("FICO and VantageScore bands follow their own published lines", () => {
  expect(creditBand(812, "FICO Score 8")).toBe("Exceptional");
  expect(creditBand(740, "FICO Score 8")).toBe("Very good");
  expect(creditBand(739, "FICO Score 10T")).toBe("Good");
  expect(creditBand(600, "FICO Score 9")).toBe("Fair");
  expect(creditBand(579, "FICO Score 9")).toBe("Poor");
  expect(creditBand(781, "VantageScore 3.0")).toBe("Excellent");
  expect(creditBand(700, "VantageScore 4.0")).toBe("Good");
  expect(creditBand(601, "VantageScore 4.0")).toBe("Fair");
  expect(creditBand(500, "VantageScore 3.0")).toBe("Poor");
  expect(creditBand(499, "VantageScore 3.0")).toBe("Very poor");
});

test("the gauge clamps scores to the 300–850 scale", () => {
  expect(creditScaleFraction(300)).toBe(0);
  expect(creditScaleFraction(575)).toBe(0.5);
  expect(creditScaleFraction(850)).toBe(1);
  expect(creditScaleFraction(900)).toBe(1);
});
