import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".output", ".nitro"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "src/features/work-area/**/*.{ts,tsx}",
        "src/lib/workspace-keys.ts",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "src/test/**",
        "src/integrations/supabase/types.ts",
        "src/features/work-area/index.ts",
      ],
    },
  },
});
