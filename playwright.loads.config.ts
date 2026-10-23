import { defineConfig } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  testDir: './e2e',
  testMatch: 'initial-loads.benchmark.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  outputDir: '.output/size-report/e2e',
})
