import type { BrowserContext, Page, Worker } from '@playwright/test'

import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const currentWorker = async (
  context: BrowserContext,
  workerUrl: string,
): Promise<Worker> => {
  let current: Worker | undefined
  // Wait for one registry observation that also has a fresh execution realm.
  // A retained target is valid; a transient stale/overlapping view is not ready.
  await expect(async () => {
    const workers = context
      .serviceWorkers()
      .filter((worker) => worker.url() === workerUrl)
    expect(workers).toHaveLength(1)
    const [worker] = workers
    if (!worker) {
      throw new Error('The restarted extension worker is unavailable.')
    }
    expect(
      await worker.evaluate(() =>
        Reflect.get(globalThis, '__tabbinWorkerLifetimeMarker'),
      ),
    ).toBeUndefined()
    current = worker
  }).toPass({ timeout: 5_000 })
  if (!current) {
    throw new Error('The restarted extension worker is unavailable.')
  }
  return current
}

const stopWorker = async (
  extensionContext: BrowserContext,
  page: Page,
  serviceWorker: Worker,
) => {
  const cdp = await extensionContext.newCDPSession(page)
  let versionId: string | undefined
  let workerStatus: string | undefined
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    const version = versions.find(
      ({ scriptURL }) => scriptURL === serviceWorker.url(),
    )
    if (version) {
      versionId = version.versionId
      workerStatus = version.runningStatus
    }
  })
  await cdp.send('ServiceWorker.enable')
  await expect.poll(() => versionId).toBeDefined()
  if (!versionId) {
    throw new Error('The live MV3 service worker version was not found.')
  }
  await cdp.send('ServiceWorker.stopWorker', { versionId })
  // Chromium can retain the debugging target while destroying its execution
  // realm. Worker.close is not the service worker lifecycle completion signal.
  await expect.poll(() => workerStatus).toBe('stopped')

  return cdp
}

test('MV3 worker restart preserves a committed delete and accepts the next background write', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('restart-domain', 'restart.test', 1),
      ],
      groups: [],
      memberships: [
        createMembershipFixture('restart-domain', 'before-restart', 1),
        createMembershipFixture('restart-domain', 'after-restart', 1, 1),
      ],
      urls: [
        createUrlFixture(
          'before-restart',
          'https://restart.test/before',
          'Before worker restart',
          1,
        ),
        createUrlFixture(
          'after-restart',
          'https://restart.test/after',
          'After worker restart',
          1,
        ),
      ],
    },
    storage: createBaseSeed(),
  })
  await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
  await expect(page.getByText('Before worker restart')).toBeVisible()
  await expect(page.getByText('After worker restart')).toBeVisible()
  const observer = await extensionContext.newPage()
  const options = await extensionContext.newPage()
  await observer.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
  await options.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(observer.getByText('After worker restart')).toBeVisible()
  await expect(options.getByRole('button', { name: /export/i })).toBeVisible()
  expect(
    await page.evaluate(async () =>
      chrome.runtime.sendMessage({
        action: 'removeUrlFromStorage',
        url: 'https://restart.test/before',
      }),
    ),
  ).toEqual({ status: 'removed' })
  const committed = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  expect(committed.revision).toBe(2)
  expect(committed.urls).toMatchObject([{ id: 'after-restart' }])
  expect(committed.memberships).toMatchObject([{ urlId: 'after-restart' }])
  await expect(page.getByText('Before worker restart')).toBeHidden()

  await serviceWorker.evaluate(() => {
    Object.assign(globalThis, { __tabbinWorkerLifetimeMarker: 'before-stop' })
  })
  expect(
    await serviceWorker.evaluate(() =>
      Reflect.get(globalThis, '__tabbinWorkerLifetimeMarker'),
    ),
  ).toBe('before-stop')
  const cdp = await stopWorker(extensionContext, page, serviceWorker)

  // A real message wakes the stopped extension worker. The page connection
  // remains open and the marker proves the worker execution realm was replaced.
  expect(
    await page.evaluate(async () =>
      chrome.runtime.sendMessage({ action: 'getAlarmStatus' }),
    ),
  ).toMatchObject({ exists: expect.any(Boolean) })
  const restartedWorker = await currentWorker(
    extensionContext,
    serviceWorker.url(),
  )
  expect(await readPersistenceV2SavedTabsSnapshot(restartedWorker)).toEqual(
    committed,
  )
  expect(
    await page.evaluate(async () =>
      chrome.runtime.sendMessage({
        action: 'removeUrlFromStorage',
        url: 'https://restart.test/after',
      }),
    ),
  ).toEqual({ status: 'removed' })
  const afterRestart = await readPersistenceV2SavedTabsSnapshot(restartedWorker)
  expect(afterRestart.revision).toBe(3)
  expect(afterRestart.collections).toEqual([])
  expect(afterRestart.memberships).toEqual([])
  expect(afterRestart.urls).toEqual([])
  await expect(page.getByText('After worker restart')).toBeHidden()
  await expect(observer.getByText('After worker restart')).toBeHidden()
  await expect(options.getByRole('button', { name: /export/i })).toBeVisible()
  await cdp.detach()
})
