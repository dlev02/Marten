import type { Doc } from "../../convex/_generated/dataModel";

export type RecurringFilters = {
  search: string;
  accountId: string;
  kind: "all" | "expense" | "income" | "credit";
  status: "all" | "paid" | "unpaid";
};
export const emptyRecurringFilters: RecurringFilters = {
  search: "",
  accountId: "",
  kind: "all",
  status: "all",
};
type Scheduled = Pick<
  Doc<"recurring">,
  "accountId" | "merchantId" | "amountCents" | "name"
> & { paid?: boolean };

export function filterRecurring<T extends Scheduled>(
  rows: T[],
  filters: RecurringFilters,
  accounts: Pick<Doc<"accounts">, "_id" | "kind">[],
  merchants: Pick<Doc<"merchants">, "_id" | "name">[],
) {
  const search = filters.search.trim().toLocaleLowerCase();
  const names = new Map(
    merchants.map((merchant) => [
      merchant._id,
      merchant.name.toLocaleLowerCase(),
    ]),
  );
  const cardIds = new Set(
    accounts
      .filter((account) => account.kind === "credit")
      .map((account) => account._id),
  );
  return rows.filter((row) => {
    if (filters.accountId && row.accountId !== filters.accountId) return false;
    if (
      search &&
      !`${row.name ?? ""} ${names.get(row.merchantId) ?? ""}`
        .toLocaleLowerCase()
        .includes(search)
    )
      return false;
    if (filters.kind === "expense" && row.amountCents <= 0) return false;
    if (filters.kind === "income" && row.amountCents >= 0) return false;
    if (filters.kind === "credit" && !cardIds.has(row.accountId)) return false;
    if (filters.status === "paid" && row.paid !== true) return false;
    if (filters.status === "unpaid" && row.paid !== false) return false;
    return true;
  });
}
