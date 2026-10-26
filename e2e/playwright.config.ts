import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT ?? 8788)
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    acceptDownloads: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: "bash ../scripts/e2e-server.sh",
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 90_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          E2E_PORT: String(port),
          MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
          MONGODB_DB: process.env.MONGODB_DB ?? "motion_e2e",
          ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? "e2e-admin@example.com",
        },
      },
})
