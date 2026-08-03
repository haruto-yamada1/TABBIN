import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: 'line',
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  testMatch: '**/firefox.extension.smoke.spec.ts',
  use: {
    ...devices['Desktop Firefox'],
    trace: 'on-first-retry',
  },
  workers: 1,
})
