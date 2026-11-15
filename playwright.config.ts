import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/* Use a pre-installed Chromium when the environment provides one, so the
   suite runs without downloading a browser that matches this exact version. */
const PREINSTALLED = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const launchOptions = existsSync(PREINSTALLED)
  ? { executablePath: PREINSTALLED, args: ["--no-sandbox", "--headless"] }
  : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "off",
    launchOptions,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } }],
});
