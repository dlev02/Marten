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
export default defineConfig({
  plugins: [react()],
  define: {
    __MARTEN_BUILD__: JSON.stringify(buildIdentifier()),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
