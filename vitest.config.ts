import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/demo-shop/**/*.test.ts", "tests/**/*.test.ts"],
    clearMocks: true,
    testTimeout: 10_000,
  },
});
