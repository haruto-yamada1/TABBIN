import { execFile, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { chromium, expect, firefox, test as base } from '@playwright/test'
import type { BrowserServer, Page } from '@playwright/test'

const execute = promisify(execFile)
let bundleDirectory: string
let harnessSource: string

const processTreeRss = async (root: number) => {
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,rss='])
  const processes = stdout
    .trim()
    .split('\n')
    .map((line) => {
      const [pid = 0, parent = 0, kib = 0] = line
        .trim()
        .split(/\s+/u)
        .map(Number)
      return { kib, parent, pid }
    })
  const descendants = new Set([root])
  for (let previous = 0; previous !== descendants.size;) {
    previous = descendants.size
    for (const process of processes) {
      if (descendants.has(process.parent)) {
        descendants.add(process.pid)
      }
    }
  }
  return processes.reduce(
    (bytes, process) =>
      bytes + (descendants.has(process.pid) ? process.kib * 1024 : 0),
    0,
  )
}

const test = base.extend<{
  measurementServer: BrowserServer
  browserPid: number
}>({
  measurementServer: async ({ browserName }, provide) => {
    const engine = browserName === 'firefox' ? firefox : chromium
    const server = await engine.launchServer()
    try {
      await provide(server)
    } finally {
      await server.close()
    }
  },
  page: async ({ measurementServer, browserName }, provide) => {
    const engine = browserName === 'firefox' ? firefox : chromium
    const browser = await engine.connect(measurementServer.wsEndpoint())
    try {
      await provide(await browser.newPage())
    } finally {
      await browser.close()
    }
  },
  browserPid: async ({ measurementServer }, provide) => {
    const pid = measurementServer.process().pid
    if (pid === undefined) {
      throw new Error('The measurement browser has no PID.')
    }
    await provide(pid)
  },
})

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-saved-tabs-read-'),
  )
  const output = path.join(bundleDirectory, 'harness.js')
  execFileSync('bun', [
    'build',
    'e2e/support/saved-tabs-read-browser-harness.ts',
    `--outfile=${output}`,
    '--target=browser',
    '--format=iife',
    '--define',
    'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
  ])
  harnessSource = await readFile(output, 'utf8')
})

test.afterAll(async () => {
  if (bundleDirectory) {
    await rm(bundleDirectory, { recursive: true, force: true })
  }
})

const initialize = async (page: Page, databaseName: string) => {
  await page.goto('https://tabbin.test/saved-tabs-read')
  await page.evaluate(
    (name) => window.__initializeSavedTabsRead(name),
    databaseName,
  )
}

const measure = async (page: Page, browserPid: number, urlCount: number) => {
  const baselineRssBytes = await processTreeRss(browserPid)
  let peakRssBytes = baselineRssBytes
  let samples = 0
  const sampling = new AbortController()
  const sample = async () => {
    while (!sampling.signal.aborted) {
      // eslint-disable-next-line no-await-in-loop -- sampling one dedicated browser tree sequentially
      peakRssBytes = Math.max(peakRssBytes, await processTreeRss(browserPid))
      samples += 1
      // eslint-disable-next-line no-await-in-loop -- measurement interval does not coordinate browser behavior
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  const sampler = sample()
  try {
    const result = await page.evaluate(
      async (count) => window.__savedTabsRead.measure(count),
      urlCount,
    )
    expect(result.queryWrites).toBe(0)
    expect(result.revisionAfter).toBe(result.revisionBefore)
    const median = (values: number[]) => values.toSorted((a, b) => a - b)[1]
    return {
      counts: result.counts,
      timings: {
        pageQueryMs: result.pageQueryMs,
        pageQueryMedianMs: median(result.pageQueryMs),
        projectQueryMs: result.projectQueryMs,
        projectQueryMedianMs: median(result.projectQueryMs),
      },
      memory: { baselineRssBytes, peakRssBytes, samples },
    }
  } finally {
    sampling.abort()
    await sampler
  }
}

const registerReadScenario = (urlCount: number) => {
  test(`${urlCount} saved URLs preserve page and search results across reload without query writes`, async ({
    page,
    browserPid,
  }, testInfo) => {
    const diagnostics: string[] = []
    page.on('pageerror', () => diagnostics.push('pageerror'))
    await page.route('https://tabbin.test/**', async (route) => {
      const script = new URL(route.request().url()).pathname === '/harness.js'
      return route.fulfill({
        body: script
          ? harnessSource
          : '<!doctype html><title>Saved tabs read</title><script src="/harness.js"></script>',
        contentType: script ? 'application/javascript' : 'text/html',
      })
    })
    const databaseName = `saved-tabs-read-${randomUUID()}`
    await initialize(page, databaseName)
    await page.evaluate(
      async (count) => window.__savedTabsRead.seed(count),
      urlCount,
    )
    const initial = await measure(page, browserPid, urlCount)
    expect(initial.counts).toEqual({
      categories: 402,
      domainCollections: 200,
      groups: 20,
      memberships: urlCount + 100,
      projectMemberships: 100,
      searchMatches: 1,
      urls: urlCount,
    })
    expect(initial.memory.baselineRssBytes).toBeGreaterThan(0)
    expect(initial.memory.samples).toBeGreaterThan(0)
    await page.evaluate(() => window.__savedTabsRead.close())
    await page.reload()
    await page.evaluate(
      (name) => window.__initializeSavedTabsRead(name),
      databaseName,
    )
    const reloaded = await measure(page, browserPid, urlCount)
    expect(reloaded.counts).toEqual(initial.counts)
    expect(
      await page.evaluate(async () =>
        window.__savedTabsRead.mutateAndVerifyFresh(),
      ),
    ).toEqual({ queryWrites: 0 })
    expect(diagnostics).toEqual([])
    await testInfo.attach('saved-tabs-read-measurement', {
      body: JSON.stringify({
        initial,
        reloaded,
        runtime: {
          architecture: os.arch(),
          browserVersion: page.context().browser()?.version(),
          nodeVersion: process.version,
          platform: os.platform(),
        },
      }),
      contentType: 'application/json',
    })
  })
}

for (const urlCount of [1_000, 10_000]) {
  registerReadScenario(urlCount)
}
