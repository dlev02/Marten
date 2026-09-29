import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, usePaginatedQuery } from "./convex";
import type { Metadata } from "./types";
export type { Metadata } from "./types";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Loading } from "../components/folio/ui";
import { CategoryIcon } from "../components/folio/CategoryIcon";
import { demoLoadingText, isDemoSession } from "./demo";
import { lookups } from "./lookups";
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
/** Caches an options list per metadata snapshot; callers must not mutate it. */
function perSnapshot<T>(build: (data: Metadata) => T) {
  const cache = new WeakMap<Metadata, T>();
  return (data: Metadata) => {
    if (!cache.has(data)) cache.set(data, build(data));
    return cache.get(data)!;
  };
}
const cachedCategoryOptions = perSnapshot((data) => {
  const { groups } = lookups(data);
  return [...data.categories]
    .sort(
      (a, b) =>
        (groups.get(a.groupId)?.order ?? 0) -
          (groups.get(b.groupId)?.order ?? 0) || a.order - b.order,
    )
    .filter((c) => c.enabled)
    .map((c) => ({
      value: c._id as string,
      label: c.name,
      icon: <CategoryIcon emoji={c.emoji} />,
      group: groups.get(c.groupId)?.name,
    }));
});
const cachedMerchantOptions = perSnapshot((data) =>
  data.merchants.map((m) => ({ value: m._id as string, label: m.name })),
);
export function categoryOptions(data: Metadata) {
  return cachedCategoryOptions(data);
}
export function merchantOptions(data: Metadata) {
  return cachedMerchantOptions(data);
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
  return tx.categoryId
    ? lookups(data).categories.get(tx.categoryId)
    : undefined;
}
export function txMerchant(tx: Doc<"transactions">, data: Metadata) {
  return tx.merchantId ? lookups(data).merchants.get(tx.merchantId) : undefined;
}
