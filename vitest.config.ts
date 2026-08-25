import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      clean: true,
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "json", "lcov"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
        "src/domain/**/*.ts": { 100: true },
      },
    },
  },
});
