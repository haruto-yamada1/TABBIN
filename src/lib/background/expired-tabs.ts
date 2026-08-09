/**
 * 期限切れタブ管理モジュール
 */

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import { logger } from '@/lib/logging/logger'
import { getUserSettings } from '@/lib/storage/settings'
import type { AutoDeletePeriod } from '@/types/background'

const SECOND_MS = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const THIRTY_SECONDS = 30
const SEVEN_DAYS = 7
const FOURTEEN_DAYS = 14
const THIRTY_DAYS = 30
const ONE_HUNDRED_EIGHTY_DAYS = 180
const THREE_HUNDRED_SIXTY_FIVE_DAYS = 365
const THIRTY_SECONDS_TEST_OFFSET = 40
const ONE_MINUTE_TEST_OFFSET = 70
const MINUTE_MS = SECONDS_PER_MINUTE * SECOND_MS
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS
const DAY_MS = HOURS_PER_DAY * HOUR_MS

const AUTO_DELETE_PERIODS = new Set<string>([
  'never',
  '30sec',
  '1min',
  '1hour',
  '1day',
  '7days',
  '14days',
  '30days',
  '180days',
  '365days',
])

export const isAutoDeletePeriod = (
  period: string,
): period is AutoDeletePeriod => AUTO_DELETE_PERIODS.has(period)

export const getExpirationPeriodMs = (
  period: AutoDeletePeriod,
): number | null => {
  // eslint-disable-next-line typescript/switch-exhaustiveness-check
  switch (period) {
    case '30sec': {
      return THIRTY_SECONDS * SECOND_MS
    }
    case '1min': {
      return MINUTE_MS
    }
    case '1hour': {
      return HOUR_MS
    }
    case '1day': {
      return DAY_MS
    }
    case '7days': {
      return SEVEN_DAYS * DAY_MS
    }
    case '14days': {
      return FOURTEEN_DAYS * DAY_MS
    }
    case '30days': {
      return THIRTY_DAYS * DAY_MS
    }
    case '180days': {
      return ONE_HUNDRED_EIGHTY_DAYS * DAY_MS
    }
    case '365days': {
      return THREE_HUNDRED_SIXTY_FIVE_DAYS * DAY_MS
    }
    default: {
      return null
    }
  }
}

export const checkAndRemoveExpiredTabs = async (): Promise<void> => {
  try {
    logger.debug('background_expired_tabs_check_started')
    const autoDeletePeriod =
      (await getUserSettings()).autoDeletePeriod ?? 'never'
    if (autoDeletePeriod === 'never') {
      logger.debug('background_expired_tabs_auto_delete_disabled')
      return
    }
    if (!isAutoDeletePeriod(autoDeletePeriod)) {
      logger.warn('background_expired_tabs_auto_delete_period_invalid')
      return
    }
    const expirationPeriod = getExpirationPeriodMs(autoDeletePeriod) ?? 0
    const currentTime = Date.now()
    const result = await getBackgroundSavedTabsDataPlane().removeExpiredUrls(
      currentTime - expirationPeriod,
      currentTime,
    )
    if (result.sourceCount === 0) {
      logger.debug('background_expired_tabs_source_empty')
      return
    }
    logger.debug('background_expired_tabs_scan_started', {
      recordCount: result.sourceCount,
    })
    if (result.removedCount > 0) {
      logger.info('background_expired_tabs_removed', {
        recordCount: result.removedCount,
      })
    } else {
      logger.debug('background_expired_tabs_removal_not_required')
    }
  } catch (error: unknown) {
    logger.error('background_expired_tabs_check_failed', error)
  }
}

export const updateTabTimestamps = async (
  period?: string,
): Promise<{ readonly success: boolean; readonly timestamp: number }> => {
  try {
    logger.debug('background_tab_timestamp_update_started')
    const now = Date.now()
    let timestamp = now
    if (period === '30sec') {
      timestamp = now - THIRTY_SECONDS_TEST_OFFSET * SECOND_MS
    } else if (period === '1min') {
      timestamp = now - ONE_MINUTE_TEST_OFFSET * SECOND_MS
    }
    const result =
      await getBackgroundSavedTabsDataPlane().updateTabTimestamps(timestamp)
    if (!result.success) {
      logger.debug('background_tab_timestamp_update_source_empty')
      return { success: false, timestamp: 0 }
    }
    logger.info('background_tab_timestamp_update_completed')
    void checkAndRemoveExpiredTabs()
    return { success: true, timestamp }
  } catch (error) {
    logger.error('background_tab_timestamp_update_failed', error)
    throw error
  }
}
