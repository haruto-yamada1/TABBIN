import { execFile, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { chromium, expect, firefox, test as base } from '@playwright/test'
import type { BrowserServer, Page } from '@playwright/test'

type LargeBackupScenario = Parameters<Window['__largeBackup']['run']>[0]

const executeFile = promisify(execFile)
let bundleDirectory: string
let harnessSource: string

const readProcessTreeRss = async (rootPid: number): Promise<number> => {
  const { stdout } = await executeFile('ps', ['-axo', 'pid=,ppid=,rss='])
  const rows = stdout
    .trim()
    .split('\n')
    .map((line) => {
      const [pid = 0, parent = 0, rss = 0] = line
        .trim()
        .split(/\s+/u)
        .map(Number)
      return { parent, pid, rss }
    })
  const descendants = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (descendants.has(row.parent) && !descendants.has(row.pid)) {
        descendants.add(row.pid)
        changed = true
      }
    }
  }
  return rows.reduce(
    (sum, row) => sum + (descendants.has(row.pid) ? row.rss * 1024 : 0),
    0,
  )
}

const test = base.extend<{ browserPid: number; server: BrowserServer }>({
  // A dedicated browser tree lets both engines use the same OS RSS metric.
  server: async ({ browserName }, provide) => {
    const browserType = browserName === 'firefox' ? firefox : chromium
    const server = await browserType.launchServer()
    try {
      await provide(server)
    } finally {
      await server.close()
    }
  },
  page: async ({ server, browserName }, provide) => {
    const browserType = browserName === 'firefox' ? firefox : chromium
    const browser = await browserType.connect(server.wsEndpoint())
    try {
      await provide(await browser.newPage())
    } finally {
      await browser.close()
    }
  },
  browserPid: async ({ server }, provide) => {
    const pid = server.process().pid
    if (pid === undefined) {
      throw new Error('The measurement browser has no process identifier.')
    }
    await provide(pid)
  },
})

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-large-backup-'),
  )
  const bundlePath = path.join(bundleDirectory, 'harness.js')
  execFileSync('bun', [
    'build',
    'e2e/support/large-backup-browser-harness.ts',
    `--outfile=${bundlePath}`,
    '--target=browser',
    '--format=iife',
    '--define',
    'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
  ])
  harnessSource = await readFile(bundlePath, 'utf8')
})

test.afterAll(async () => {
  if (bundleDirectory) {
    await rm(bundleDirectory, { force: true, recursive: true })
  }
})

const initialize = async (page: Page) => {
  const diagnostics: string[] = []
  page.on('console', (message) => diagnostics.push(message.text()))
  page.on('pageerror', (error) => diagnostics.push(error.message))
  await page.route('https://tabbin.test/**', async (route) => {
    const script = new URL(route.request().url()).pathname === '/harness.js'
    await route.fulfill({
      body: script
        ? harnessSource
        : '<!doctype html><title>Large backup</title><script src="/harness.js"></script>',
      contentType: script ? 'application/javascript' : 'text/html',
    })
  })
  await page.goto('https://tabbin.test/large-backup')
  await page.evaluate(
    (name) => window.__initializeLargeBackup(name),
    `large-backup-${randomUUID()}`,
  )
  await page.evaluate(async () => window.__largeBackup.seed())
  return diagnostics
}

const measure = async (
  page: Page,
  pid: number,
  scenario: LargeBackupScenario,
  overwrite = false,
  abort = false,
) => {
  const baselineRssBytes = await readProcessTreeRss(pid)
  let peakRssBytes = baselineRssBytes
  let samples = 0
  const sampling = new AbortController()
  const sampler = async () => {
    while (!sampling.signal.aborted) {
      // eslint-disable-next-line no-await-in-loop -- sample sequentially to avoid overlapping ps processes
      peakRssBytes = Math.max(peakRssBytes, await readProcessTreeRss(pid))
      samples += 1
      // eslint-disable-next-line no-await-in-loop -- periodic measurement, not parallel work
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  const samplingPromise = sampler()
  try {
    const outcome = await page.evaluate(
      async ({ scenario, overwrite, abort }) =>
        window.__largeBackup.run(scenario, overwrite, abort),
      { abort, overwrite, scenario },
    )
    expect(baselineRssBytes).toBeGreaterThan(0)
    expect(samples).toBeGreaterThan(0)
    return {
      ...outcome,
      memory: { baselineRssBytes, peakRssBytes, samples },
      runtime: {
        browserVersion: page.context().browser()?.version(),
        nodeVersion: process.version,
        platform: os.platform(),
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model,
        totalMemoryBytes: os.totalmem(),
      },
    }
  } finally {
    sampling.abort()
    await samplingPromise
  }
}

test('reads and validates a real file one byte below the serialized limit', async ({
  page,
  browserPid,
}, testInfo) => {
  const diagnostics = await initialize(page)
  const before = await page.evaluate(async () =>
    window.__largeBackup.snapshot(),
  )
  const result = await measure(page, browserPid, 'near-byte-limit')
  const limit = await page.evaluate(
    () => window.__largeBackup.limits.maxSerializedBytes,
  )
  expect(result).toMatchObject({
    bytes: limit - 1,
    counts: { memberships: 128, urls: 128 },
    status: 'fulfilled',
  })
  expect(
    await page.evaluate(async () => window.__largeBackup.snapshot()),
  ).toEqual(before)
  expect(diagnostics).toEqual([])
  await testInfo.attach('large-backup-measurement', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  })
})

for (const [scenario, code, phase] of [
  ['too-many-urls', 'BACKUP_RESOURCE_LIMIT_EXCEEDED', 'resource'],
  ['truncated', 'INVALID_BACKUP', 'parse-schema'],
  ['invalid-structure', 'INVALID_BACKUP', 'parse-schema'],
] as const) {
  test(`${scenario} rejects a large input without changing persisted data`, async ({
    page,
    browserPid,
  }, testInfo) => {
    const diagnostics = await initialize(page)
    const before = await page.evaluate(async () =>
      window.__largeBackup.snapshot(),
    )
    const result = await measure(page, browserPid, scenario, true)
    expect(result).toMatchObject({ code, phase, status: 'rejected' })
    expect(
      await page.evaluate(async () => window.__largeBackup.snapshot()),
    ).toEqual(before)
    expect(
      await page.evaluate(() => window.__largeBackup.notifications()),
    ).toEqual([])
    expect(JSON.stringify([result, diagnostics])).not.toContain(
      'private-backup-marker',
    )
    expect(JSON.stringify([result, diagnostics])).not.toContain(
      'backup.example.test',
    )
    await testInfo.attach('large-backup-measurement', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    })
  })
}

test('imports 100,000 URLs with verified readback and reopens native storage', async ({
  page,
  browserPid,
}, testInfo) => {
  // Native 100k-record replacement/readback measured 8-13 seconds locally.
  test.slow()
  const diagnostics = await initialize(page)
  const result = await measure(page, browserPid, 'url-limit', true)
  expect(result).toMatchObject({
    counts: { memberships: 100_000, urls: 100_000 },
    status: 'fulfilled',
  })
  const persisted = await page.evaluate(async () => {
    const snapshot = await window.__largeBackup.snapshot()
    return {
      counts: {
        memberships: snapshot.savedTabs.memberships.length,
        urls: snapshot.savedTabs.urls.length,
      },
      first: snapshot.savedTabs.urls[0]?.id,
      last: snapshot.savedTabs.urls.at(-1)?.id,
      integrity: snapshot.integrity,
      revision: snapshot.revision,
      showSavedTime: snapshot.settings.showSavedTime,
    }
  })
  expect(persisted).toMatchObject({
    counts: { memberships: 100_000, urls: 100_000 },
    integrity: { isHealthy: true, issues: [] },
    showSavedTime: false,
  })
  expect(persisted).toMatchObject({ first: 'url-0', last: 'url-99999' })
  expect(diagnostics).toEqual([])
  await testInfo.attach('large-backup-measurement', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  })
})

test('aborts after 5,000 native URL writes, restores all data and supports an explicit retry', async ({
  page,
  browserPid,
}, testInfo) => {
  // Abort + recovery + an explicit 100k-record retry measured 27 seconds locally.
  test.slow()
  const diagnostics = await initialize(page)
  const before = await page.evaluate(async () =>
    window.__largeBackup.snapshot(),
  )
  const result = await measure(page, browserPid, 'url-limit', true, true)
  expect(result).toMatchObject({
    aborted: true,
    code: 'PERSISTENCE_REPLACEMENT_FAILED',
    completedUrlWrites: 5_002,
    phase: 'overwrite',
    status: 'rejected',
  })
  const rolledBack = await page.evaluate(() =>
    window.__largeBackup.failedReplacementSnapshot(),
  )
  expect(rolledBack).toEqual({
    analyticsViews: before.analyticsViews,
    conversations: before.conversations,
    messages: before.messages,
    savedTabs: before.savedTabs,
    revision: before.revision + 1,
  })
  const after = await page.evaluate(async () => window.__largeBackup.snapshot())
  expect(after.savedTabs).toEqual(before.savedTabs)
  expect(after.analyticsViews).toEqual(before.analyticsViews)
  expect(after.conversations).toEqual(before.conversations)
  expect(after.messages).toEqual(before.messages)
  expect(after.settings).toEqual(before.settings)
  expect(after.revision).toBe(before.revision + 2)
  expect(after.integrity).toEqual(before.integrity)
  const events = await page.evaluate(() => window.__largeBackup.notifications())
  expect(events).toEqual([
    expect.objectContaining({
      revision: before.revision + 1,
      scopes: ['recoverySnapshots'],
    }),
    expect.objectContaining({ revision: before.revision + 2 }),
  ])
  expect(JSON.stringify([result, diagnostics, events])).not.toContain(
    'private-backup-marker',
  )
  expect(JSON.stringify([result, diagnostics, events])).not.toContain(
    'backup.example.test',
  )
  expect(
    await page.evaluate(async () =>
      window.__largeBackup.run('url-limit', true),
    ),
  ).toMatchObject({ status: 'fulfilled' })
  expect(
    await page.evaluate(
      async () => (await window.__largeBackup.snapshot()).savedTabs.urls.length,
    ),
  ).toBe(100_000)
  await testInfo.attach('large-backup-measurement', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  })
})
