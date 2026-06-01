import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  webServer: [
    {
      command: "pnpm --filter @production-spec-graph/server dev",
      url: "http://127.0.0.1:3001/ready",
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command:
        "pnpm --filter @production-spec-graph/web exec next dev --hostname 127.0.0.1 --port 3100",
      env: {
        NEXT_PUBLIC_PSG_SYNC_SERVER_URL: "http://127.0.0.1:3001"
      },
      url: "http://127.0.0.1:3100",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    }
  ]
});
