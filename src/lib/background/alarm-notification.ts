/**
 * アラーム・通知管理モジュール
 */

import type { Browser } from 'wxt/browser'
import { browser } from 'wxt/browser'

import { getPersistenceBootstrapRuntime } from '@/app/composition/persistenceBootstrap'
import { logger } from '@/lib/logging/logger'
import { requireUserSettings } from '@/lib/storage/settings'

import { checkAndRemoveExpiredTabs } from './expired-tabs'

const EXPIRED_TABS_ALARM_NAME = 'checkExpiredTabs'
const CHECK_PERIOD_MINUTES = 0.5
const MS_PER_MINUTE = 60_000
const CHECK_PERIOD_MS = CHECK_PERIOD_MINUTES * MS_PER_MINUTE
const INITIAL_CHECK_DELAY_MS = 100
let checkInFlight: Promise<void> | undefined
let alarmReconciliation = Promise.resolve(true)
let retryScheduleOnAlarm = false
let receivedExpirationAlarm = false

// An alarm received during bootstrap and the startup scan share one check.
// A new worker starts with no in-memory work and scans again; the persisted
// periodic alarm is retained so termination cannot remove the next wake-up.
const runExpiredTabsCheck = async (
  action: 'alarm' | 'initialCheck',
): Promise<void> => {
  checkInFlight ??= Promise.resolve()
    .then(async () => {
      await getPersistenceBootstrapRuntime().bootstrap.ready()
      await checkAndRemoveExpiredTabs()
    })
    .catch((error: unknown) => {
      logger.error('background_expired_tabs_alarm_check_failed', error, {
        action,
      })
    })
    .finally(() => {
      checkInFlight = undefined
    })
  return checkInFlight
}

const isCurrentSchedule = (alarm: Browser.alarms.Alarm | undefined): boolean =>
  alarm?.periodInMinutes === CHECK_PERIOD_MINUTES &&
  alarm.scheduledTime <= Date.now() + CHECK_PERIOD_MS

const reconcileExpiredTabsAlarm = async (): Promise<boolean> => {
  // Read policy inside the queue, so an older async create cannot overtake a
  // newer clear after a rapid settings change.
  alarmReconciliation = alarmReconciliation.then(async () => {
    let enabled = true
    try {
      const settings = await requireUserSettings()
      enabled = (settings.autoDeletePeriod ?? 'never') !== 'never'
      if (!('alarms' in browser)) {
        return enabled
      }

      const alarm = await browser.alarms.get(EXPIRED_TABS_ALARM_NAME)
      if (!enabled) {
        if (alarm) {
          await browser.alarms.clear(EXPIRED_TABS_ALARM_NAME)
        }
      } else if (!isCurrentSchedule(alarm)) {
        // Replacing by name is atomic. A clock rollback can leave the
        // reported deadline more than a full period into the future.
        await browser.alarms.create(EXPIRED_TABS_ALARM_NAME, {
          periodInMinutes: CHECK_PERIOD_MINUTES,
        })
      }
      retryScheduleOnAlarm = false
    } catch (error) {
      retryScheduleOnAlarm = true
      // An unreadable policy leaves the prior schedule intact. The scan
      // validates policy independently and preserves settings error feedback.
      logger.error('background_expired_tabs_alarm_schedule_failed', error)
    }
    return enabled
  })
  return alarmReconciliation
}

const handleExpiredTabsAlarm = (alarm: Browser.alarms.Alarm): void => {
  if (alarm.name !== EXPIRED_TABS_ALARM_NAME) {
    return
  }
  receivedExpirationAlarm = true
  if (retryScheduleOnAlarm || !isCurrentSchedule(alarm)) {
    // A stale one-shot can be delivered to an already running background.
    void reconcileExpiredTabsAlarm()
  }
  void runExpiredTabsCheck('alarm')
}

const handleUserSettingsChange = (
  changes: Record<string, unknown>,
  area: string,
): void => {
  if (area === 'local' && Object.hasOwn(changes, 'userSettings')) {
    void reconcileExpiredTabsAlarm()
  }
}

/** Register during synchronous worker setup, before any persistence awaits. */
export const registerExpiredTabsAlarmListener = (): void => {
  try {
    if (!('alarms' in browser)) {
      logger.warn('background_expired_tabs_alarms_unavailable')
    } else if (!browser.alarms.onAlarm.hasListener(handleExpiredTabsAlarm)) {
      browser.alarms.onAlarm.addListener(handleExpiredTabsAlarm)
    }
  } catch (error) {
    logger.error('background_expired_tabs_alarm_listener_failed', error)
  }

  try {
    const storageChanged = browser.storage.onChanged
    if (!storageChanged.hasListener(handleUserSettingsChange)) {
      storageChanged.addListener(handleUserSettingsChange)
    }
  } catch (error) {
    logger.error('background_expired_tabs_settings_listener_failed', error)
  }
}

/** Reconcile the native schedule after bootstrap; never register listeners here. */
export const setupExpiredTabsCheckAlarm = async (): Promise<void> => {
  if (!(await reconcileExpiredTabsAlarm()) || receivedExpirationAlarm) {
    return
  }
  if (!('alarms' in browser)) {
    void runExpiredTabsCheck('initialCheck')
    return
  }
  // Best-effort startup check. A wake already waiting on bootstrap covers it.
  setTimeout(() => {
    if (!receivedExpirationAlarm) {
      void runExpiredTabsCheck('initialCheck')
    }
  }, INITIAL_CHECK_DELAY_MS)
}

export { showNotification } from './notification'
