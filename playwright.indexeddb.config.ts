import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  reporter: process.env.FLAKE_REPORT_PATH
    ? [['line'], ['./tools/testing/playwright-flake-reporter.ts']]
    : 'line',
  testDir: './e2e/indexeddb',
  workers: 1,
})
