import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Short build identifier shown in bug reports: package version plus git sha.
function buildIdentifier() {
  const version = (
    JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
  ).version;
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${version}+${sha}`;
  } catch {
    return version;
  }
}

// https://vitejs.dev/config/
// Keep local/preview consent pages protected like the deployed static site.
// This restricts embedding Marten, not the Plaid frames Marten opens itself.
const securityHeaders = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
};
export default defineConfig({
  plugins: [react()],
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
  define: {
    __MARTEN_BUILD__: JSON.stringify(buildIdentifier()),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Pre-bundle the query cache with React from the start; discovering it later
  // gave it a second React copy in development.
  optimizeDeps: {
    include: [
      "convex-helpers/react/cache/hooks",
      "convex-helpers/react/cache/provider",
    ],
  },
});
