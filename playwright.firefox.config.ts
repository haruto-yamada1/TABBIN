import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: 'line',
  testDir: './e2e',
  testMatch: '**/firefox.extension.smoke.spec.ts',
  use: {
    ...devices['Desktop Firefox'],
    trace: 'on-first-retry',
  },
  workers: 1,
})
