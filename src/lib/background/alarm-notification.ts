/**
 * アラーム・通知管理モジュール
 */

import { browser } from 'wxt/browser'

import { getPersistenceBootstrapRuntime } from '@/app/composition/persistenceBootstrap'
import { logger } from '@/lib/logging/logger'

import { checkAndRemoveExpiredTabs } from './expired-tabs'

const EXPIRED_TABS_ALARM_NAME = 'checkExpiredTabs'
const CHECK_PERIOD_MINUTES = 0.5
const INITIAL_CHECK_DELAY_MS = 100
let checkInFlight: Promise<void> | undefined

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

const handleExpiredTabsAlarm = (alarm: { readonly name: string }): void => {
  if (alarm.name === EXPIRED_TABS_ALARM_NAME) {
    void runExpiredTabsCheck('alarm')
  }
}

/** Register during synchronous worker setup, before any persistence awaits. */
export const registerExpiredTabsAlarmListener = (): void => {
  try {
    if (!('alarms' in browser)) {
      logger.warn('background_expired_tabs_alarms_unavailable')
      return
    }
    if (!browser.alarms.onAlarm.hasListener(handleExpiredTabsAlarm)) {
      browser.alarms.onAlarm.addListener(handleExpiredTabsAlarm)
    }
  } catch (error) {
    logger.error('background_expired_tabs_alarm_listener_failed', error)
  }
}

/** Reconcile the native schedule after bootstrap; never register listeners here. */
export const setupExpiredTabsCheckAlarm = async (): Promise<void> => {
  if (!('alarms' in browser)) {
    void runExpiredTabsCheck('initialCheck')
    return
  }
  try {
    const alarm = await browser.alarms.get(EXPIRED_TABS_ALARM_NAME)
    if (alarm?.periodInMinutes !== CHECK_PERIOD_MINUTES) {
      await browser.alarms.create(EXPIRED_TABS_ALARM_NAME, {
        periodInMinutes: CHECK_PERIOD_MINUTES,
      })
    }
  } catch (error) {
    logger.error('background_expired_tabs_alarm_schedule_failed', error)
  } finally {
    // Best-effort startup scan. A wake already waiting on bootstrap covers it.
    if (!checkInFlight) {
      setTimeout(() => {
        void runExpiredTabsCheck('initialCheck')
      }, INITIAL_CHECK_DELAY_MS)
    }
  }
}

export { showNotification } from './notification'
