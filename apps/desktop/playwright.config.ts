import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    browserName: "chromium",
    channel: "chrome",
    launchOptions: { args: ["--disable-gpu"] },
    viewport: { width: 1440, height: 900 },
    trace: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
