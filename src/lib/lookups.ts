import type { Metadata } from "./types";

type Row<K extends keyof Metadata> = Metadata[K] extends (infer T)[]
  ? T
  : never;
export type Lookups = {
  merchants: Map<string, Row<"merchants">>;
  categories: Map<string, Row<"categories">>;
  groups: Map<string, Row<"groups">>;
  accounts: Map<string, Row<"accounts">>;
  tags: Map<string, Row<"tags">>;
};
// Each map is keyed on its source array. The workspace arrives in slices, and
// a slice that did not change keeps its array, so a balance update does not
// rebuild the 1,000+ entry merchant map.
const mapCache = new WeakMap<
  readonly { _id: string }[],
  Map<string, unknown>
>();
function byId<T extends { _id: string }>(rows: readonly T[]) {
  let map = mapCache.get(rows) as Map<string, T> | undefined;
  if (!map) {
    map = new Map(rows.map((row) => [row._id, row]));
    mapCache.set(rows, map);
  }
  return map;
}
/** Id maps for the current workspace, so lists never scan arrays per row. */
export function lookups(data: Metadata): Lookups {
  return {
    merchants: byId(data.merchants),
    categories: byId(data.categories),
    groups: byId(data.groups),
    accounts: byId(data.accounts),
    tags: byId(data.tags),
  };
}
