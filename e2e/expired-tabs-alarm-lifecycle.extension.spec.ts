import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import {
  defaultSettings,
  normalizeUserSettingsForStorage,
} from '@/lib/storage/settings'
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
  readStorage,
  seedPersistenceV2SavedTabs,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

const DAY_MS = 86_400_000
const expiringIds = new Set(['alarm-expired', 'alarm-expired-2'])
const createUserSettings = (autoDeletePeriod: '1day' | 'never') =>
  normalizeUserSettingsForStorage({
    ...defaultSettings,
    autoDeletePeriod,
    language: 'en',
    showOpenTabs: false,
  })

test('@release-expiry-recovery a real expiration alarm wakes a stopped MV3 worker and makes expired non-favorite URLs recoverable', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  const now = Date.now()
  const old = now - 2 * DAY_MS
  const reminderSettings = {
    ...defaultReviewReminderSettings,
    enabled: true,
    quietHoursEnabled: false,
  }
  const createPersistence = (expiringSavedAt: number, freshSavedAt = now) => ({
    categories: [],
    collections: [
      createDomainCollectionFixture('alarm-domain', 'alarm.test', now),
    ],
    groups: [],
    memberships: [
      createMembershipFixture('alarm-domain', 'alarm-expired', now),
      createMembershipFixture('alarm-domain', 'alarm-fresh', now, 1),
      createMembershipFixture('alarm-domain', 'alarm-favorite', now, 2),
      createMembershipFixture('alarm-domain', 'alarm-expired-2', now, 3),
    ],
    urls: [
      createUrlFixture(
        'alarm-expired',
        'https://alarm.test/expired',
        'Expired saved URL',
        expiringSavedAt,
      ),
      createUrlFixture(
        'alarm-expired-2',
        'https://alarm.test/expired-2',
        'Second expired URL',
        expiringSavedAt,
      ),
      createUrlFixture(
        'alarm-fresh',
        'https://alarm.test/fresh',
        'Fresh saved URL',
        freshSavedAt,
      ),
      {
        ...createUrlFixture(
          'alarm-favorite',
          'https://alarm.test/favorite',
          'Favorite saved URL',
          old,
        ),
        isFavorite: true,
      },
    ],
  })

  // Keep only an inert extension document. App scripts and runtime messages
  // must not wake the worker before the native alarm does.
  await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
  await Promise.all(
    extensionContext
      .pages()
      .filter((otherPage) => otherPage !== page)
      .map(async (otherPage) => {
        await otherPage.close()
      }),
  )
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({
      reviewReminderSettings: reminderSettings,
      userSettings: createUserSettings('never'),
    }),
    // The startup check may run while arranging the test. Make the target old
    // only after the worker has actually stopped.
    persistence: createPersistence(now),
  })
  const readExpiryAlarm = async () =>
    page.evaluate(async () => chrome.alarms.get('checkExpiredTabs'))
  const setAutoDeletePeriod = async (period: '1day' | 'never') =>
    page.evaluate(async (userSettings) => {
      await chrome.storage.local.set({ userSettings })
    }, createUserSettings(period))
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async () => {
        const review = await chrome.alarms.get('reviewSavedTabs')
        const storage = await chrome.storage.local.get(
          'reviewReminderAlarmTimeZone',
        )
        return (
          review !== undefined &&
          storage.reviewReminderAlarmTimeZone ===
            Intl.DateTimeFormat().resolvedOptions().timeZone
        )
      }),
    )
    .toBe(true)
  await expect.poll(readExpiryAlarm).toBeUndefined()
  const notification = { settings: reminderSettings, reviewAt: now }
  await serviceWorker.evaluate(async (value) => {
    await chrome.storage.local.set({ reviewReminderNotification: value })
  }, notification)
  const reminderKeys = ['reviewReminderSettings', 'reviewReminderNotification']
  const reminderBefore = await readStorage(page, reminderKeys)
  const reviewAlarmBefore = await page.evaluate(async () =>
    chrome.alarms.get('reviewSavedTabs'),
  )
  const notificationsBefore = await page.evaluate(async () =>
    chrome.notifications.getAll(),
  )
  await setAutoDeletePeriod('1day')
  await expect
    .poll(async () => (await readExpiryAlarm())?.periodInMinutes)
    .toBe(0.5)
  const activeSettings = await readStorage(page, ['userSettings'])

  // Remove the periodic wake before stopping, so setup has no alarm deadline.
  await serviceWorker.evaluate(async () => {
    await chrome.alarms.clear('checkExpiredTabs')
    Object.assign(globalThis, { __tabbinWorkerLifetimeMarker: 'before-stop' })
  })
  const cdp = await stopWorker(extensionContext, page, serviceWorker)
  try {
    let workerRunning = false
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      if (
        versions.some(
          ({ scriptURL, runningStatus }) =>
            scriptURL === serviceWorker.url() && runningStatus === 'running',
        )
      ) {
        workerRunning = true
      }
    })
    // This is direct IndexedDB access from the inert document; it does not
    // dispatch a browser extension event that could wake the stopped worker.
    const cutoff = Date.now() - DAY_MS
    await seedPersistenceV2SavedTabs(
      page,
      createPersistence(cutoff - 1_000, cutoff + 60_000),
    )
    const before = await readPersistenceV2SavedTabsSnapshot(page)
    expect(before.urls).toHaveLength(4)
    expect(workerRunning).toBe(false)

    // Only arm after the worker is stopped and the expired rows are committed.
    // The inert page can use the native API without waking the worker itself.
    const armedAlarm = await page.evaluate(async () => {
      await chrome.alarms.create('checkExpiredTabs', {
        when: Date.now() + 3_000,
      })
      return chrome.alarms.get('checkExpiredTabs')
    })
    expect(armedAlarm?.name).toBe('checkExpiredTabs')
    expect(armedAlarm?.periodInMinutes).toBeUndefined()

    await expect.poll(() => workerRunning, { timeout: 10_000 }).toBe(true)
    await currentWorker(extensionContext, serviceWorker.url())
    await expect
      .poll(async () => (await readExpiryAlarm())?.periodInMinutes)
      .toBe(0.5)
    const after = {
      ...before,
      memberships: before.memberships.filter(
        ({ urlId }) => !expiringIds.has(urlId),
      ),
      revision: 2,
      urls: before.urls.filter(({ id }) => !expiringIds.has(id)),
    }
    await expect
      .poll(async () => readPersistenceV2SavedTabsSnapshot(page))
      .toEqual(after)
    expect(await readStorage(page, ['userSettings'])).toEqual(activeSettings)

    await setAutoDeletePeriod('never')
    await expect.poll(readExpiryAlarm).toBeUndefined()
    expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual(after)
    expect(await readStorage(page, reminderKeys)).toEqual(reminderBefore)
    expect(
      await page.evaluate(async () => chrome.alarms.get('reviewSavedTabs')),
    ).toEqual(reviewAlarmBefore)
    expect(
      await page.evaluate(async () => chrome.notifications.getAll()),
    ).toEqual(notificationsBefore)

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await expect(page.getByText('Fresh saved URL')).toBeVisible()
    await expect(page.getByText('Expired saved URL')).toHaveCount(0)

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/periodic-execution'),
    )
    await page.reload()
    const recovery = page.getByRole('region', { name: 'Recover expired tabs' })
    const expiredRow = recovery.getByRole('listitem', {
      name: 'Expired saved URL',
    })
    await expect(expiredRow).toBeVisible()
    await expect(
      recovery.getByText('2 saved tabs available to restore'),
    ).toBeVisible()
    await expect(expiredRow.getByText('Removed on')).toBeVisible()
    await expect(expiredRow.getByText('Restore by')).toBeVisible()
    await expect(
      expiredRow.getByText('alarm.test', { exact: true }),
    ).toBeVisible()
    const screenshot = testInfo.outputPath('expired-url-recovery.png')
    await recovery.screenshot({ path: screenshot })
    await testInfo.attach('expired-url-recovery', {
      contentType: 'image/png',
      path: screenshot,
    })

    await page.setViewportSize({ height: 812, width: 375 })
    await page.reload()
    await expect(recovery.getByText('Expired saved URL')).toBeVisible()
    await expect
      .poll(async () =>
        recovery.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true)
    const narrowScreenshot = testInfo.outputPath(
      'expired-url-recovery-narrow.png',
    )
    await recovery.screenshot({ path: narrowScreenshot })
    await testInfo.attach('expired-url-recovery-narrow', {
      contentType: 'image/png',
      path: narrowScreenshot,
    })

    await recovery
      .getByRole('button', { name: 'Restore all', exact: true })
      .click()
    await expect(
      recovery.getByText('No expired tabs to restore.'),
    ).toBeVisible()
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    await expect(undo).toBeVisible()
    const undoScreenshot = testInfo.outputPath('issue-922-restore-undo.png')
    await page.screenshot({ path: undoScreenshot, animations: 'disabled' })
    await testInfo.attach('restore-undo', {
      path: undoScreenshot,
      contentType: 'image/png',
    })
    await undo.click()
    await expect(expiredRow).toBeVisible()
    await expect(recovery.getByText('Second expired URL')).toBeVisible()
    expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual({
      ...after,
      revision: expect.any(Number),
    })
    await recovery
      .getByRole('button', { name: 'Restore Expired saved URL' })
      .click()
    await expect(
      recovery.getByText('1 saved tab available to restore'),
    ).toBeVisible()
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await expect(page.getByText('Expired saved URL')).toBeVisible()
  } finally {
    await cdp.detach()
  }
})
