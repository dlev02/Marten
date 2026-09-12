import {
  loadImportSource,
  loadImportSheet,
  previewImport,
  previewBalanceImport,
} from "./transactionImport";

import { planImport } from "./importPlan";

const operations = {
  planImport,
  loadImportSource,
  loadImportSheet,
  previewImport,
  previewBalanceImport,
};
self.onmessage = async ({ data }) => {
  try {
    const operation = operations[data.operation as keyof typeof operations] as (
      ...args: unknown[]
    ) => unknown;
    const result = await operation(...data.args);
    self.postMessage({ result });
  } catch (cause) {
    self.postMessage({
      error:
        cause instanceof Error ? cause.message : "Could not read the file.",
    });
  }
};
