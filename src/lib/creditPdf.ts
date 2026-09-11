import {
  suggestCreditScore,
  type CreditScoreImport,
} from "./creditScoreImport";
import type * as PdfJs from "pdfjs-dist";

export const maxCreditPdfBytes = 10 * 1024 * 1024;
export const maxCreditPdfPages = 20;
const maxTextCharacters = 100_000;

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
          let text = "";
          for (const item of content.items) {
            if (!("str" in item)) continue;
            length += item.str.length + 1;
            if (length > maxTextCharacters)
              throw new Error(
                "This PDF contains too much text. Choose a shorter document or enter the score manually.",
              );
            text += item.str + (item.hasEOL ? "\n" : " ");
          }
          pages.push(text);
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
