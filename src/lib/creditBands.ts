/**
 * Score bands as published by the two model families. FICO and VantageScore
 * draw their lines in different places, so the label follows the model.
 */
export function creditBand(score: number, model: string) {
  if (model.startsWith("Vantage")) {
    if (score >= 781) return "Excellent";
    if (score >= 661) return "Good";
    if (score >= 601) return "Fair";
    if (score >= 500) return "Poor";
    return "Very poor";
  }
  if (score >= 800) return "Exceptional";
  if (score >= 740) return "Very good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}
/** Where a score sits on the 300–850 scale, from 0 to 1. */
export function creditScaleFraction(score: number) {
  return Math.min(1, Math.max(0, (score - 300) / 550));
}
