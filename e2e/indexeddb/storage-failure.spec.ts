import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

let bundleDirectory: string
let harnessSource: string

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-storage-failure-'),
  )
  const bundlePath = path.join(bundleDirectory, 'harness.js')
  execFileSync('bun', [
    'build',
    'e2e/support/storage-failure-browser-harness.ts',
    `--outfile=${bundlePath}`,
    '--target=browser',
    '--format=iife',
    '--define',
    'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
    '--define',
    'process.env.NODE_ENV="production"',
  ])
  harnessSource = await readFile(bundlePath, 'utf8')
})

test.afterAll(async () => {
  if (bundleDirectory) {
    await rm(bundleDirectory, { force: true, recursive: true })
  }
})

const initializePage = async (page: Page) => {
  const diagnostics: string[] = []
  page.on('console', (message) => diagnostics.push(message.text()))
  page.on('pageerror', (error) => diagnostics.push(error.message))
  await page.route('https://tabbin.test/**', async (route) => {
    const script = new URL(route.request().url()).pathname === '/harness.js'
    await route.fulfill({
      body: script
        ? harnessSource
        : '<!doctype html><title>Storage failure</title><script src="/harness.js"></script>',
      contentType: script ? 'application/javascript' : 'text/html',
    })
  })
  await page.goto('https://tabbin.test/storage-failure')
  await page.evaluate(
    (name) => window.__initializeStorageFailure(name),
    `storage-failure-${randomUUID()}`,
  )
  return diagnostics
}

const unavailable = {
  errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
  status: 'unavailable',
}
const assertPrivateDiagnostics = (value: unknown) => {
  const text = JSON.stringify(value)
  for (const marker of [
    'private.example.test',
    'Private saved title',
    'Private saved note',
    'Private project title',
    '/profile/',
  ]) {
    expect(text).not.toContain(marker)
  }
}

for (const failure of [
  'missing-api',
  'SecurityError',
  'UnknownError',
] as const) {
  test(`${failure} initialization shows a safe notice until an explicit retry succeeds`, async ({
    page,
  }) => {
    const diagnostics = await initializePage(page)
    const result = await page.evaluate(async (scenario) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'indexedDB',
      )
      const open = IDBFactory.prototype.open
      if (scenario === 'missing-api') {
        Object.defineProperty(globalThis, 'indexedDB', {
          configurable: true,
          value: undefined,
        })
      } else {
        IDBFactory.prototype.open = () => {
          throw new DOMException(
            'Private saved title /profile/private.example.test',
            scenario,
          )
        }
      }
      try {
        const initialized = await window.__storageFailure.initialize()
        const retried = await window.__storageFailure.retry()
        return {
          initialized,
          retried,
          state: window.__storageFailure.recoveryState(),
        }
      } finally {
        IDBFactory.prototype.open = open
        if (descriptor) {
          Object.defineProperty(globalThis, 'indexedDB', descriptor)
        } else {
          Reflect.deleteProperty(globalThis, 'indexedDB')
        }
      }
    }, failure)
    expect(result.initialized).toMatchObject({
      code: 'PERSISTENCE_RECOVERY_REQUIRED',
      status: 'rejected',
    })
    expect(result.retried).toMatchObject({
      code: 'PERSISTENCE_RECOVERY_REQUIRED',
      status: 'rejected',
    })
    expect(result.state).toEqual(unavailable)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Retry', exact: true }),
    ).toBeEnabled()
    assertPrivateDiagnostics([
      result,
      await page.getByRole('alert').textContent(),
      diagnostics,
    ])
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(
      await page.evaluate(() => window.__storageFailure.recoveryState()),
    ).toEqual({ status: 'available' })
  })
}

for (const operation of [
  'save',
  'restore',
  'import',
  'import-replace',
] as const) {
  for (const timing of ['queue', 'abort'] as const) {
    test(`${timing} quota failure during ${operation} rejects, rolls back native writes and offers a safe retry`, async ({
      page,
    }) => {
      const diagnostics = await initializePage(page)
      await page.evaluate(async () => window.__storageFailure.seed())
      const before = await page.evaluate(async () =>
        window.__storageFailure.snapshot(),
      )
      const result = await page.evaluate(
        async ({ action, timing }) => {
          window.__storageFailure.injectQuota(action, timing)
          return window.__storageFailure.run(action)
        },
        { action: operation, timing },
      )
      expect(result.status).toBe('rejected')
      expect(
        await page.evaluate(() => window.__storageFailure.recoveryState()),
      ).toEqual(unavailable)
      await expect(page.getByRole('alert')).toBeVisible()
      const after = await page.evaluate(async () =>
        window.__storageFailure.snapshot(),
      )
      expect(after.savedTabs).toEqual(before.savedTabs)
      expect(after.analyticsViews).toEqual(before.analyticsViews)
      expect(after.conversations).toEqual(before.conversations)
      expect(after.messages).toEqual(before.messages)
      expect(after.revision).toBe(
        before.revision + (operation === 'import-replace' ? 1 : 0),
      )
      // Import may have committed its protective recovery snapshot before the
      // replacement fails. It must still publish no import/restore success.
      const notifications = await page.evaluate(() =>
        window.__storageFailure.notifications(),
      )
      expect(notifications).toEqual(
        operation === 'import-replace'
          ? [expect.objectContaining({ scopes: ['recoverySnapshots'] })]
          : [],
      )
      assertPrivateDiagnostics([
        result,
        await page.getByRole('alert').textContent(),
        diagnostics,
      ])
      await page.evaluate(() => window.__storageFailure.clearFault())
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(page.getByRole('alert')).toHaveCount(0)
      // Retry reopens and verifies storage. It never replays a failed mutation.
      const verified = await page.evaluate(async () =>
        window.__storageFailure.snapshot(),
      )
      expect(verified.savedTabs).toEqual(before.savedTabs)
      expect(
        await page.evaluate(
          async (action) => window.__storageFailure.run(action),
          operation,
        ),
      ).toEqual({ status: 'fulfilled' })
      const committed = await page.evaluate(async () =>
        window.__storageFailure.snapshot(),
      )
      expect(committed.savedTabs.urls).toHaveLength(
        operation === 'save' ? 3 : 1,
      )
    })
  }
}
