import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: './e2e/performance-budget-global-setup.ts',
  projects: [
    {
      name: 'budget-chromium',
      testMatch: '**/performance-budget.benchmark.spec.ts',
    },
  ],
  reporter: 'line',
  retries: 0,
  testDir: './e2e',
  outputDir: 'test-results/budget',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
})
