import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) },
  },
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  envPrefix: ["VITE_"],
  build: { target: "es2022", sourcemap: false },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    alias: {
      "@supabase/supabase-js": fileURLToPath(
        new URL(
          "./node_modules/@supabase/supabase-js/dist/index.mjs",
          import.meta.url,
        ),
      ),
    },
  },
});
