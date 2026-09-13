// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import * as pdfjs from "pdfjs-dist";
import {
  maxCreditPdfBytes,
  readCreditPdfText,
  readingOrder,
} from "./creditPdf";
import { suggestCreditScore } from "./creditScoreImport";

test("PDF.js reads the actual fictional score PDF and yields a reviewed suggestion", async () => {
  const bytes = new Uint8Array(
    await readFile(
      new URL("../../docs/fixtures/credit-score-qa.pdf", import.meta.url),
    ),
  );
  const pages = await readCreditPdfText(bytes, pdfjs);
  expect(pages).toHaveLength(1);
  expect(pages[0]).toContain("FICO Score 8: 742");
  expect(suggestCreditScore(pages).fields).toEqual({
    score: 742,
    date: "2026-09-01",
    bureau: "TransUnion",
    model: "FICO Score 8",
    source: "Fictional sample report",
  });
});
test("local reader rejects oversized, non-PDF and more-than-20-page files", async () => {
  await expect(
    readCreditPdfText(new Uint8Array(maxCreditPdfBytes + 1), pdfjs),
  ).rejects.toThrow("10 MB");
  await expect(
    readCreditPdfText(new TextEncoder().encode("FICO Score 8: 742"), pdfjs),
  ).rejects.toThrow("valid PDF");
  const bytes = new Uint8Array(
    await readFile(
      new URL(
        "../../docs/fixtures/credit-score-too-many-pages.pdf",
        import.meta.url,
      ),
    ),
  );
  await expect(readCreditPdfText(bytes, pdfjs)).rejects.toThrow("20 pages");
});

test("encrypted and no-text PDFs fall back without invented suggestions", async () => {
  const encrypted = new Uint8Array(
    await readFile(
      new URL(
        "../../docs/fixtures/credit-score-encrypted.pdf",
        import.meta.url,
      ),
    ),
  );
  await expect(readCreditPdfText(encrypted, pdfjs)).rejects.toMatchObject({
    name: "PasswordException",
  });
  const blank = new Uint8Array(
    await readFile(
      new URL("../../docs/fixtures/credit-score-no-text.pdf", import.meta.url),
    ),
  );
  expect(
    suggestCreditScore(await readCreditPdfText(blank, pdfjs)),
  ).toMatchObject({
    fields: {},
    message: expect.stringContaining("no readable text"),
  });
});

test("reading order rebuilds lines from glyph positions so a score meter follows its label", () => {
  // Modeled on a card statement whose content stream lists the meter's value and
  // date before the label printed above them.
  const text = readingOrder([
    { str: "Updated Monthly", x: 172, y: 433, height: 7 },
    { str: "AS OF 02/25/26", x: 172, y: 442, height: 7 },
    { str: "763", x: 111, y: 444, height: 14 },
    { str: "Very Good", x: 111, y: 433, height: 7 },
    { str: "FICO", x: 111, y: 460, height: 8 },
    { str: " ", x: 130, y: 460, height: 8 },
    { str: "Score 8 based on TransUnion data:", x: 140, y: 460, height: 8 },
  ]);
  expect(text).toBe(
    "FICO Score 8 based on TransUnion data:\n763 AS OF 02/25/26\nVery Good Updated Monthly",
  );
  expect(suggestCreditScore([text]).fields).toEqual({
    score: 763,
    bureau: "TransUnion",
    model: "FICO Score 8",
    date: "2026-02-25",
  });
});
