import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedPersistenceV2SavedTabs,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

test('a real expiration alarm wakes a stopped MV3 worker and removes only expired non-favorite URLs', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  const now = Date.now()
  const old = now - 2 * 86_400_000
  const reminderSettings = {
    ...defaultReviewReminderSettings,
    enabled: true,
    quietHoursEnabled: false,
  }
  const createPersistence = (expiringSavedAt: number) => ({
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
        now,
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
      userSettings: { ...defaultUserSettings, autoDeletePeriod: '1day' },
      reviewReminderSettings: reminderSettings,
    }),
    // The startup check may run while arranging the test. Make the target old
    // only after the worker has actually stopped.
    persistence: createPersistence(now),
  })
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async () => {
        const expiration = await chrome.alarms.get('checkExpiredTabs')
        const review = await chrome.alarms.get('reviewSavedTabs')
        const storage = await chrome.storage.local.get(
          'reviewReminderAlarmTimeZone',
        )
        return (
          expiration?.periodInMinutes === 0.5 &&
          review !== undefined &&
          storage.reviewReminderAlarmTimeZone ===
            Intl.DateTimeFormat().resolvedOptions().timeZone
        )
      }),
    )
    .toBe(true)
  const notification = { settings: reminderSettings, reviewAt: now }
  await serviceWorker.evaluate(async (value) => {
    await chrome.storage.local.set({ reviewReminderNotification: value })
  }, notification)
  const settingsBefore = await readStorage(page, [
    'userSettings',
    'reviewReminderSettings',
    'reviewReminderNotification',
  ])
  const reviewAlarmBefore = await page.evaluate(async () =>
    chrome.alarms.get('reviewSavedTabs'),
  )
  const notificationsBefore = await page.evaluate(async () =>
    chrome.notifications.getAll(),
  )

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
    await seedPersistenceV2SavedTabs(page, createPersistence(old))
    const before = await readPersistenceV2SavedTabsSnapshot(page)
    expect(before.urls).toHaveLength(3)
    expect(workerRunning).toBe(false)

    // Only arm after the worker is stopped and the expired rows are committed.
    // The inert page can use the native API without waking the worker itself.
    const armedAlarm = await page.evaluate(async () => {
      await chrome.alarms.create('checkExpiredTabs', {
        when: Date.now() + 3_000,
        periodInMinutes: 0.5,
      })
      return chrome.alarms.get('checkExpiredTabs')
    })
    expect(armedAlarm?.periodInMinutes).toBe(0.5)

    await expect.poll(() => workerRunning, { timeout: 10_000 }).toBe(true)
    await currentWorker(extensionContext, serviceWorker.url())
    await expect
      .poll(async () => readPersistenceV2SavedTabsSnapshot(page))
      .toEqual({
        ...before,
        memberships: before.memberships.filter(
          ({ urlId }) => urlId !== 'alarm-expired',
        ),
        revision: 2,
        urls: before.urls.filter(({ id }) => id !== 'alarm-expired'),
      })
    expect(
      await readStorage(page, [
        'userSettings',
        'reviewReminderSettings',
        'reviewReminderNotification',
      ]),
    ).toEqual(settingsBefore)
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
