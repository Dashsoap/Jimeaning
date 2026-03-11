import { defineConfig } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load e2e env vars (simple parser, no dotenv dep needed)
try {
  const envFile = readFileSync(resolve(__dirname, "e2e/.env.e2e"), "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch { /* .env.e2e is optional */ }

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  timeout: 600_000, // 10 minutes per test — async generation tasks are slow
  expect: { timeout: 30_000 },
  fullyParallel: false, // serial execution — pipeline tests depend on prior state
  retries: 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "zh-CN",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // No webServer — tests run against remote server defined in E2E_BASE_URL
});
