import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

let bundleDirectory: string
let harnessSource: string

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-concurrent-persistence-'),
  )
  const bundlePath = path.join(bundleDirectory, 'harness.js')
  execFileSync('bun', [
    'build',
    'e2e/support/concurrent-persistence-browser-harness.ts',
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

const initializePage = async (page: Page, databaseName: string) => {
  await page.goto('https://tabbin.test/concurrent-persistence')
  await page.evaluate((name) => {
    window.__initializeTabbinConcurrentPersistence(name)
  }, databaseName)
}

const createWriters = async (context: BrowserContext) => {
  await context.route('https://tabbin.test/**', async (route) => {
    const script = new URL(route.request().url()).pathname === '/harness.js'
    await route.fulfill({
      body: script
        ? harnessSource
        : '<!doctype html><title>Concurrent persistence</title><script src="/harness.js"></script>',
      contentType: script ? 'application/javascript' : 'text/html',
    })
  })
  const databaseName = `tabbin-concurrent-${randomUUID()}`
  const first = await context.newPage()
  const second = await context.newPage()
  await initializePage(first, databaseName)
  await initializePage(second, databaseName)
  return { databaseName, first, second }
}

const snapshot = async (page: Page) =>
  page.evaluate(async () => window.__tabbinConcurrentPersistence.snapshot())

const waitForHeldWrite = async (page: Page) => {
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.__tabbinConcurrentPersistence.writeReachedBarrier(),
      ),
    )
    .toBe(true)
}

test('separate browser pages reject stale writes and retain a fresh retry after writer restart', async ({
  context,
}) => {
  // Two pages are distinct JavaScript/IDB connection contexts sharing one origin.
  const { databaseName, first, second } = await createWriters(context)
  const projectId = await first.evaluate(async () =>
    window.__tabbinConcurrentPersistence.createProject(),
  )
  const startHeldWrite = async (page: Page, url: string) => {
    await page.evaluate(
      ({ id, url }) => {
        const harness = window.__tabbinConcurrentPersistence
        harness.holdNextWrite()
        harness.startAddUrl(id, url)
      },
      { id: projectId, url },
    )
    await waitForHeldWrite(page)
  }
  await startHeldWrite(first, 'https://concurrent.test/first')
  await startHeldWrite(second, 'https://concurrent.test/second')
  await first.evaluate(() =>
    window.__tabbinConcurrentPersistence.releaseWrite(),
  )
  expect(
    await first.evaluate(async () =>
      window.__tabbinConcurrentPersistence.finishWrite(),
    ),
  ).toEqual({ status: 'committed' })
  const committed = await snapshot(first)
  expect(committed.revision).toBe(2)
  expect(committed.savedTabs.urls.map(({ url }) => url)).toEqual([
    'https://concurrent.test/first',
  ])

  await second.evaluate(() =>
    window.__tabbinConcurrentPersistence.releaseWrite(),
  )
  expect(
    await second.evaluate(async () =>
      window.__tabbinConcurrentPersistence.finishWrite(),
    ),
  ).toEqual({
    actualRevision: 2,
    expectedRevision: 1,
    name: 'PersistenceRevisionConflictError',
    status: 'rejected',
  })
  expect(await snapshot(second)).toEqual(committed)

  await second.evaluate(async (id) => {
    await window.__tabbinConcurrentPersistence.addUrl(
      id,
      'https://concurrent.test/second',
    )
  }, projectId)
  const retried = await snapshot(second)
  expect(retried.revision).toBe(3)
  expect(retried.savedTabs.urls.map(({ url }) => url).toSorted()).toEqual([
    'https://concurrent.test/first',
    'https://concurrent.test/second',
  ])
  expect(retried.savedTabs.memberships).toHaveLength(2)
  expect(retried.integrity).toMatchObject({ isHealthy: true, issues: [] })
  await expect
    .poll(async () =>
      first.evaluate(() =>
        window.__tabbinConcurrentPersistence
          .events()
          .map(({ revision }) => revision)
          .toSorted((left, right) => left - right),
      ),
    )
    .toEqual([1, 2, 3])

  await first.close()
  const restarted = await context.newPage()
  await initializePage(restarted, databaseName)
  expect(await snapshot(restarted)).toEqual(retried)
  await restarted.evaluate(async (id) => {
    await window.__tabbinConcurrentPersistence.addUrl(
      id,
      'https://concurrent.test/after-restart',
    )
  }, projectId)
  const afterRestart = await snapshot(second)
  expect(afterRestart.revision).toBe(4)
  expect(afterRestart.savedTabs.urls).toHaveLength(3)
  expect(afterRestart.savedTabs.memberships).toHaveLength(3)
  expect(afterRestart.integrity).toMatchObject({ isHealthy: true, issues: [] })
})

test('native transaction failure rolls back every store and revision before an application retry', async ({
  context,
}) => {
  const { first, second } = await createWriters(context)
  const projectId = await first.evaluate(async () =>
    window.__tabbinConcurrentPersistence.createProject(),
  )
  const before = await snapshot(second)
  expect(
    await first.evaluate(async () =>
      window.__tabbinConcurrentPersistence.failAtomicWrite(),
    ),
  ).toEqual({ name: 'ConstraintError', status: 'rejected' })
  expect(await snapshot(second)).toEqual(before)
  await first.evaluate(async (id) => {
    await window.__tabbinConcurrentPersistence.addUrl(
      id,
      'https://concurrent.test/retried',
    )
  }, projectId)
  const after = await snapshot(second)
  expect(after.revision).toBe(2)
  expect(after.savedTabs.collections).toEqual(
    before.savedTabs.collections.map((collection) => ({
      ...collection,
      updatedAt: after.savedTabs.collections[0]?.updatedAt,
    })),
  )
  expect(after.savedTabs.urls.map(({ url }) => url)).toEqual([
    'https://concurrent.test/retried',
  ])
  expect(after.savedTabs.memberships).toHaveLength(1)
  expect(after.integrity).toMatchObject({ isHealthy: true, issues: [] })
  await expect
    .poll(async () =>
      second.evaluate(() =>
        window.__tabbinConcurrentPersistence
          .events()
          .map(({ revision }) => revision)
          .toSorted((left, right) => left - right),
      ),
    )
    .toEqual([1, 2])
})
