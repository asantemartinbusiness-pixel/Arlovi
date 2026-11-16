import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/** Real Chromium across desktop, tablet and mobile form factors. */
export default defineConfig({
  ...base,
  testMatch: ["**/demand-loading-qa.spec.ts"],
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { ...base.use, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet-chromium", use: { browserName: "chromium", viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
    { name: "mobile-chromium", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
