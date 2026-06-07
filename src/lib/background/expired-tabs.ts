/**
 * 期限切れタブ管理モジュール
 */

import type { AutoDeletePeriod } from '@/types/background'
import type { TabGroup } from '@/types/storage'

const AUTO_DELETE_PERIODS = new Set<AutoDeletePeriod>([
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
  return AUTO_DELETE_PERIODS.has(period as AutoDeletePeriod)
}
/**
 * 期限の文字列を対応するミリ秒に変換
 */
export const getExpirationPeriodMs = (
  period: AutoDeletePeriod,
): number | null => {
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  // テスト用に30秒も追加
  switch (period) {
    case '30sec': {
      return 30 * 1000
    }
    // テスト用30秒
    case '1min': {
      return minute
    }
    case '1hour': {
      return hour
    }
    case '1day': {
      return day
    }
    case '7days': {
      return 7 * day
    }
    case '14days': {
      return 14 * day
    }
    case '30days': {
      return 30 * day
    }
    case '180days': {
      return 180 * day
    }
    // 約6ヶ月
    case '365days': {
      return 365 * day
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
    console.log('期限切れタブのチェックを開始...', new Date().toLocaleString())

    // ストレージから直接取得する - より単純化した取得方法
    const data = await chrome.storage.local.get<{
      userSettings?: import('@/types/storage').UserSettings
    }>(['userSettings'])
    const autoDeletePeriod = data.userSettings?.autoDeletePeriod ?? 'never'

    // デバッグログを追加
    console.log('ストレージから直接取得した設定:', data)
    console.log('使用する自動削除期間:', autoDeletePeriod)

    // 自動削除が無効な場合は何もしない
    if (autoDeletePeriod === 'never') {
      console.log('自動削除は無効です')
      return
    }
    if (!isAutoDeletePeriod(autoDeletePeriod)) {
      console.log('無効な自動削除期間です')
      return
    }

    // 期限をミリ秒で計算
    // "never" と無効値は上で除外済みのため、ここでは null にならない想定
    const expirationPeriod = getExpirationPeriodMs(autoDeletePeriod) as number
    const currentTime = Date.now()
    const cutoffTime = currentTime - expirationPeriod
    console.log(`現在時刻: ${new Date(currentTime).toLocaleString()}`)
    console.log(`カットオフ時刻: ${new Date(cutoffTime).toLocaleString()}`)

    // 保存されたタブを取得
    const storageResult = await chrome.storage.local.get<{
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')
    const savedTabs: TabGroup[] = storageResult.savedTabs || []
    if (savedTabs.length === 0) {
      console.log('保存されたタブはありません')
      return
    }
    console.log(`チェック対象タブグループ数: ${savedTabs.length}`)

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
          console.log(`削除: URL ${urlEntry.url} (ドメイン: ${group.domain})`)
          return false
        }
        return true
      })
      if (filteredUrls.length !== originalUrlCount) {
        console.log(
          `グループ ${group.domain}: ${originalUrlCount - filteredUrls.length} 件のURLを削除`,
        )
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
      console.log(
        `削除前: ${savedTabs.length} グループ, ${totalUrlCount} 件のURL`,
      )
      console.log(
        `削除後: ${updatedTabs.length} グループ, ${updatedUrlCount} 件のURL`,
      )
      await chrome.storage.local.set({
        savedTabs: updatedTabs,
      })
      console.log('期限切れタブを削除しました')
    } else {
      console.log('削除対象のタブはありませんでした')
    }
  } catch (error: unknown) {
    console.error(
      '期限切れタブチェックエラー:',
      error instanceof Error ? error.message : error,
    )
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
    console.log(`タブの保存時刻を更新します: ${period || '不明な期間'}`)
    const storageResult = await chrome.storage.local.get<{
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')
    const savedTabs: TabGroup[] = storageResult.savedTabs || []
    if (savedTabs.length === 0) {
      console.log('保存されたタブがありません')
      return {
        success: false,
        timestamp: 0,
      }
    }
    const now = Date.now()
    let timestamp: number

    // 短いテスト用期間では、即時検証しやすいように過去時刻を設定する
    if (period === '30sec') {
      timestamp = now - 40 * 1000
    } else if (period === '1min') {
      timestamp = now - 70 * 1000
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
    console.log(
      `${updatedTabs.length}個のタブグループの時刻を ${new Date(timestamp).toLocaleString()} に更新しました`,
    )

    // 即座に確認
// eslint-disable-next-line typescript/no-floating-promises
    checkAndRemoveExpiredTabs()
    return {
      success: true,
      timestamp,
    }
  } catch (error) {
    console.error('タブ時刻更新エラー:', error)
    throw error
  }
}
