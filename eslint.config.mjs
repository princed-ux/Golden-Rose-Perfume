import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["apps/desktop/**/*.{ts,tsx}"],
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    files: ["apps/desktop/electron-shell/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/desktop/node_modules/**",
    "apps/desktop/dist/**",
    "apps/desktop/src-tauri/**",
    "apps/desktop/playwright-report/**",
    "apps/desktop/test-results/**",
  ]),
]);

export default eslintConfig;
