import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/env.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/blueprints/**",
      "**/tests/e2e/**",
    ],
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
