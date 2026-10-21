import { defineConfig } from '@playwright/test'

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 0,
      scale: 'css',
      threshold: 0.2,
    },
  },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: 'test-results/visual',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report/visual' }],
    ['json', { outputFile: 'test-results/visual-report.json' }],
  ],
  retries: 0,
  snapshotPathTemplate:
    '{testDir}/visual/snapshots/{platform}/{projectName}/{arg}{ext}',
  testDir: './e2e',
  testMatch: '**/visual/*.visual.spec.ts',
  updateSnapshots: 'none',
  use: {
    baseURL: 'http://127.0.0.1:6007',
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'bun run build-storybook --quiet && bunx vite preview --outDir storybook-static --host 127.0.0.1 --port 6007 --strictPort',
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:6007/iframe.html',
  },
  workers: 1,
})
