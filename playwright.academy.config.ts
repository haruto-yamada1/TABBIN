import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  testMatch: '**/academy-*.extension.spec.ts',
  outputDir: 'test-results/academy-chromium',
  reporter: 'line',
  retries: 0,
  workers: 1,
  projects: [{ name: 'academy-chromium', use: devices['Desktop Chrome'] }],
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
})
