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
// Keyed on the metadata snapshot, so each server push builds these once and
// every list can look rows up by id instead of scanning 1,000+ merchants.
const lookupCache = new WeakMap<Metadata, Lookups>();
/** Id maps for the current metadata snapshot. */
export function lookups(data: Metadata): Lookups {
  let cached = lookupCache.get(data);
  if (!cached) {
    cached = {
      merchants: new Map(data.merchants.map((row) => [row._id, row])),
      categories: new Map(data.categories.map((row) => [row._id, row])),
      groups: new Map(data.groups.map((row) => [row._id, row])),
      accounts: new Map(data.accounts.map((row) => [row._id, row])),
      tags: new Map(data.tags.map((row) => [row._id, row])),
    };
    lookupCache.set(data, cached);
  }
  return cached;
}
