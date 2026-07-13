/**
 * 期限切れタブ管理モジュール
 */

import { logger } from '@/lib/logging/logger'
import type { AutoDeletePeriod } from '@/types/background'
import type { TabGroup, UserSettings } from '@/types/storage'

const MS_IN_SECOND_ET = 1000
const SECONDS_IN_MINUTE_ET = 60
const MINUTES_IN_HOUR_ET = 60
const HOURS_IN_DAY_ET = 24

const MINUTE_MS = SECONDS_IN_MINUTE_ET * MS_IN_SECOND_ET
const HOUR_MS = MINUTES_IN_HOUR_ET * MINUTE_MS
const DAY_MS = HOURS_IN_DAY_ET * HOUR_MS

const THIRTY_SECONDS_VALUE = 30
const SEVEN_DAYS_VALUE = 7
const FOURTEEN_DAYS_VALUE = 14
const THIRTY_DAYS_VALUE = 30
const ONE_HUNDRED_EIGHTY_DAYS_VALUE = 180
const THREE_HUNDRED_SIXTY_FIVE_DAYS_VALUE = 365

const TIMESTAMP_OFFSET_30_SEC = 40
const TIMESTAMP_OFFSET_1_MIN = 70

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
): period is AutoDeletePeriod => {
  return AUTO_DELETE_PERIODS.has(period)
}
/**
 * 期限の文字列を対応するミリ秒に変換
 */
export const getExpirationPeriodMs = (
  period: AutoDeletePeriod,
): number | null => {
  // テスト用に30秒も追加
  // eslint-disable-next-line typescript/switch-exhaustiveness-check
  switch (period) {
    case '30sec': {
      return THIRTY_SECONDS_VALUE * MS_IN_SECOND_ET
    }
    // テスト用30秒
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
      return SEVEN_DAYS_VALUE * DAY_MS
    }
    case '14days': {
      return FOURTEEN_DAYS_VALUE * DAY_MS
    }
    case '30days': {
      return THIRTY_DAYS_VALUE * DAY_MS
    }
    case '180days': {
      return ONE_HUNDRED_EIGHTY_DAYS_VALUE * DAY_MS
    }
    // 約6ヶ月
    case '365days': {
      return THREE_HUNDRED_SIXTY_FIVE_DAYS_VALUE * DAY_MS
    }
    // 1年
    default: {
      return null
    }
    // "never" または無効な値
  }
}
/**
 * 期限切れのタブをチェックして削除する関数
 */
export const checkAndRemoveExpiredTabs = async (): Promise<void> => {
  try {
    logger.debug('background_expired_tabs_check_started')

    // ストレージから直接取得する - より単純化した取得方法
    const data = await chrome.storage.local.get<{
      userSettings?: UserSettings
    }>(['userSettings'])
    const autoDeletePeriod = data.userSettings?.autoDeletePeriod ?? 'never'

    // 自動削除が無効な場合は何もしない
    if (autoDeletePeriod === 'never') {
      logger.debug('background_expired_tabs_auto_delete_disabled')
      return
    }
    if (!isAutoDeletePeriod(autoDeletePeriod)) {
      logger.warn('background_expired_tabs_auto_delete_period_invalid')
      return
    }

    // 期限をミリ秒で計算
    // "never" と無効値は上で除外済みのため、ここでは null にならない想定
    const expirationPeriod = getExpirationPeriodMs(autoDeletePeriod) ?? 0
    const currentTime = Date.now()
    const cutoffTime = currentTime - expirationPeriod

    // 保存されたタブを取得
    const storageResult = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')
    const savedTabs: TabGroup[] = storageResult.savedTabs ?? []
    if (savedTabs.length === 0) {
      logger.debug('background_expired_tabs_source_empty')
      return
    }
    logger.debug('background_expired_tabs_scan_started', {
      recordCount: savedTabs.length,
    })

    // チェック対象のURL数を計算
    const totalUrlCount: number = savedTabs.reduce(
      (acc: number, g: TabGroup) => acc + (g.urls?.length ?? 0),
      0,
    )

    // URL単位で期限切れをフィルタリング
    const updatedTabs = savedTabs.reduce<TabGroup[]>((groups, group) => {
      const originalUrls = group.urls ?? []
      const originalUrlCount = originalUrls.length
      const filteredUrls = originalUrls.filter((urlEntry) => {
        const urlSavedAt = urlEntry.savedAt ?? group.savedAt ?? currentTime
        const isUrlExpired = urlSavedAt < cutoffTime
        if (isUrlExpired) {
          logger.debug('background_expired_tab_removed', {
            url: urlEntry.url,
          })
          return false
        }
        return true
      })
      if (filteredUrls.length !== originalUrlCount) {
        logger.debug('background_expired_tab_group_urls_removed', {
          recordCount: originalUrlCount - filteredUrls.length,
          url: group.domain,
        })
      }
      if (filteredUrls.length > 0) {
        groups.push({
          ...group,
          urls: filteredUrls,
        })
      }
      return groups
    }, [])

    // 更新後のURL数を計算
    const updatedUrlCount: number = updatedTabs.reduce(
      (acc: number, g) => acc + (g.urls?.length ?? 0),
      0,
    )

    // 変更があった場合のみ保存
    if (
      updatedTabs.length !== savedTabs.length ||
      updatedUrlCount !== totalUrlCount
    ) {
      await chrome.storage.local.set({
        savedTabs: updatedTabs,
      })
      logger.info('background_expired_tabs_removed', {
        recordCount: totalUrlCount - updatedUrlCount,
      })
    } else {
      logger.debug('background_expired_tabs_removal_not_required')
    }
  } catch (error: unknown) {
    logger.error('background_expired_tabs_check_failed', error)
  }
}
/**
 * タブの保存時刻を指定の期間に応じて更新する関数
 */
export const updateTabTimestamps = async (
  period?: string,
): Promise<{
  success: boolean
  timestamp: number
}> => {
  try {
    logger.debug('background_tab_timestamp_update_started')
    const storageResult = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')
    const savedTabs: TabGroup[] = storageResult.savedTabs ?? []
    if (savedTabs.length === 0) {
      logger.debug('background_tab_timestamp_update_source_empty')
      return {
        success: false,
        timestamp: 0,
      }
    }
    const now = Date.now()
    let timestamp: number

    // 短いテスト用期間では、即時検証しやすいように過去時刻を設定する
    if (period === '30sec') {
      timestamp = now - TIMESTAMP_OFFSET_30_SEC * MS_IN_SECOND_ET
    } else if (period === '1min') {
      timestamp = now - TIMESTAMP_OFFSET_1_MIN * MS_IN_SECOND_ET
    } else {
      timestamp = now
    }

    // タブの保存時刻を更新
    const updatedTabs = savedTabs.map((group: TabGroup) => ({
      ...group,
      savedAt: timestamp,
    }))

    // ストレージに保存
    await chrome.storage.local.set({
      savedTabs: updatedTabs,
    })
    logger.info('background_tab_timestamp_update_completed', {
      recordCount: updatedTabs.length,
    })

    // 即座に確認
    void checkAndRemoveExpiredTabs()
    return {
      success: true,
      timestamp,
    }
  } catch (error) {
    logger.error('background_tab_timestamp_update_failed', error)
    throw error
  }
}
