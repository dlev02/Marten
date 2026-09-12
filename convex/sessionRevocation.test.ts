import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

/**
 * Convex Auth encodes "userId|sessionId" as the token subject. Deleting the
 * session row (what a password reset or account deletion does) must make the
 * still-valid token unusable right away.
 */
describe("session revocation", () => {
  it("rejects a token whose session row no longer exists", async () => {
    const t = convexTest(schema, modules);
    const { userId, sessionId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "revoked@example.com",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      return { userId, sessionId };
    });
    const asUser = t.withIdentity({ subject: `${userId}|${sessionId}` });
    await expect(
      asUser.query(api.workspace.metadata, {}),
    ).resolves.toBeDefined();
    await t.run(async (ctx) => {
      await ctx.db.delete(sessionId);
    });
    await expect(asUser.query(api.workspace.metadata, {})).rejects.toThrow(
      /session ended/i,
    );
  });
});
