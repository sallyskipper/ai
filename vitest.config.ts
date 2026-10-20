import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://redline:redline@localhost:5432/redline_test",
      PAYMENTS_PROVIDER: "sandbox",
      SEED_DEMO: "false",
    },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
