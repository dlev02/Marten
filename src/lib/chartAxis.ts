/**
 * Value-axis ticks shared by every Marten chart. Recharts' automatic ticks can
 * land on values that round to the same compact label ("$2K $2K"), so charts
 * ask for round 1-2-5 steps here and label each tick exactly.
 */

const niceFractions = [1, 2, 2.5, 5, 10];

/** The smallest 1-2-2.5-5 step at least `raw`. */
function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = niceFractions.find((step) => fraction <= step + 1e-9) ?? 10;
  return nice * power;
}

/** The next round step after `step` (1 → 2 → 2.5 → 5 → 10). */
function nextStep(step: number) {
  return niceStep(step * 1.000001);
}

/**
 * Round, evenly spaced ticks in cents covering every value. Steps are at least
 * one dollar so labels never need cents. `includeZero` anchors bar charts and
 * projections at $0.
 */
export function moneyTicks(
  values: number[],
  {
    includeZero = false,
    count = 5,
  }: { includeZero?: boolean; count?: number } = {},
) {
  const finite = values.filter(Number.isFinite);
  let low = finite.length ? Math.min(...finite) : 0;
  let high = finite.length ? Math.max(...finite) : 0;
  if (includeZero) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }
  if (high === low) {
    // A flat line still gets a readable band around its value.
    const pad = Math.max(Math.abs(high) * 0.05, 100);
    if (!(includeZero && low === 0)) low -= pad;
    high += pad;
  }
  // Start below the ideal spacing and take the densest round step that
  // still fits `count + 1` ticks, so axes neither crowd nor go sparse.
  let step = Math.max(niceStep((high - low) / (count - 1) / 2), 100);
  const ticksFor = (size: number) => {
    const first = Math.floor(low / size + 1e-9) * size;
    const last = Math.ceil(high / size - 1e-9) * size;
    const ticks: number[] = [];
    for (let tick = first; tick <= last + size / 2; tick += size)
      ticks.push(Math.round(tick));
    return ticks;
  };
  let ticks = ticksFor(step);
  while (ticks.length > count + 1) {
    step = nextStep(step);
    ticks = ticksFor(step);
  }
  return ticks;
}

const units: [number, string][] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

function compactParts(cents: number) {
  const dollars = Math.abs(cents) / 100;
  const [divisor, suffix] = units.find(([size]) => dollars >= size) ?? [1, ""];
  return { amount: dollars / divisor, suffix };
}

/**
 * Formats a tick list with the fewest decimals that keep every label exact,
 * such as "$1.5K" beside "$2K". Exact labels are always distinct.
 */
export function axisMoneyFormatter(ticks: number[]) {
  const decimals =
    [0, 1, 2, 3].find((places) =>
      ticks.every((tick) => {
        const scaled = compactParts(tick).amount * 10 ** places;
        return Math.abs(scaled - Math.round(scaled)) < 1e-6;
      }),
    ) ?? 3;
  const number = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  });
  return (cents: number) => {
    const { amount, suffix } = compactParts(cents);
    return `${cents < 0 ? "-" : ""}$${number.format(amount)}${suffix}`;
  };
}

/**
 * Axis width for the longest label at the 11px chart-tick size, plus a 12px
 * gap between the plot and its labels.
 */
export function axisWidth(labels: string[]) {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  return Math.ceil(longest * 6.4) + 12;
}
