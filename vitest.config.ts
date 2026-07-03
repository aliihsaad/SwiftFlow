import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/billing/**/*.test.ts",
      "tests/content-intelligence/**/*.test.ts",
      "tests/developer-api/**/*.test.ts",
      "tests/publishing-automations/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    globals: false,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
})
