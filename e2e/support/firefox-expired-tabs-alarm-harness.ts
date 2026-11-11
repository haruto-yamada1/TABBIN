/* eslint-disable no-restricted-imports -- native Firefox smoke exercises the production alarm against the real default IndexedDB */
import { browser } from 'wxt/browser'

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import type { PersistenceVersionedSavedTabsSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { requireUserSettings } from '@/lib/storage/settings'
import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'
import type { UserSettings } from '@/types/storage'

const EXPIRATION_ALARM = 'checkExpiredTabs'
const SENTINEL_ALARM = 'firefox-expiration-smoke-sentinel'
const EXPIRING_URL_ID = 'firefox-alarm-expired'
const STORAGE_KEYS = [
  'userSettings',
  'reviewReminderSettings',
  'reviewReminderNotification',
]

export type FirefoxExpiredTabsAlarmSmokeResult = {
  readonly alarmFired: boolean
  readonly expiredRemoved: boolean
  readonly freshPreserved: boolean
  readonly favoritePreserved: boolean
  readonly otherAlarmsUnchanged: boolean
  readonly notificationsUnchanged: boolean
  readonly settingsUnchanged: boolean
  readonly restored: boolean
}

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const otherAlarms = async () =>
  (await browser.alarms.getAll())
    .filter(({ name }) => name !== EXPIRATION_ALARM)
    .toSorted((left, right) => left.name.localeCompare(right.name))

const restoreAlarm = async (
  name: string,
  alarm: chrome.alarms.Alarm | undefined,
): Promise<void> => {
  await browser.alarms.clear(name)
  if (alarm) {
    await browser.alarms.create(name, {
      when: alarm.scheduledTime,
      ...(alarm.periodInMinutes === undefined
        ? {}
        : { periodInMinutes: alarm.periodInMinutes }),
    })
  }
}

const waitForExpiration = async (
  readSnapshot: () => Promise<PersistenceVersionedSavedTabsSnapshot>,
  wasAlarmFired: () => boolean,
): Promise<PersistenceVersionedSavedTabsSnapshot> => {
  const deadline = Date.now() + 10_000
  let lastSnapshot: PersistenceVersionedSavedTabsSnapshot | undefined
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- Poll the actual committed IndexedDB state after the native alarm.
    const snapshot = await readSnapshot()
    lastSnapshot = snapshot
    if (
      wasAlarmFired() &&
      !snapshot.savedTabs.urls.some(({ id }) => id === EXPIRING_URL_ID)
    ) {
      return snapshot
    }
    // eslint-disable-next-line no-await-in-loop -- State polling yields between real IndexedDB observations.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })
  }
  throw new Error(
    `Native Firefox expiration alarm did not remove its URL: ${JSON.stringify({
      foregroundAlarmObserved: wasAlarmFired(),
      remainingIds: lastSnapshot?.savedTabs.urls.map(({ id }) => id),
      alarm: await browser.alarms.get(EXPIRATION_ALARM),
      now: Date.now(),
      autoDeletePeriod: (await requireUserSettings()).autoDeletePeriod,
    })}`,
  )
}

/** Exercise the installed background listener; never call the deletion handler. */
export const runFirefoxExpiredTabsAlarmSmoke =
  async (): Promise<FirefoxExpiredTabsAlarmSmokeResult> => {
    const local = getChromeStorageLocal()
    if (!local) {
      throw new Error('Firefox Promise storage API is unavailable.')
    }
    const dataPlane = getBackgroundSavedTabsDataPlane()
    const previousSnapshot = await dataPlane.readUndoSnapshot()
    const previousStorage: Record<string, unknown> =
      await local.get(STORAGE_KEYS)
    const verifiedSettings = await requireUserSettings()
    const previousAlarm = await browser.alarms.get(EXPIRATION_ALARM)
    const previousSentinel = await browser.alarms.get(SENTINEL_ALARM)
    const now = Date.now()
    const old = now - 2 * 86_400_000
    const fresh = createUrlFixture(
      'firefox-alarm-fresh',
      'https://firefox-alarm.example/fresh',
      'Fresh Firefox saved URL',
      now,
    )
    const favorite = {
      ...createUrlFixture(
        'firefox-alarm-favorite',
        'https://firefox-alarm.example/favorite',
        'Favorite Firefox saved URL',
        old,
      ),
      isFavorite: true,
    }
    const fixture = {
      revision: previousSnapshot.revision,
      savedTabs: {
        categories: [],
        collections: [
          createDomainCollectionFixture(
            'firefox-alarm-domain',
            'firefox-alarm.example',
            now,
          ),
        ],
        groups: [],
        memberships: [EXPIRING_URL_ID, fresh.id, favorite.id].map((id, index) =>
          createMembershipFixture('firefox-alarm-domain', id, now, index),
        ),
        urls: [
          createUrlFixture(
            EXPIRING_URL_ID,
            'https://firefox-alarm.example/expired',
            'Expired Firefox saved URL',
            old,
          ),
          fresh,
          favorite,
        ],
      },
    }
    const settings: UserSettings = {
      ...verifiedSettings,
      autoDeletePeriod: '1day',
    }
    const notification = {
      settings: { ...defaultReviewReminderSettings, enabled: true },
      reviewAt: now,
    }
    let alarmFired = false
    const observeAlarm = (alarm: { readonly name: string }) => {
      if (alarm.name === EXPIRATION_ALARM) {
        alarmFired = true
      }
    }
    let result: Omit<FirefoxExpiredTabsAlarmSmokeResult, 'restored'>
    try {
      // The real listener reads only the default database. Replace its saved-tab
      // slice temporarily and restore it before this dedicated profile is closed.
      await local.set({
        userSettings: { ...verifiedSettings, autoDeletePeriod: 'never' },
      })
      await dataPlane.restoreUndoSnapshot(fixture)
      await local.set({
        userSettings: settings,
        reviewReminderNotification: notification,
      })
      await browser.alarms.create(SENTINEL_ALARM, {
        when: now + 3_600_000,
      })
      const alarmsBefore = await otherAlarms()
      const notificationsBefore = await browser.notifications.getAll()
      const storageBefore = await local.get(STORAGE_KEYS)
      browser.alarms.onAlarm.addListener(observeAlarm)
      await browser.alarms.create(EXPIRATION_ALARM, {
        when: Date.now() + 1_000,
        periodInMinutes: 0.5,
      })
      const after = await waitForExpiration(
        dataPlane.readUndoSnapshot,
        () => alarmFired,
      )
      const storageAfter = await local.get(STORAGE_KEYS)
      result = {
        alarmFired,
        expiredRemoved:
          !after.savedTabs.urls.some(({ id }) => id === EXPIRING_URL_ID) &&
          !after.savedTabs.memberships.some(
            ({ urlId }) => urlId === EXPIRING_URL_ID,
          ),
        freshPreserved: sameValue(
          after.savedTabs.urls.find(({ id }) => id === fresh.id),
          fresh,
        ),
        favoritePreserved: sameValue(
          after.savedTabs.urls.find(({ id }) => id === favorite.id),
          favorite,
        ),
        otherAlarmsUnchanged: sameValue(await otherAlarms(), alarmsBefore),
        notificationsUnchanged:
          sameValue(
            await browser.notifications.getAll(),
            notificationsBefore,
          ) && sameValue(storageAfter.reviewReminderNotification, notification),
        settingsUnchanged: sameValue(storageAfter, storageBefore),
      }
    } finally {
      browser.alarms.onAlarm.removeListener(observeAlarm)
      // Disable deletion before restoring the old profile rows and schedule.
      await local.set({
        userSettings: { ...verifiedSettings, autoDeletePeriod: 'never' },
      })
      await browser.alarms.clear(EXPIRATION_ALARM)
      await dataPlane.restoreUndoSnapshot(previousSnapshot)
      await local.remove(['userSettings', 'reviewReminderNotification'])
      const restoreStorage = Object.fromEntries(
        Object.entries(previousStorage).filter(
          ([key]) => key !== 'reviewReminderSettings',
        ),
      )
      await local.set(restoreStorage)
      await restoreAlarm(EXPIRATION_ALARM, previousAlarm)
      await restoreAlarm(SENTINEL_ALARM, previousSentinel)
    }
    return {
      ...result,
      restored:
        sameValue(
          (await dataPlane.readUndoSnapshot()).savedTabs,
          previousSnapshot.savedTabs,
        ) && sameValue(await local.get(STORAGE_KEYS), previousStorage),
    }
  }
