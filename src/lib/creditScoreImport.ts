import {
  creditBureaus,
  type CreditBureau,
  type CreditModel,
} from "../../convex/lib/creditScores";

export type CreditScoreSuggestion = {
  score?: number;
  date?: string;
  bureau?: CreditBureau;
  model?: CreditModel;
  source?: string;
};
export type CreditScoreImport = {
  fields: CreditScoreSuggestion;
  message: string;
  evidence?: string;
};
const manual = (message: string): CreditScoreImport => ({
  fields: {},
  message,
});
const unique = <T>(values: T[]) => [...new Set(values)];

function reportedDate(value: string) {
  let normalized = value.trim();
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  if (slash)
    normalized = `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const written = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(
      normalized,
    );
    if (!written) return undefined;
    const month = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(written[1].slice(0, 3).toLowerCase());
    if (month < 0) return undefined;
    normalized = `${written[3]}-${String(month + 1).padStart(2, "0")}-${written[2].padStart(2, "0")}`;
  }
  return Number.isFinite(Date.parse(normalized)) &&
    new Date(normalized).toISOString().slice(0, 10) === normalized
    ? normalized
    : undefined;
}

/** Deliberately narrow: only one explicitly labeled score is a suggestion.
 * Amounts, account numbers, scale endpoints and chart-only numbers are ignored.
 * Missing context remains missing; provider names never imply a bureau/model.
 */
export function suggestCreditScore(pages: string[]): CreditScoreImport {
  if (!pages.some((page) => page.trim()))
    return manual(
      "This PDF has no readable text. Enter the score from your document instead.",
    );
  const candidates: {
    score: number;
    page: string;
    index: number;
    evidence: string;
  }[] = [];
  for (const raw of pages) {
    const page = raw.replace(/[®™]/g, "").replace(/\u00a0/g, " ");
    const pattern =
      /\b(?:FICO\s+(?:credit\s+)?Score(?:\s+(?:10\s*T|10|9|8))?|credit\s+score|VantageScore(?:\s*[34](?:\.0)?)?)\s*(?:is\s*|:\s*|[-–—]\s*)?(\d{3})(?![\d.,])/gi;
    for (const match of page.matchAll(pattern)) {
      const score = Number(match[1]);
      const after = page.slice(
        (match.index ?? 0) + match[0].length,
        (match.index ?? 0) + match[0].length + 24,
      );
      if (
        score < 300 ||
        score > 850 ||
        /^\s*(?:[-–—]|to)\s*\d{3}\b/i.test(after)
      )
        continue;
      candidates.push({
        score,
        page,
        index: match.index ?? 0,
        evidence: match[0].replace(/\s+/g, " ").trim(),
      });
    }
  }
  if (!candidates.length)
    return manual(
      "We couldn’t identify one clearly labeled score. Enter the details from your document.",
    );
  if (candidates.length !== 1)
    return manual(
      "This document includes more than one possible score. Choose the score you want to record and enter its details.",
    );
  const candidate = candidates[0];
  const nearby = candidate.page.slice(
    Math.max(0, candidate.index - 300),
    candidate.index + 400,
  );
  const bureaus = creditBureaus.filter((bureau) =>
    new RegExp(`\\b${bureau}\\b`, "i").test(nearby),
  );
  const models = unique(
    [
      ...nearby.matchAll(
        /\b(FICO\s+Score\s+(10\s*T|10|9|8)|VantageScore\s*([34])(?:\.0)?)(?![\d.])/gi,
      ),
    ].map(
      (match) =>
        (match[2]
          ? `FICO Score ${match[2].replace(/\s/g, "").toUpperCase()}`
          : `VantageScore ${match[3]}.0`) as CreditModel,
    ),
  );
  const dates = unique(
    [
      ...nearby.matchAll(
        /\b(?:as of|score date|date of score|score updated|updated on)\s*[:,-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/gi,
      ),
    ]
      .map((match) => reportedDate(match[1]))
      .filter((value): value is string => !!value),
  );
  const sources = unique(
    [
      ...candidate.page.matchAll(
        /^(?:Source|Provided by|Prepared by)\s*:\s*([^\n]{1,100})$/gim,
      ),
    ].map((match) => match[1].trim()),
  );
  return {
    fields: {
      score: candidate.score,
      ...(bureaus.length === 1 ? { bureau: bureaus[0] } : {}),
      ...(models.length === 1 ? { model: models[0] } : {}),
      ...(dates.length === 1 ? { date: dates[0] } : {}),
      ...(sources.length === 1 ? { source: sources[0] } : {}),
    },
    evidence: candidate.evidence,
    message:
      "Review the suggested score and fill in any missing details before saving.",
  };
}
