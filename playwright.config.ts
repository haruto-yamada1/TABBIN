import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'storybook',
      testMatch: '**/*.story.spec.ts',
    },
    {
      name: 'extension',
      testMatch: '**/*.extension.spec.ts',
    },
  ],
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
  },
  ...(process.env.CI ? { workers: 1 } : {}),
})
