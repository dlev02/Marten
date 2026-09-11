// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import * as pdfjs from "pdfjs-dist";
import { maxCreditPdfBytes, readCreditPdfText } from "./creditPdf";
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
