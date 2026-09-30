import { amountsHidden, hiddenAmount } from "../../lib/amountVisibility";
import { axisMoneyFormatter, axisWidth, moneyTicks } from "../../lib/chartAxis";

/** Chart tick text: 11px muted app font (DESIGN.md typography). */
export const tick = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-app)",
};

/**
 * Props for a chart's value axis, shared by every Marten chart so axes look
 * and align the same everywhere. Labels are pinned to the chart's outer edge
 * (right-aligned on a right axis, left-aligned on a left axis), which is the
 * panel's text edge, and ticks are the exact round values passed in.
 */
export function valueAxisProps(
  ticks: number[],
  format: (value: number) => string,
  orientation: "left" | "right" = "right",
) {
  const width = axisWidth(ticks.map(format));
  const right = orientation === "right";
  return {
    orientation,
    ticks,
    domain: [ticks[0], ticks[ticks.length - 1]] as [number, number],
    interval: 0 as const,
    width,
    tickFormatter: format,
    axisLine: false,
    tickLine: false,
    tickSize: 0,
    tickMargin: 0,
    tick: {
      ...tick,
      textAnchor: right ? ("end" as const) : ("start" as const),
      dx: right ? width : -width,
    },
  };
}

/** A money value axis: round distinct ticks with exact compact labels. */
export function moneyAxisProps(
  values: number[],
  {
    includeZero = false,
    orientation = "right",
  }: { includeZero?: boolean; orientation?: "left" | "right" } = {},
) {
  const ticks = moneyTicks(values, { includeZero });
  const label = axisMoneyFormatter(ticks);
  return valueAxisProps(
    ticks,
    (value) => (amountsHidden() ? hiddenAmount : label(value)),
    orientation,
  );
}
