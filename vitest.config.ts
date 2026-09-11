import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep isolated auth/large-ledger fixtures from contending across every CPU.
    maxWorkers: 4,
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
  },
});
