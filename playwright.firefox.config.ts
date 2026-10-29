import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: process.env.FLAKE_REPORT_PATH
    ? [['line'], ['./tools/testing/playwright-flake-reporter.ts']]
    : 'line',
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  testMatch: '**/firefox.extension.*.spec.ts',
  use: {
    ...devices['Desktop Firefox'],
    trace: 'on-first-retry',
  },
  workers: 1,
})
