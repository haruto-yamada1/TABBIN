/**
 * Background script用ユーティリティ関数
 */

import { filterItemsBySavableUrl } from '@/lib/url-filter'

import { showNotification } from './alarm-notification'
import { requireOperationalUserSettings } from './settings-policy'

export class TabFilteringError extends Error {
  public readonly reason: 'invalid-exclude-patterns' | 'evaluation-failed'

  public constructor(reason: 'invalid-exclude-patterns' | 'evaluation-failed') {
    super('Tab filtering could not be completed.')
    this.name = 'TabFilteringError'
    this.reason = reason
  }
}

/**
 * タブをユーザー設定に基づいてフィルタリングする共通関数
 */
export const filterTabsByUserSettings = async (
  tabs: chrome.tabs.Tab[],
): Promise<chrome.tabs.Tab[]> => {
  // Settings errors retain their strict-read type and recovery notification.
  const settings = await requireOperationalUserSettings()
  try {
    if (
      !Array.isArray(settings.excludePatterns) ||
      !settings.excludePatterns.every((pattern) => typeof pattern === 'string')
    ) {
      throw new TabFilteringError('invalid-exclude-patterns')
    }
    let filteredTabs = [...tabs]

    // 固定タブを除外
    if (settings.excludePinnedTabs) {
      const beforeCount = filteredTabs.length
      filteredTabs = filteredTabs.filter((tab) => !tab.pinned)
      const afterCount = filteredTabs.length
      if (beforeCount !== afterCount) {
        console.log(
          `固定タブを ${beforeCount - afterCount} 個除外しました (${beforeCount} → ${afterCount})`,
        )
      }
    }

    // 除外パターンに一致するタブもフィルタリング
    filteredTabs = filterItemsBySavableUrl(
      filteredTabs,
      settings.excludePatterns,
    )
    return filteredTabs
  } catch (error) {
    throw error instanceof TabFilteringError
      ? error
      : new TabFilteringError('evaluation-failed')
  }
}

// 通知表示の再エクスポート
export { showNotification }
