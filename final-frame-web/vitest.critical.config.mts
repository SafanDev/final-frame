import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/components/**/*.test.tsx",
    ],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage/critical",
      include: [
        "lib/auth/redirects.ts",
        "lib/api/pagination.ts",
        "lib/api/errors.ts",
        "lib/assets/file-policy.ts",
        "lib/feedback/keyboard.ts",
        "lib/feedback/transcript.ts",
        "lib/invitations/token-storage.ts",
        "lib/observability/client.ts",
        "lib/storage/signed-url-cache.ts",
        "lib/utils/format.ts",
        "components/ui/Button.tsx",
        "components/ui/Field.tsx",
        "components/ui/Dialog.tsx",
        "components/ui/SelectMenu.tsx",
      ],
      exclude: ["**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
