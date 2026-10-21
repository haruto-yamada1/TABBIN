import { browser } from 'wxt/browser'

import {
  buildReviewReminderUrl,
  getReviewCandidates,
} from '@/app/composition/reviewReminders'
import type { ReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import {
  isReviewQuietHours,
  nextReviewQuietHoursEnd,
  nextReviewTime,
} from '@/features/review-reminders/lib/reviewSchedule'
import { getBackgroundMessage } from '@/lib/background/i18n'
import { logger } from '@/lib/logging/logger'
import {
  clearReviewReminderNotification,
  readReviewReminderAlarmTimeZone,
  readReviewReminderNotification,
  readReviewReminderSettings,
  REVIEW_REMINDER_SETTINGS_KEY,
  saveReviewReminderAlarmTimeZone,
  saveReviewReminderNotification,
} from '@/lib/storage/review-reminders'

const REVIEW_ALARM_NAME = 'reviewSavedTabs'
const REVIEW_NOTIFICATION_ID = 'tabbin-review-reminder'
let settingsRevision = 0
let browserOperations: Promise<void> = Promise.resolve()
let alarmSchedulesInFlight = 0
let latestTimeZoneTransition:
  | { previousZone: string | null; changedAt: number }
  | undefined

// Serialize browser writes, while leaving candidate reads outside the queue so
// disabling a reminder can clear its alarm even during a slow database read.
const withBrowserOperation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const result = browserOperations.then(operation)
  browserOperations = result.then(
    () => {},
    () => {},
  )
  return result
}

const clearNotification = async (): Promise<void> => {
  await browser.notifications.clear(REVIEW_NOTIFICATION_ID)
  await clearReviewReminderNotification()
}

const clearReminder = async (): Promise<void> => {
  await browser.alarms.clear(REVIEW_ALARM_NAME)
  await clearNotification()
}

const scheduleReviewAlarm = async (when: number): Promise<void> => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  await browser.alarms.create(REVIEW_ALARM_NAME, { when })
  // Record the zone only after native creation succeeds. A failed replacement
  // cannot mark an old alarm as matching the new device-local schedule.
  await saveReviewReminderAlarmTimeZone(timeZone)
}

const rememberTimeZoneTransition = (previousZone: string | null): void => {
  if (previousZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) {
    latestTimeZoneTransition = { previousZone, changedAt: Date.now() }
  }
}

const deferNotificationDuringQuietHours = async (
  settings: ReviewReminderSettings,
): Promise<boolean> => {
  const now = Date.now()
  if (!isReviewQuietHours(settings, now)) {
    return false
  }
  await scheduleReviewAlarm(nextReviewQuietHoursEnd(settings, now))
  await clearNotification()
  return true
}

const sameSettings = (
  left: ReviewReminderSettings,
  right: ReviewReminderSettings,
): boolean => JSON.stringify(left) === JSON.stringify(right)

export const reconcileReviewReminderAlarm = async (
  reset = false,
): Promise<void> => {
  if (!reset && alarmSchedulesInFlight > 0) {
    return
  }
  const revision = settingsRevision
  const settings = await readReviewReminderSettings()
  await withBrowserOperation(async () => {
    if (revision !== settingsRevision) {
      return
    }
    if (!reset && alarmSchedulesInFlight > 0) {
      return
    }
    if (!settings.enabled) {
      await clearReminder()
      return
    }
    if (reset) {
      await clearReminder()
    } else {
      const [existing, alarmTimeZone] = await Promise.all([
        browser.alarms.get(REVIEW_ALARM_NAME),
        readReviewReminderAlarmTimeZone(),
      ])
      if (
        alarmSchedulesInFlight > 0 ||
        (existing &&
          existing.scheduledTime > Date.now() &&
          existing.periodInMinutes === undefined &&
          alarmTimeZone === Intl.DateTimeFormat().resolvedOptions().timeZone)
      ) {
        return
      }
      // A due wake event may arrive while native creation/storage is pending.
      // Retain device-local transition evidence for that event's scheduled time.
      rememberTimeZoneTransition(alarmTimeZone)
    }
    if (revision !== settingsRevision) {
      return
    }
    await scheduleReviewAlarm(nextReviewTime(settings, Date.now()))
  })
}

const prepareReviewAlarm = async (
  scheduledTime: number,
): Promise<{
  revision: number
  settings: ReviewReminderSettings
  reviewAt: number
} | null> => {
  const revision = settingsRevision
  try {
    const [settings, alarmTimeZone] = await Promise.all([
      readReviewReminderSettings(),
      readReviewReminderAlarmTimeZone(),
    ])
    const reviewAt = Date.now()
    const quiet = isReviewQuietHours(settings, reviewAt)
    const deliver = await withBrowserOperation(async () => {
      if (revision !== settingsRevision) {
        return false
      }
      if (!settings.enabled) {
        await clearReminder()
        return false
      }
      const currentZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const staleTransition =
        latestTimeZoneTransition !== undefined &&
        latestTimeZoneTransition.previousZone !== currentZone &&
        Number.isFinite(scheduledTime) &&
        scheduledTime <= latestTimeZoneTransition.changedAt
      const staleZone = alarmTimeZone !== currentZone || staleTransition
      rememberTimeZoneTransition(alarmTimeZone)
      // The old UTC alarm itself can wake MV3 after a device zone change. Skip
      // that stale event while preserving the newly calculated local schedule.
      await scheduleReviewAlarm(
        !staleZone && quiet
          ? nextReviewQuietHoursEnd(settings, reviewAt)
          : nextReviewTime(settings, reviewAt),
      )
      return !staleZone && !quiet
    })
    return deliver && revision === settingsRevision
      ? { revision, settings, reviewAt }
      : null
  } finally {
    // Candidate reads stay outside this stage so a slow read cannot suppress a
    // later wake event or prevent normal startup reconciliation indefinitely.
    alarmSchedulesInFlight -= 1
  }
}

const handleReviewAlarm = async (scheduledTime: number): Promise<void> => {
  const prepared = await prepareReviewAlarm(scheduledTime)
  if (!prepared) {
    return
  }
  const { revision, settings, reviewAt } = prepared
  const candidates = await getReviewCandidates(settings, reviewAt)
  if (revision !== settingsRevision) {
    return
  }
  if (candidates.length === 0) {
    await withBrowserOperation(async () => {
      if (revision === settingsRevision) {
        await clearNotification()
      }
    })
    return
  }
  const [title, message] = await Promise.all([
    getBackgroundMessage('reviewReminder.notificationTitle'),
    getBackgroundMessage('reviewReminder.notificationMessage', undefined, {
      count: String(candidates.length),
    }),
  ])
  await withBrowserOperation(async () => {
    const current = await readReviewReminderSettings()
    if (
      revision !== settingsRevision ||
      !current.enabled ||
      !sameSettings(settings, current)
    ) {
      return
    }
    // Candidate and language reads can cross a quiet-hours boundary. Defer the
    // current reminder to quiet end instead of keeping only the next daily slot.
    if (await deferNotificationDuringQuietHours(current)) {
      return
    }
    // Clear the previous notification before replacing its filter metadata. If
    // the native create call fails, an old notification cannot open new criteria.
    await clearNotification()
    if (revision !== settingsRevision) {
      return
    }
    await saveReviewReminderNotification({ settings, reviewAt })
    if (revision !== settingsRevision) {
      return
    }
    // Storage/native cleanup can also be delayed, so check at the delivery point.
    if (await deferNotificationDuringQuietHours(current)) {
      return
    }
    try {
      await browser.notifications.create(REVIEW_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title,
        message,
      })
    } catch (error) {
      await clearNotification()
      throw error
    }
    // A disable event can arrive while the native notification API is pending.
    // Its queued reconciliation also clears the alarm after this write settles.
    if (revision !== settingsRevision) {
      await clearNotification()
      return
    }
    await deferNotificationDuringQuietHours(current)
  })
}

const handleNotificationClick = async (): Promise<void> => {
  const revision = settingsRevision
  const notification = await readReviewReminderNotification()
  if (!notification || !notification.settings.enabled) {
    return
  }
  await withBrowserOperation(async () => {
    const current = await readReviewReminderSettings()
    if (revision !== settingsRevision || !current.enabled) {
      return
    }
    await browser.tabs.create({
      url: buildReviewReminderUrl(notification.settings, notification.reviewAt),
    })
    await clearNotification()
  })
}

export const registerReviewReminderListeners = (): void => {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REVIEW_ALARM_NAME) {
      return
    }
    // Mark the wake scheduling stage synchronously, before bootstrap can inspect
    // and overwrite its persisted zone. Settings resets still invalidate it.
    alarmSchedulesInFlight += 1
    void handleReviewAlarm(alarm.scheduledTime).catch((error: unknown) => {
      logger.error('review_reminder_alarm_failed', error)
    })
  })
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      area !== 'local' ||
      !Object.hasOwn(changes, REVIEW_REMINDER_SETTINGS_KEY)
    ) {
      return
    }
    settingsRevision += 1
    void reconcileReviewReminderAlarm(true).catch((error: unknown) => {
      logger.error('review_reminder_settings_reconcile_failed', error)
    })
  })
  browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== REVIEW_NOTIFICATION_ID) {
      return
    }
    void handleNotificationClick().catch((error: unknown) => {
      logger.error('review_reminder_notification_click_failed', error)
    })
  })
}
