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
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

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
