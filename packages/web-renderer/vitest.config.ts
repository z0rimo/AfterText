import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"]
  }
});
