/** Routes that render the public site for visitors and signed-in users alike. */
export const publicPaths = new Set([
  "/",
  "/faq",
  "/privacy",
  "/terms",
  "/security",
  "/about",
]);

/** Public routes that a signed-in user sees inside the app shell instead. */
export const visitorOnlyPaths = new Set(["/support"]);
