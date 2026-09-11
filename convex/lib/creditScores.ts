import { v } from "convex/values";

export const creditBureaus = ["Equifax", "Experian", "TransUnion"] as const;
export const creditModels = [
  "FICO Score 8",
  "FICO Score 9",
  "FICO Score 10",
  "FICO Score 10T",
  "VantageScore 3.0",
  "VantageScore 4.0",
] as const;
export const creditScoreFields = {
  score: v.number(),
  date: v.string(),
  bureau: v.union(
    v.literal("Equifax"),
    v.literal("Experian"),
    v.literal("TransUnion"),
  ),
  model: v.union(...creditModels.map((model) => v.literal(model))),
  source: v.string(),
  entryMethod: v.union(v.literal("manual"), v.literal("pdf")),
};
export type CreditBureau = (typeof creditBureaus)[number];
export type CreditModel = (typeof creditModels)[number];

/** Different bureaus and model versions are separate measurements, never averaged. */
export function creditHistoryKey(row: { bureau: string; model: string }) {
  return `${row.bureau} / ${row.model}`;
}
export function groupCreditHistory<
  T extends { bureau: string; model: string; date: string },
>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = creditHistoryKey(row);
    const history = groups.get(key) ?? [];
    history.push(row);
    groups.set(key, history);
  }
  return [...groups.entries()]
    .map(([key, history]) => ({
      key,
      history: history.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
