/**
 * Dashboard sections a profile may list, in their default order. Older
 * profiles may still name "accounts" and "topMerchants"; those are accepted and
 * simply have no panel, so a saved layout never fails validation.
 */
export const dashboardWidgetIds = [
  "netWorth",
  "transactions",
  "recurring",
  "spending",
  "cashFlow",
  "investments",
  "creditScore",
  "accounts",
  "topMerchants",
] as const;
export type DashboardWidgetId = (typeof dashboardWidgetIds)[number];
