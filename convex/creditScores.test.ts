/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { groupCreditHistory } from "./lib/creditScores";
const modules = import.meta.glob("./**/*.ts");
const value = {
  score: 742,
  date: "2026-08-01",
  bureau: "TransUnion" as const,
  model: "FICO Score 8" as const,
  source: "Fictional sample report",
  entryMethod: "manual" as const,
};
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    alice: await ctx.db.insert("users", { email: "credit-a@example.test" }),
    bob: await ctx.db.insert("users", { email: "credit-b@example.test" }),
  }));
  return {
    t,
    alice: t.withIdentity({ subject: ids.alice }),
    bob: t.withIdentity({ subject: ids.bob }),
  };
}
test("credit scores are owned on reads, updates and deletion", async () => {
  const { t, alice, bob } = await fixture();
  await expect(t.query(api.creditScores.list, {})).rejects.toThrow("sign in");
  await expect(t.mutation(api.creditScores.save, value)).rejects.toThrow(
    "sign in",
  );
  const id = await alice.mutation(api.creditScores.save, value);
  expect(await bob.query(api.creditScores.list, {})).toEqual([]);
  await expect(
    bob.mutation(api.creditScores.save, { ...value, id, score: 800 }),
  ).rejects.toThrow("unavailable");
  await expect(bob.mutation(api.creditScores.remove, { id })).rejects.toThrow(
    "unavailable",
  );
  await alice.mutation(api.creditScores.save, { ...value, id, score: 750 });
  expect((await alice.query(api.creditScores.list, {}))[0].score).toBe(750);
  await alice.mutation(api.creditScores.remove, { id });
  expect(await alice.query(api.creditScores.list, {})).toEqual([]);
});
test("score bounds, dates, source and same-day duplicates are validated before writes", async () => {
  const { alice } = await fixture();
  for (const score of [299, 851, 742.5, NaN, Infinity])
    await expect(
      alice.mutation(api.creditScores.save, { ...value, score }),
    ).rejects.toThrow("300 to 850");
  for (const date of ["2026-02-30", "2000-13-01", "1899-01-01", "2999-01-01"])
    await expect(
      alice.mutation(api.creditScores.save, { ...value, date }),
    ).rejects.toThrow();
  await expect(
    alice.mutation(api.creditScores.save, { ...value, source: " " }),
  ).rejects.toThrow();
  await expect(
    alice.mutation(api.creditScores.save, {
      ...value,
      source: "x".repeat(101),
    }),
  ).rejects.toThrow();
  const id = await alice.mutation(api.creditScores.save, {
    ...value,
    score: 300,
  });
  await expect(alice.mutation(api.creditScores.save, value)).rejects.toThrow(
    "already have a score",
  );
  await alice.mutation(api.creditScores.save, { ...value, id, score: 850 });
  expect((await alice.query(api.creditScores.list, {}))[0].score).toBe(850);
});
test("history keeps bureaus and model versions separate and orders each by observation date", async () => {
  const { alice } = await fixture();
  await alice.mutation(api.creditScores.save, value);
  await alice.mutation(api.creditScores.save, {
    ...value,
    date: "2026-07-01",
    score: 730,
  });
  await alice.mutation(api.creditScores.save, {
    ...value,
    model: "VantageScore 3.0",
    score: 690,
  });
  await alice.mutation(api.creditScores.save, {
    ...value,
    bureau: "Equifax",
    score: 760,
  });
  const rows = await alice.query(api.creditScores.list, {});
  const groups = groupCreditHistory(rows);
  expect(groups).toHaveLength(3);
  expect(
    groups
      .find((group) => group.key === "TransUnion / FICO Score 8")
      ?.history.map((row) => row.score),
  ).toEqual([742, 730]);
  expect(
    groups
      .find((group) => group.key === "Equifax / FICO Score 8")
      ?.history.map((row) => row.score),
  ).toEqual([760]);
  expect(
    groups
      .find((group) => group.key === "TransUnion / VantageScore 3.0")
      ?.history.map((row) => row.score),
  ).toEqual([690]);
  expect(
    rows.every((row) => !("storageId" in row) && !("documentText" in row)),
  ).toBe(true);
});
