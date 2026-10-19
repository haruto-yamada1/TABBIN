import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: './e2e/rendering-global-setup.ts',
  projects: [
    {
      name: 'rendering-chromium',
      testMatch: '**/rendering-performance.benchmark.spec.ts',
    },
  ],
  reporter: 'line',
  retries: 0,
  testDir: './e2e',
  outputDir: 'test-results/rendering',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
})
