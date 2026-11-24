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
const createUserSettings = (autoDeletePeriod: '1day' | 'never') =>
  normalizeUserSettingsForStorage({
    ...defaultSettings,
    autoDeletePeriod,
    language: 'en',
    showOpenTabs: false,
  })

test('a real expiration alarm wakes a stopped MV3 worker and removes only expired non-favorite URLs', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
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
    ],
    urls: [
      createUrlFixture(
        'alarm-expired',
        'https://alarm.test/expired',
        'Expired saved URL',
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
    expect(before.urls).toHaveLength(3)
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
        ({ urlId }) => urlId !== 'alarm-expired',
      ),
      revision: 2,
      urls: before.urls.filter(({ id }) => id !== 'alarm-expired'),
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
  } finally {
    await cdp.detach()
  }
})
