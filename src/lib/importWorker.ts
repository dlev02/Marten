import type * as Import from "./transactionImport";

import type { planImport } from "./importPlan";

type Operations = { planImport: typeof planImport } & Pick<
  typeof Import,
  | "loadImportSource"
  | "loadImportSheet"
  | "previewImport"
  | "previewBalanceImport"
>;
export function runImportWorker<K extends keyof Operations>(
  operation: K,
  args: Parameters<Operations[K]>,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<Operations[K]>>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./transactionImport.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("Import cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    worker.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Could not read the file. Please choose it again."));
    };
    worker.postMessage({ operation, args });
  });
}
