import { expect, test } from "vitest";
import { suggestCreditScore } from "./creditScoreImport";

test("an explicit score proposes only printed fields", () => {
  expect(
    suggestCreditScore([
      "FICO® Score 8: 742\nAs of September 1, 2026\nTransUnion\nSource: Fictional statement",
    ]),
  ).toMatchObject({
    fields: {
      score: 742,
      date: "2026-09-01",
      bureau: "TransUnion",
      model: "FICO Score 8",
      source: "Fictional statement",
    },
  });
  expect(
    suggestCreditScore([
      "Your credit score: 701\nStatement closing date: 09/01/2026\nDiscover",
    ]),
  ).toMatchObject({ fields: { score: 701 } });
  expect(
    suggestCreditScore([
      "VantageScore 3.0: 710\nScore date: 08/22/2026\nEquifax",
    ]),
  ).toMatchObject({
    fields: {
      score: 710,
      date: "2026-08-22",
      bureau: "Equifax",
      model: "VantageScore 3.0",
    },
  });
});
test("money, scale endpoints, missing text, unsupported models and ambiguous scores require manual entry", () => {
  for (const text of [
    "",
    "Account 742. Balance $850.00. Available credit 300.",
    "FICO Score range: 300 to 850",
    "FICO Score 300–850",
    "FICO Auto Score 8: 880",
    "FICO Score 8: 742\nVantageScore 3.0: 701",
    "FICO Score 8: 742\nFICO Score 8: 742",
  ])
    expect(suggestCreditScore([text]).fields).toEqual({});
});
test("conflicting bureau/model/date details remain blank and invalid dates never normalize silently", () => {
  expect(
    suggestCreditScore([
      "Credit score: 740\nFICO Score 8 or FICO Score 9\nExperian Equifax TransUnion\nAs of 2026-08-01\nScore date: 08/02/2026",
    ]).fields,
  ).toEqual({ score: 740 });
  expect(
    suggestCreditScore(["FICO Score 8: 741\nAs of 02/30/2026"]).fields.date,
  ).toBeUndefined();
  expect(
    suggestCreditScore(["FICO Score 8: 741\nAs of February 30, 2026"]).fields
      .date,
  ).toBeUndefined();
});
