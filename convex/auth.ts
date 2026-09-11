import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { passwordResetEmail } from "./lib/passwordReset";
import { reserveResetEmail } from "./lib/resetLimits";
import type { MutationCtx } from "./_generated/server";
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, args) => {
      if (
        args.type === "email" &&
        args.provider.id === "folio-password-reset" &&
        args.profile.email
      )
        await reserveResetEmail(ctx as MutationCtx, args.profile.email);
    },
  },
  providers: [
    Anonymous,
    Password({
      reset: passwordResetEmail,
      profile(params) {
        const email = String(params.email ?? "")
          .trim()
          .toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new Error("Enter a valid email address.");
        return {
          email,
          ...(typeof params.name === "string"
            ? { name: params.name.trim().slice(0, 80) }
            : {}),
        };
      },
      validatePasswordRequirements(password) {
        if (typeof password !== "string" || password.length < 12)
          throw new Error("Use a password with at least 12 characters.");
      },
    }),
  ],
});
