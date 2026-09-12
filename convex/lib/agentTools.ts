import { z } from "zod";

const id = z.string().min(1).max(128);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().int().safe().min(-1e13).max(1e13);
const page = {
  cursor: z.string().max(12000).nullable().optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
};
const range = { from: day, to: day };
const forecastInputs = z.strictObject({
  schemaVersion: z.literal(1),
  asOfDate: day,
  currentAge: z.number(),
  retirementAge: z.number(),
  endAge: z.number(),
  cashCents: money,
  investmentCents: money,
  retirementCents: money,
  retirementAccessAge: z.number(),
  monthlyIncomeCents: money,
  monthlySpendingCents: money,
  retirementMonthlyIncomeCents: money,
  retirementMonthlySpendingCents: money,
  extraMonthlySavingsCents: money,
  annualReturnPct: z.number(),
  inflationPct: z.number(),
  incomeGrowthPct: z.number(),
  legacyTargetCents: money,
  travelPlans: z
    .array(
      z.strictObject({
        id,
        name: z.string().max(120),
        tripsPerYear: z.number(),
        costPerTripCents: money,
        startAge: z.number(),
        endAge: z.number(),
        month: z.number(),
      }),
    )
    .max(100),
});

/** The same schemas and descriptions serve browser WebMCP and remote MCP. */
export const agentToolSchemas = {
  get_accounts: z.strictObject({}),
  get_classifications: z.strictObject({ ...page }),
  list_transactions: z.strictObject({
    ...range,
    ...page,
    search: z.string().max(200).optional(),
    accountId: id.optional(),
    merchantId: id.optional(),
  }),
  get_transaction: z.strictObject({ id }),
  update_transaction: z.strictObject({
    id,
    patch: z
      .strictObject({
        notes: z.string().max(5000).optional(),
        categoryId: id.optional(),
        merchantId: id.optional(),
        tagIds: z.array(id).max(100).optional(),
        hidden: z.boolean().optional(),
        reviewed: z.boolean().optional(),
        splits: z
          .array(
            z.strictObject({
              categoryId: id,
              amountCents: money,
              note: z.string().max(5000).optional(),
            }),
          )
          .max(100)
          .optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Choose at least one change.",
      ),
  }),
  update_account: z.strictObject({
    id,
    patch: z
      .strictObject({
        name: z.string().min(1).max(120).optional(),
        hidden: z.boolean().optional(),
        excludeNetWorth: z.boolean().optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Choose at least one change.",
      ),
  }),
  list_recurring: z.strictObject({}),
  detect_recurring: z.strictObject({}),
  create_recurring: z.strictObject({
    merchantId: id,
    accountId: id,
    categoryId: id,
    name: z.string().min(1).max(120).optional(),
    amountCents: money,
    amountToleranceCents: money.optional(),
    statementContains: z.string().max(240).optional(),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]),
    nextDate: day,
    active: z.boolean(),
    note: z.string().max(5000),
  }),
  list_recurring_payments: z.strictObject({ ...range, ...page }),
  update_recurring: z.strictObject({
    id,
    patch: z
      .strictObject({
        name: z.string().min(1).max(120).optional(),
        active: z.boolean().optional(),
        amountCents: money.optional(),
        nextDate: day.optional(),
        note: z.string().max(5000).optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Choose at least one change.",
      ),
  }),
  set_recurring_paid: z.strictObject({
    recurringId: id,
    date: day,
    paid: z.boolean(),
  }),
  list_forecasts: z.strictObject({}),
  get_forecast_baseline: z.strictObject({ asOfDate: day }),
  run_forecast: z.strictObject({ inputs: forecastInputs }),
  save_forecast: z.strictObject({
    id: id.optional(),
    expectedRevision: z.number().int().positive().optional(),
    name: z.string().min(1).max(80),
    inputs: forecastInputs,
  }),
  get_investments: z.strictObject({ accountId: id.optional() }),
  list_investment_activity: z.strictObject({
    ...range,
    ...page,
    accountId: id.optional(),
  }),
  list_credit_scores: z.strictObject({}),
  get_report: z.strictObject({
    ...range,
    accountId: id.optional(),
    merchantId: id.optional(),
    categoryId: id.optional(),
    tagId: id.optional(),
    groupBy: z.enum(["category", "merchant", "group"]).optional(),
  }),
} as const;

export type AgentToolName = keyof typeof agentToolSchemas;
export type AgentToolInput<N extends AgentToolName> = z.infer<
  (typeof agentToolSchemas)[N]
>;
const descriptions: Record<
  AgentToolName,
  { title: string; description: string; readOnly: boolean }
> = {
  get_accounts: {
    title: "Read accounts",
    description:
      "Read cached account balances, statement amounts, due dates and update times. Amounts are integer cents with their currency. Balances supply net worth; do not add investment holdings a second time.",
    readOnly: true,
  },
  get_classifications: {
    title: "Read categories and merchants",
    description:
      "Read owned category groups, categories, tags and one merchant page for interpreting or editing transactions. Continue with continueCursor until isDone to read every merchant. Category group kind determines income, expense or transfer.",
    readOnly: true,
  },
  list_transactions: {
    title: "Read transactions",
    description:
      "Read one page of transactions in an inclusive date range. Continue with continueCursor until isDone before claiming complete totals; an empty page can still have more results. Positive amounts are outflows. Exclude hidden, pending and removed rows from posted totals; use splits instead of counting their parent again.",
    readOnly: true,
  },
  get_transaction: {
    title: "Read transaction details",
    description:
      "Read one owned transaction and its annotation history. Receipt downloads and bank identifiers are excluded.",
    readOnly: true,
  },
  update_transaction: {
    title: "Edit transaction annotations",
    description:
      "Reversibly edit notes, categories, merchant, tags, visibility, review state or splits of one transaction after the user requests the change. Splits must sum to the parent amount. Returns before and after values. Does not change bank amounts, dates or balances.",
    readOnly: false,
  },
  update_account: {
    title: "Edit account display",
    description:
      "Reversibly rename, hide or change net-worth inclusion of an existing owned account. Returns before and after values. Does not change bank balances, close accounts or disconnect banks.",
    readOnly: false,
  },
  list_recurring: {
    title: "Read recurring schedules",
    description:
      "Read the complete bounded set of recurring schedules and current statement reminders. Read payment pages separately before concluding a schedule occurrence is unpaid. Paused schedules have no paid/unpaid status.",
    readOnly: true,
  },
  detect_recurring: {
    title: "Find recurring suggestions",
    description:
      "Read recurring suggestions and evidence from Marten's detector, with its completeness flag. Suggestions require user review and are not saved until create_recurring is explicitly used.",
    readOnly: true,
  },
  create_recurring: {
    title: "Add a recurring schedule",
    description:
      "Create a schedule after the user reviews the merchant, amount, frequency and next date. Reuse existing owned account, category and merchant IDs. This only creates tracking; it does not subscribe, contact a merchant or move money.",
    readOnly: false,
  },
  list_recurring_payments: {
    title: "Read payment checkmarks",
    description:
      "Read one page of manual payment choices plus automatic posted-transaction matches for a date range of up to one year. Load all pages; manual paid and unpaid choices override automaticMatches for the same recurringId and date. These are tracking records, not bank payment instructions.",
    readOnly: true,
  },
  update_recurring: {
    title: "Edit a recurring schedule",
    description:
      "Reversibly edit an existing schedule's name, activity, amount, next date or note. Returns before and after values. Does not contact the merchant or move money.",
    readOnly: false,
  },
  set_recurring_paid: {
    title: "Mark a scheduled occurrence",
    description:
      "Set or clear the user's paid checkmark for an actual recurring occurrence. This only changes tracking; it does not send a bank payment.",
    readOnly: false,
  },
  list_forecasts: {
    title: "Read saved forecasts",
    description:
      "Read saved forecast scenarios, explicit assumptions and revisions. Saved scenarios are modeled snapshots and do not silently change with refreshed balances.",
    readOnly: true,
  },
  get_forecast_baseline: {
    title: "Read forecast baseline",
    description:
      "Read an observed bounded baseline as of a calendar date, including completeness and warnings. Example age, inflation and growth assumptions must be reviewed with the user. Never present an incomplete baseline as complete.",
    readOnly: true,
  },
  run_forecast: {
    title: "Model a forecast",
    description:
      "Run Marten's existing monthly forecast engine with explicit supplied assumptions without saving; return annual rows and full summary totals. This is a modeled scenario, not a prediction or investment recommendation.",
    readOnly: true,
  },
  save_forecast: {
    title: "Save forecast assumptions",
    description:
      "Save a named modeled scenario after user review. To update, supply the current id and expectedRevision; stale revisions are rejected. Creates a separate scenario when id is absent. Does not alter bank data.",
    readOnly: false,
  },
  get_investments: {
    title: "Read investment holdings",
    description:
      "Read cached complete holdings with securities and connection freshness, optionally for one account. Account balances already include holdings value. No trade execution or bank refresh.",
    readOnly: true,
  },
  list_investment_activity: {
    title: "Read investment activity",
    description:
      "Read one page of cached investment activity for an inclusive date range. Continue until isDone before calculating totals. Returned event amounts retain their currency and provider semantics.",
    readOnly: true,
  },
  list_credit_scores: {
    title: "Read credit-score history",
    description:
      "Read saved credit-score observations with date, bureau, model and source. Keep each bureau/model history distinct. Bank connections do not supply these observations.",
    readOnly: true,
  },
  get_report: {
    title: "Calculate cash flow and spending",
    description:
      "Calculate a complete USD report for an inclusive date range using Marten's signed amounts, split allocations and category groups. Transactions are paginated internally. If the bounded scan is incomplete, no partial totals are returned; narrow the range. Hidden, pending, removed and transfer entries are excluded.",
    readOnly: true,
  },
};

export const agentTools = (
  Object.keys(agentToolSchemas) as AgentToolName[]
).map((name) => ({
  name,
  ...descriptions[name],
  inputSchema: z.toJSONSchema(agentToolSchemas[name], { target: "draft-7" }),
}));

export const agentScopes = ["finance:read", "finance:write"] as const;
export function getAgentTool(name: string) {
  const tool = agentTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error("This agent tool is unavailable.");
  return tool;
}
