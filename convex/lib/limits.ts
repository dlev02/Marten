/**
 * Server limits shared with the agent tool schemas, which the browser also
 * loads. Keep this module free of imports so the WebMCP bundle stays small; a
 * client then learns the real bound up front instead of from a failed write.
 */
export const TRANSACTION_LIMITS = {
  notes: 10000,
  tags: 30,
  splitLines: 50,
  /** Transactions one bulk edit may change. */
  bulkRows: 100,
} as const;
export const RULE_LIMITS = {
  rules: 200,
  conditions: 20,
  conditionText: 500,
  tags: 30,
  splitLines: 50,
} as const;
/** Default text() bound for names of merchants, categories, tags and rules. */
export const NAME_LIMIT = 120;
