import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'

import { parseStagedOpeningMeasurements } from './stagedOpeningMeasurementContract'

assert.ok(
  process.versions.bun,
  'Run this measurement with bun tools/scripts/measure-staged-url-opening.ts.',
)
const root = path.resolve(import.meta.dirname, '../..')
const artifact = path.join(root, '.output/chrome-mv3')
assert.ok(
  existsSync(artifact),
  'Run bun run build before measuring native Chrome opening.',
)
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'tabbin-staged-opening-'),
)
const addon = path.join(temporaryRoot, 'addon')
await mkdir(addon)
await cp(artifact, addon, { recursive: true })
const bundle = spawnSync(
  process.execPath,
  [
    'build',
    'e2e/support/staged-url-opening-measurements.ts',
    `--outfile=${path.join(addon, 'measurements.js')}`,
    '--target=browser',
    '--format=iife',
    '--define',
    'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
  ],
  { cwd: root, encoding: 'utf8' },
)
assert.equal(bundle.status, 0, bundle.stderr)
await writeFile(
  path.join(addon, 'measurements.html'),
  '<!doctype html><meta charset="utf-8"><title>Staged opening measurements</title><script src="measurements.js"></script>',
)
const context = await chromium.launchPersistentContext(
  path.join(temporaryRoot, 'profile'),
  {
    channel: 'chromium',
    args: [
      '--enable-unsafe-extension-debugging',
      `--disable-extensions-except=${addon}`,
      `--load-extension=${addon}`,
    ],
  },
)
const timeout = setTimeout(() => {
  console.error('Native Chrome opening measurement exceeded 180 seconds.')
  void context.close()
}, 180_000)
try {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.text().startsWith('[staged-opening]')) {
      console.error(message.text())
    }
  })
  await page.goto(`chrome-extension://${extensionId}/measurements.html`)
  await page.waitForFunction(() =>
    Reflect.has(globalThis, '__tabbinStagedOpeningMeasurements'),
  )
  // Include the installation tab in the baseline before any timed work starts.
  await page.waitForFunction(async () => {
    const installed = await chrome.storage.local.get([
      'changelogShown',
      'seenVersion',
    ])
    return (
      installed.changelogShown &&
      installed.seenVersion === chrome.runtime.getManifest().version &&
      (await chrome.tabs.query({})).some(
        ({ url, pendingUrl, pinned }) =>
          pinned &&
          [url, pendingUrl].some((value) =>
            value?.endsWith('/saved-tabs.html'),
          ),
      )
    )
  })
  const execution: unknown = await page.evaluate(
    'globalThis.__tabbinStagedOpeningMeasurements.runStagedOpeningMeasurements()',
  )
  const results = parseStagedOpeningMeasurements(execution)
  console.log(
    JSON.stringify(
      { browser: 'chromium', version: context.browser()?.version(), results },
      null,
      2,
    ),
  )
} finally {
  clearTimeout(timeout)
  await context.close()
  await rm(temporaryRoot, { force: true, recursive: true })
}
