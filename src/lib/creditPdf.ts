import {
  suggestCreditScore,
  type CreditScoreImport,
} from "./creditScoreImport";
import type * as PdfJs from "pdfjs-dist";

export const maxCreditPdfBytes = 10 * 1024 * 1024;
export const maxCreditPdfPages = 20;
const maxTextCharacters = 100_000;

export type PositionedText = {
  str: string;
  /** Left edge and baseline in PDF points; the origin is the bottom-left corner. */
  x: number;
  y: number;
  height: number;
};
/**
 * Statements often store text out of visual order: a Discover statement emits
 * the score meter's "763" and its "as of" date long before the "FICO Score 8"
 * label they sit beneath. Rebuilding lines from glyph positions puts labels
 * and their values back in reading order, top to bottom and left to right.
 */
export function readingOrder(items: PositionedText[]): string {
  const lines: { y: number; items: PositionedText[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const tolerance = Math.max(2, item.height * 0.6);
    const line = lines.find((row) => Math.abs(row.y - item.y) <= tolerance);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str.trim())
        .join(" "),
    )
    .join("\n");
}

/** Shared with the real-PDF fixture test; the supplied library is PDF.js itself. */
export async function readCreditPdfText(
  bytes: Uint8Array,
  pdfjs: typeof PdfJs,
): Promise<string[]> {
  if (!bytes.length || bytes.length > maxCreditPdfBytes)
    throw new Error("Choose a PDF smaller than 10 MB.");
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-"))
    throw new Error("Choose a valid PDF file, or enter the score manually.");
  const task = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    enableXfa: false,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const document = await task.promise;
        if (document.numPages > maxCreditPdfPages)
          throw new Error(
            "Choose a PDF with 20 pages or fewer, or enter the score manually.",
          );
        const pages: string[] = [];
        let length = 0;
        for (let number = 1; number <= document.numPages; number++) {
          const page = await document.getPage(number);
          const content = await page.getTextContent();
          const positioned: PositionedText[] = [];
          for (const item of content.items) {
            if (!("str" in item)) continue;
            length += item.str.length + 1;
            if (length > maxTextCharacters)
              throw new Error(
                "This PDF contains too much text. Choose a shorter document or enter the score manually.",
              );
            positioned.push({
              str: item.str,
              x: item.transform[4],
              y: item.transform[5],
              height: item.height,
            });
          }
          pages.push(readingOrder(positioned));
          page.cleanup();
        }
        return pages;
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "This PDF took too long to read. Enter the score manually.",
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}

/** File bytes and extracted text stay in this browser; only suggestions leave this function. */
export async function readCreditScorePdf(
  file: File,
): Promise<CreditScoreImport> {
  if (file.size > maxCreditPdfBytes || !file.size)
    throw new Error("Choose a PDF smaller than 10 MB.");
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  try {
    const pages = await readCreditPdfText(
      new Uint8Array(await file.arrayBuffer()),
      pdfjs,
    );
    return suggestCreditScore(pages);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error(
        "This PDF is password-protected. Enter the score manually.",
      );
    if (error instanceof Error && /^(Choose |This PDF)/.test(error.message))
      throw error;
    throw new Error(
      "We couldn’t read this PDF. Enter the score from your document instead.",
    );
  }
}
