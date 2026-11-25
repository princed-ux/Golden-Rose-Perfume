import {
  defineConfig,
  globalIgnores,
} from "eslint/config";

import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/* =========================================================
   GOLDEN ROSE PERFUME — ESLINT CONFIGURATION
   ========================================================= */

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /* =======================================================
     DESKTOP REACT APPLICATION

     The desktop renderer uses Vite rather than Next.js.
     Next.js-specific image optimization and page routing
     rules do not apply to this renderer.

     React and TypeScript validation remain enabled.
     ======================================================= */

  {
    files: [
      "apps/desktop/**/*.{ts,tsx}",
    ],

    rules: {
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  /* =======================================================
     ELECTRON COMMONJS PROCESS
     ======================================================= */

  {
    files: [
      "apps/desktop/electron-shell/*.cjs",
    ],

    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  /* =======================================================
     GENERATED FILES AND ARCHIVED BACKUPS

     Do not lint generated output or historical snapshots.

     All active application source remains included.
     ======================================================= */

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    "apps/desktop/node_modules/**",
    "apps/desktop/dist/**",
    "apps/desktop/src-tauri/**",
    "apps/desktop/playwright-report/**",
    "apps/desktop/test-results/**",

    "apps/desktop/pos-backup-20261118-182020/**",
  ]),
]);

export default eslintConfig;