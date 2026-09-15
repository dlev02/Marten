import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, usePaginatedQuery } from "./convex";
import type { Metadata } from "./types";
export type { Metadata } from "./types";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Loading } from "../components/folio/ui";
import { CategoryIcon } from "../components/folio/CategoryIcon";
import { demoLoadingText, isDemoSession } from "./demo";
const DataContext = createContext<Metadata | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const data = useQuery(api.workspace.metadata, {});
  // A whole-screen wait, so it sits centered like the auth check before it.
  if (data === undefined)
    return (
      <Loading full text={isDemoSession() ? demoLoadingText : undefined} />
    );
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
export function useData() {
  const data = useContext(DataContext);
  if (!data) throw new Error("Finance data unavailable");
  return data;
}
export function useTransactions(
  args: {
    from?: string;
    to?: string;
    search?: string;
    accountId?: Id<"accounts">;
    merchantId?: Id<"merchants">;
  } = {},
  autoLoad = false,
) {
  const result = usePaginatedQuery(api.transactions.list, args, {
    initialNumItems: 100,
  });
  const { status, loadMore } = result;
  useEffect(() => {
    if (autoLoad && status === "CanLoadMore") loadMore(200);
  }, [autoLoad, status, loadMore]);
  return result;
}
export function categoryOptions(data: Metadata) {
  return [...data.categories]
    .sort(
      (a, b) =>
        (data.groups.find((g) => g._id === a.groupId)?.order ?? 0) -
          (data.groups.find((g) => g._id === b.groupId)?.order ?? 0) ||
        a.order - b.order,
    )
    .filter((c) => c.enabled)
    .map((c) => ({
      value: c._id,
      label: c.name,
      icon: <CategoryIcon emoji={c.emoji} />,
      group: data.groups.find((g) => g._id === c.groupId)?.name,
    }));
}
export function merchantOptions(data: Metadata) {
  return data.merchants.map((m) => ({ value: m._id, label: m.name }));
}
export function accountOptions(data: Metadata) {
  return data.accounts
    .filter((a) => !a.closed)
    .map((a) => ({ value: a._id, label: a.name, group: a.institution }));
}
export function accountNetWorth(account: Doc<"accounts">) {
  return account.closed || account.excludeNetWorth
    ? 0
    : account.kind === "credit" || account.kind === "loan"
      ? -account.balanceCents
      : account.balanceCents;
}
export function txCategory(tx: Doc<"transactions">, data: Metadata) {
  return data.categories.find((c) => c._id === tx.categoryId);
}
export function txMerchant(tx: Doc<"transactions">, data: Metadata) {
  return data.merchants.find((m) => m._id === tx.merchantId);
}
