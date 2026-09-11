export type MoneyFlowRow = {
  id: string;
  name: string;
  value: number;
  color: string;
};
export type MoneyFlowSummary = {
  earnings: MoneyFlowRow[];
  spending: MoneyFlowRow[];
  income: number;
  expense: number;
  savings: number;
};
export type MoneyFlowNode = MoneyFlowRow & {
  kind:
    | "income"
    | "refund"
    | "expense"
    | "reversal"
    | "surplus"
    | "shortfall"
    | "other";
  detail: string;
};

/** Every ribbon is positive; signed credits/reversals move to the other side. */
export function buildMoneyFlow(summary: MoneyFlowSummary) {
  const { income, expense, savings, earnings, spending } = summary;
  const cents = [
    income,
    expense,
    savings,
    ...earnings.map((row) => row.value),
    ...spending.map((row) => row.value),
  ];
  const valid =
    cents.every(Number.isSafeInteger) &&
    earnings.reduce((sum, row) => sum + row.value, 0) === income &&
    spending.reduce((sum, row) => sum + row.value, 0) === expense &&
    income - expense === savings;
  if (!valid)
    return { valid: false as const, total: 0, sources: [], destinations: [] };
  const sources: MoneyFlowNode[] = [],
    destinations: MoneyFlowNode[] = [];
  for (const row of earnings) {
    if (row.value > 0)
      sources.push({
        ...row,
        id: `income:${row.id}`,
        kind: "income",
        detail: "Income",
      });
    else if (row.value < 0)
      destinations.push({
        ...row,
        id: `reversal:${row.id}`,
        value: -row.value,
        kind: "reversal",
        detail: "Income reversal",
      });
  }
  for (const row of spending) {
    if (row.value > 0)
      destinations.push({
        ...row,
        id: `expense:${row.id}`,
        kind: "expense",
        detail: "Expense",
      });
    else if (row.value < 0)
      sources.push({
        ...row,
        id: `refund:${row.id}`,
        value: -row.value,
        kind: "refund",
        detail: "Expense refund or credit",
      });
  }
  if (savings > 0)
    destinations.push({
      id: "balance:surplus",
      name: "Left over",
      value: savings,
      color: "#519f81",
      kind: "surplus",
      detail: "Income after expenses",
    });
  else if (savings < 0)
    sources.push({
      id: "balance:shortfall",
      name: "Cash flow shortfall",
      value: -savings,
      color: "#be7a66",
      kind: "shortfall",
      detail: "Covered by existing funds or borrowing",
    });
  sources.sort((a, b) => b.value - a.value);
  destinations.sort((a, b) => b.value - a.value);
  const total = sources.reduce((sum, node) => sum + node.value, 0);
  if (
    !Number.isSafeInteger(total) ||
    total !== destinations.reduce((sum, node) => sum + node.value, 0)
  )
    return { valid: false as const, total: 0, sources: [], destinations: [] };
  return { valid: true as const, total, sources, destinations };
}

/** Keep the balance visible and combine only whole categories, without rounding. */
export function condenseMoneyFlow(
  nodes: MoneyFlowNode[],
  side: "inflows" | "outflows",
  maximum = 5,
): MoneyFlowNode[] {
  if (nodes.length <= maximum) return nodes;
  const balance = nodes.filter(
    (node) => node.kind === "surplus" || node.kind === "shortfall",
  );
  const ordinary = nodes.filter(
    (node) => node.kind !== "surplus" && node.kind !== "shortfall",
  );
  const visible = ordinary.slice(0, maximum - balance.length - 1);
  const rest = ordinary.slice(visible.length);
  return [
    ...visible,
    {
      id: `other:${side}`,
      name: `Other ${side}`,
      value: rest.reduce((sum, node) => sum + node.value, 0),
      color: "#9b9e9b",
      kind: "other",
      detail: `${rest.length} categories; see all movements below`,
    },
    ...balance,
  ];
}
