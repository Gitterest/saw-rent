import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 920 },
  },
  projects: [
    {
      name: "admin-shell-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 4175",
    url: "http://127.0.0.1:4175/admin",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
