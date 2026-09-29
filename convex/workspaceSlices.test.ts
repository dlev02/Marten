/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("the workspace slices add up to the whole workspace for their owner only", async () => {
  const t = convexTest(schema, modules);
  const [guestId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { isAnonymous: true }),
    await ctx.db.insert("users", { isAnonymous: true }),
  ]);
  const guest = t.withIdentity({ subject: guestId });
  const other = t.withIdentity({ subject: otherId });
  await guest.mutation(api.workspace.initialize, {
    name: "Taylor",
    sample: true,
  });

  const [
    whole,
    profile,
    accounts,
    institutions,
    taxonomy,
    merchants,
    planning,
  ] = await Promise.all([
    guest.query(api.workspace.metadata, {}),
    guest.query(api.workspace.profileSlice, {}),
    guest.query(api.workspace.accountsSlice, {}),
    guest.query(api.workspace.institutionsSlice, {}),
    guest.query(api.workspace.taxonomySlice, {}),
    guest.query(api.workspace.merchantsSlice, {}),
    guest.query(api.workspace.planningSlice, {}),
  ]);
  expect({
    profile,
    accounts,
    ...taxonomy,
    merchants,
    ...planning,
    institutions,
  }).toEqual(whole);
  expect(merchants.length).toBeGreaterThan(0);
  expect(taxonomy.categories.length).toBeGreaterThan(0);

  // Another person sees none of it.
  expect(await other.query(api.workspace.profileSlice, {})).toBeNull();
  expect(await other.query(api.workspace.merchantsSlice, {})).toEqual([]);
  expect(await other.query(api.workspace.accountsSlice, {})).toEqual([]);
});
