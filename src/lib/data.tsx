import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
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
/**
 * Assembles the workspace from separate server slices. Each slice re-runs
 * only when its own tables change, and the slices that did not change keep
 * their array identity, so id lookups and option lists cached per array
 * survive a balance update or a new transaction.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const profile = useQuery(api.workspace.profileSlice, {}),
    accounts = useQuery(api.workspace.accountsSlice, {}),
    institutions = useQuery(api.workspace.institutionsSlice, {}),
    taxonomy = useQuery(api.workspace.taxonomySlice, {}),
    merchants = useQuery(api.workspace.merchantsSlice, {}),
    planning = useQuery(api.workspace.planningSlice, {});
  const data = useMemo<Metadata | undefined>(
    () =>
      profile === undefined ||
      accounts === undefined ||
      institutions === undefined ||
      taxonomy === undefined ||
      merchants === undefined ||
      planning === undefined
        ? undefined
        : {
            profile,
            accounts,
            ...taxonomy,
            merchants,
            ...planning,
            institutions,
          },
    [profile, accounts, institutions, taxonomy, merchants, planning],
  );
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
// Option lists are cached per source array, which stays the same object until
// that slice of the workspace changes on the server.
const categoryOptionCache = new WeakMap<
  Metadata["categories"],
  {
    groups: Metadata["groups"];
    options: ReturnType<typeof buildCategoryOptions>;
  }
>();
const merchantOptionCache = new WeakMap<
  Metadata["merchants"],
  { value: string; label: string }[]
>();
function buildCategoryOptions(data: Metadata) {
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
}
/** Enabled categories in group order; callers must not mutate the list. */
export function categoryOptions(data: Metadata) {
  const cached = categoryOptionCache.get(data.categories);
  if (cached?.groups === data.groups) return cached.options;
  const options = buildCategoryOptions(data);
  categoryOptionCache.set(data.categories, { groups: data.groups, options });
  return options;
}
/** Every merchant as a picker option; callers must not mutate the list. */
export function merchantOptions(data: Metadata) {
  let options = merchantOptionCache.get(data.merchants);
  if (!options) {
    options = data.merchants.map((m) => ({
      value: m._id as string,
      label: m.name,
    }));
    merchantOptionCache.set(data.merchants, options);
  }
  return options;
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
