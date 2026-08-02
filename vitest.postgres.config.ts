import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    globals: false,
    passWithNoTests: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
})
