import { ConvexError, v } from "convex/values";
import schema from "./schema";
import { userMutation, text } from "./lib/access";
import { accountKind, kind } from "./validators";
const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

export const prepareDestinations = userMutation({
  args: {
    accounts: v.array(
      v.object({ name: v.string(), kind: accountKind, closed: v.boolean() }),
    ),
    categories: v.array(
      v.object({ name: v.string(), emoji: v.string(), kind }),
    ),
  },
  returns: v.object({
    accounts: v.array(schema.doc("accounts")),
    categories: v.array(schema.doc("categories")),
  }),
  handler: async (ctx, args) => {
    if (args.accounts.length + args.categories.length > 100)
      throw new ConvexError(
        "Create at most 100 import destinations per batch.",
      );
    const [accounts, categories, groups] = await Promise.all([
      ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201),
      ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(501),
      ctx.db
        .query("groups")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(201),
    ]);
    if (accounts.length > 200 || categories.length > 500 || groups.length > 200)
      throw new ConvexError(
        "This workspace exceeds its account or category limit.",
      );
    const accountResults = [],
      categoryResults = [];
    for (const proposed of args.accounts) {
      const name = text(proposed.name, 120),
        importName = normalize(name);
      const matches = accounts.filter(
        (a) => a.importName === importName || normalize(a.name) === importName,
      );
      if (matches.length > 1)
        throw new ConvexError(
          `Choose an existing account for “${name}”; more than one matches.`,
        );
      if (matches[0]) {
        accountResults.push(matches[0]);
        continue;
      }
      if (accounts.length >= 200)
        throw new ConvexError(
          "This import would exceed 200 accounts. Import fewer accounts or merge existing ones first.",
        );
      const suffix = /\(\s*(?:\.{3}|…)?\s*[x*#•]*(\d{2,})\s*\)$/.exec(name);
      // A history-only account has no verified current balance. Do not create a zero snapshot today.
      const id = await ctx.db.insert("accounts", {
        userId: ctx.userId,
        ...proposed,
        name,
        importName,
        institution: "Manual",
        mask: suffix?.[1].slice(-4) ?? "",
        subtype: "imported history",
        balanceCents: 0,
        currency: "USD",
        hidden: false,
        excludeNetWorth: false,
        manual: true,
        updatedAt: Date.now(),
      });
      const account = (await ctx.db.get(id))!;
      accounts.push(account);
      accountResults.push(account);
    }
    for (const proposed of args.categories) {
      const name = text(proposed.name, 120),
        importName = normalize(name);
      const emoji = text(proposed.emoji, 30);
      const matches = categories.filter(
        (c) => c.importName === importName || normalize(c.name) === importName,
      );
      if (matches.length > 1)
        throw new ConvexError(
          `Choose an existing category for “${name}”; more than one matches.`,
        );
      if (matches[0]) {
        categoryResults.push(matches[0]);
        continue;
      }
      if (categories.length >= 500)
        throw new ConvexError(
          "This import would exceed 500 categories. Map some file categories to existing categories first.",
        );
      let group = groups.find(
        (g) => g.name === "Imported categories" && g.kind === proposed.kind,
      );
      if (!group) {
        if (groups.length >= 200)
          throw new ConvexError(
            "This import would exceed 200 category groups.",
          );
        const id = await ctx.db.insert("groups", {
          userId: ctx.userId,
          name: "Imported categories",
          kind: proposed.kind,
          order: Math.max(-1, ...groups.map((g) => g.order)) + 1,
        });
        group = (await ctx.db.get(id))!;
        groups.push(group);
      }
      const id = await ctx.db.insert("categories", {
        userId: ctx.userId,
        name,
        importName,
        emoji,
        groupId: group._id,
        enabled: true,
        order: Math.max(-1, ...categories.map((c) => c.order)) + 1,
      });
      const category = (await ctx.db.get(id))!;
      categories.push(category);
      categoryResults.push(category);
    }
    return { accounts: accountResults, categories: categoryResults };
  },
});
