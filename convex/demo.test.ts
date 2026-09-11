/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("anonymous demo workspaces", () => {
  test("a guest gets an isolated, idempotent fictional workspace and cannot erase or convert it", async () => {
    const t = convexTest(schema, modules);
    const [guestId, memberId] = await t.run(async (ctx) => [
      await ctx.db.insert("users", { isAnonymous: true }),
      await ctx.db.insert("users", { email: "fictional-member@example.test" }),
    ]);
    const guest = t.withIdentity({ subject: guestId });
    const member = t.withIdentity({ subject: memberId });
    await member.mutation(api.workspace.initialize, {
      name: "Member",
      sample: false,
    });
    const memberBefore = await member.query(api.workspace.metadata, {});
    await expect(
      guest.mutation(api.workspace.initialize, { sample: false }),
    ).rejects.toThrow("fictional sample data");
    const profileId = await guest.mutation(api.workspace.initialize, {
      name: "Taylor",
      sample: true,
    });
    const before = await guest.query(api.workspace.metadata, {});
    expect(before.profile?._id).toBe(profileId);
    expect(before.profile?.demo).toBe(true);
    expect(before.accounts.length).toBeGreaterThan(0);
    expect(before.recurring.length).toBeGreaterThan(0);
    expect(before.accounts.every((account) => account.userId === guestId)).toBe(
      true,
    );
    expect(
      await guest.mutation(api.workspace.initialize, { sample: true }),
    ).toBe(profileId);
    await expect(guest.mutation(api.workspace.clearSample, {})).rejects.toThrow(
      "Exit the demo",
    );
    expect(await guest.query(api.workspace.metadata, {})).toEqual(before);
    expect(await member.query(api.workspace.metadata, {})).toEqual(
      memberBefore,
    );
    expect(memberBefore.accounts).toHaveLength(0);
  });
});
