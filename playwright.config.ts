import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'storybook',
      testMatch: '**/*.story.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'extension',
      testMatch: '**/*.extension.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  use: {
    trace: 'on-first-retry',
  },
  workers: process.env.CI ? 1 : undefined,
})
