import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  grep: /@release-/u,
  projects: [
    {
      name: 'release-chromium',
      testMatch: [
        '**/release.extension.spec.ts',
        '**/options.extension.spec.ts',
      ],
    },
  ],
  reporter: [['line'], ['./tools/testing/release-e2e-reporter.ts']],
  retries: 0,
  testDir: './e2e',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
})
