/**
 * 拡張機能アクション管理モジュール
 */

import { getMessage } from '@/features/i18n/lib/language'
import { saveTabsWithAutoCategory } from '@/lib/storage/migration'
import { saveUrlsToCustomProjects } from '@/lib/storage/projects'
import { getUserSettings } from '@/lib/storage/settings'
import {
  filterItemsBySavableUrl,
  normalizeUrlCandidate,
} from '@/lib/url-filter'

import { getBackgroundLanguage } from './i18n'
import { openSavedTabsPage } from './saved-tabs-page'
import { filterTabsByUserSettings, showNotification } from './utils'

const getBackgroundText = async (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => {
  const language = await getBackgroundLanguage()

  return getMessage(language, key, fallback, values)
}

const getAllTabsAcrossWindows = async (): Promise<chrome.tabs.Tab[]> => {
  if (!chrome.windows?.getAll) {
    return chrome.tabs.query({})
  }

  try {
    const windows = await chrome.windows.getAll({
      populate: true,
    })
    const tabs = windows.flatMap((window) => window.tabs ?? [])
    if (tabs.length > 0) {
      return tabs
    }
  } catch (error) {
    console.warn(
      'windows.getAll で全タブ取得に失敗したため tabs.query にフォールバックします',
      error,
    )
  }

  return chrome.tabs.query({})
}

const toSavedTabItems = async (
  tabs: {
    url?: string
    title?: string
  }[],
): Promise<
  {
    url: string
    title: string
  }[]
> => {
  const { excludePatterns } = await getUserSettings()

  return filterItemsBySavableUrl(tabs, excludePatterns ?? []).reduce<
    { title: string; url: string }[]
  >((items, tab) => {
    items.push({
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      title: tab.title || '',
      url: normalizeUrlCandidate(tab.url)!,
    })
    return items
  }, [])
}

const toResultItems = (
  tabs: {
    url?: string
    title?: string
  }[],
): {
  url: string
  title: string
}[] =>
  tabs.reduce<{ title: string; url: string }[]>((items, tab) => {
    const normalizedUrl = normalizeUrlCandidate(tab.url)
    if (normalizedUrl) {
      items.push({
        url: normalizedUrl,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        title: tab.title || '',
      })
    }
    return items
  }, [])

const syncSavedTabsToCustomMode = async (
  tabs: {
    url?: string
    title?: string
  }[],
): Promise<void> => {
  const savedTabItems = await toSavedTabItems(tabs)
  if (savedTabItems.length === 0) {
    return
  }
  try {
    await saveUrlsToCustomProjects(savedTabItems)
  } catch (error) {
    console.error('カスタムモードへの同期に失敗しました:', error)
  }
}

const notifyAndCloseTabs = async (
  notificationTitle: string,
  notificationMessage: string,
  tabIdsToClose: number[],
): Promise<void> => {
  await Promise.all([
    showNotification(notificationTitle, notificationMessage),
    tabIdsToClose.length > 0
      ? chrome.tabs
          .remove(tabIdsToClose)
          .then(() => {
            console.log(`${tabIdsToClose.length}個のタブを一括で閉じました`)
          })
          .catch((error) => {
            console.error('タブを閉じる際にエラー:', error)
          })
      : Promise.resolve(),
  ])
}

/**
 * ブラウザアクション（拡張機能アイコン）クリック時の処理
 */
export const handleExtensionActionClick = async (): Promise<void> => {
  console.log('拡張機能アイコンがクリックされました')
  try {
    // ユーザー設定を取得
    const settings = await getUserSettings()

    // クリック挙動を取得（デフォルトはウィンドウのタブ保存）
    const clickBehavior = settings.clickBehavior || 'saveWindowTabs'
    console.log(`選択されたクリック挙動: ${clickBehavior}`)

    // 選択された挙動に基づいて処理を実行
    switch (clickBehavior) {
      case 'saveCurrentTab': {
        await handleSaveCurrentTab()
        break
      }
      case 'saveSameDomainTabs': {
        await handleSaveSameDomainTabs()
        break
      }
      case 'saveAllWindowsTabs': {
        await handleSaveAllWindowsTabs()
        break
      }
      default: {
        // 既存の処理: 現在のウィンドウのタブをすべて保存（saveWindowTabsを含む）
        await handleSaveWindowTabs()
        break
      }
    }
  } catch (error: unknown) {
    console.error(
      'エラーが発生しました:',
      error instanceof Error ? error.message : error,
    )
  }
}
/**
 * 現在のタブのみを保存
 */
export const handleSaveCurrentTab = async (): Promise<
  {
    url: string
    title: string
  }[]
> => {
  // 現在アクティブなタブのみを保存
  const activeTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })

  // タブをフィルタリング（固定タブを除外）
  const filteredTabs = await filterTabsByUserSettings(activeTabs)
  if (filteredTabs.length === 0) {
    console.log(
      '保存対象のタブがありません（全て固定タブか除外パターンに一致）',
    )
    return []
  }
  const activeTab = filteredTabs[0]
  console.log(`現在のタブを保存: ${activeTab.url}`)

  // タブを保存
  const [, , notificationTitle, notificationMessage] = await Promise.all([
    saveTabsWithAutoCategory([activeTab]),
    syncSavedTabsToCustomMode([activeTab]),
    getBackgroundText('background.saveTabs.notificationTitle'),
    getBackgroundText('background.saveTabs.currentTabSaved'),
  ])

  await Promise.all([
    showNotification(notificationTitle, notificationMessage),
    activeTab.id
      ? chrome.tabs
          .remove(activeTab.id)
          .then(() => {
            console.log(`タブ ${activeTab.id} を閉じました`)
          })
          .catch((error) => {
            console.error('タブを閉じる際にエラー:', error)
          })
      : Promise.resolve(),
  ])
  return toResultItems([activeTab])
}
/**
 * 現在のドメインのタブをすべて保存
 */
export const handleSaveSameDomainTabs = async (): Promise<
  {
    url: string
    title: string
  }[]
> => {
  const currentTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (currentTabs.length === 0 || !currentTabs[0].url) {
    return []
  }
  try {
    // 現在のタブからドメインを取得
    const url = new URL(currentTabs[0].url)
    const currentDomain = url.hostname
    console.log(`現在のドメイン: ${currentDomain}`)

    // 現在のウィンドウの同じドメインのタブをすべて取得
    const tabs = await chrome.tabs.query({
      currentWindow: true,
    })
    const sameDomainTabs = tabs.filter((tab) => {
      if (!tab.url) {
        return false
      }
      try {
        const tabUrl = new URL(tab.url)
        return tabUrl.hostname === currentDomain
      } catch {
        return false
      }
    })

    // タブをフィルタリング（固定タブを除外）
    const filteredTabs = await filterTabsByUserSettings(sameDomainTabs)
    if (filteredTabs.length === 0) {
      console.log(
        '保存対象のタブがありません（全て固定タブか除外パターンに一致）',
      )
      return []
    }
    console.log(`同じドメインのタブ数: ${filteredTabs.length}`)

    // タブを保存
    const [, , settings, notificationTitle, notificationMessage] =
      await Promise.all([
        saveTabsWithAutoCategory(filteredTabs),
        syncSavedTabsToCustomMode(filteredTabs),
        getUserSettings(),
        getBackgroundText('background.saveTabs.notificationTitle'),
        getBackgroundText('background.saveTabs.sameDomainSaved', undefined, {
          count: String(filteredTabs.length),
          domain: currentDomain,
        }),
      ])

    // 保存したタブを閉じる（一括処理）
    const tabIdsToClose = filteredTabs
      .reduce<number[]>((ids, tab) => {
        if (
          tab.id &&
          !settings.excludePatterns.some((pattern) =>
            tab.url?.includes(pattern),
          )
        ) {
          ids.push(tab.id)
        }
        return ids
      }, [])
      .filter((id): id is number => id !== undefined)
    await notifyAndCloseTabs(
      notificationTitle,
      notificationMessage,
      tabIdsToClose,
    )
    return toResultItems(filteredTabs)
  } catch (error) {
    console.error('ドメインタブ保存エラー:', error)
    return []
  }
}
/**
 * すべてのウィンドウのタブを保存
 */
export const handleSaveAllWindowsTabs = async (): Promise<
  {
    url: string
    title: string
  }[]
> => {
  try {
    // すべてのウィンドウのタブを取得
    const allTabs = await getAllTabsAcrossWindows()
    console.log(`取得したすべてのタブ数: ${allTabs.length}`)

    // タブをフィルタリング（固定タブと除外パターンを除外）
    const filteredTabs = await filterTabsByUserSettings(allTabs)
    if (filteredTabs.length === 0) {
      console.log(
        '保存対象のタブがありません（全て固定タブか除外パターンに一致）',
      )
      return []
    }
    console.log(`保存対象タブ数: ${filteredTabs.length}`)

    // タブを保存
    const [, , notificationTitle, notificationMessage, savedTabsTabId] =
      await Promise.all([
        saveTabsWithAutoCategory(filteredTabs),
        syncSavedTabsToCustomMode(filteredTabs),
        getBackgroundText('background.saveTabs.notificationTitle'),
        getBackgroundText('background.saveTabs.allWindowsSaved', undefined, {
          count: String(filteredTabs.length),
        }),
        openSavedTabsPage(),
      ])

    // タブを閉じる（一括処理）
    const tabIdsToClose = filteredTabs.reduce<number[]>((ids, tab) => {
      if (tab.id && tab.id !== savedTabsTabId) {
        ids.push(tab.id)
      }
      return ids
    }, [])
    await notifyAndCloseTabs(
      notificationTitle,
      notificationMessage,
      tabIdsToClose,
    )
    return toResultItems(filteredTabs)
  } catch (error) {
    console.error('すべてのタブ保存エラー:', error)
    return []
  }
}
/**
 * 現在のウィンドウのタブをすべて保存（デフォルト）
 */
export const handleSaveWindowTabs = async (): Promise<
  {
    url: string
    title: string
  }[]
> => {
  const allTabs = await chrome.tabs.query({
    currentWindow: true,
  })
  console.log(`取得したタブ: ${allTabs.length}個`)

  // タブをフィルタリング（固定タブと除外パターンを除外）
  const filteredTabs = await filterTabsByUserSettings(allTabs)
  if (filteredTabs.length === 0) {
    console.log(
      '保存対象のタブがありません（全て固定タブか除外パターンに一致）',
    )
    return []
  }
  console.log(`保存対象タブ: ${filteredTabs.length}個`)

  // タブを保存して自動カテゴライズする
  await saveTabsWithAutoCategory(filteredTabs)
  await syncSavedTabsToCustomMode(filteredTabs)
  console.log('タブの保存と自動カテゴライズが完了しました')
  const [savedTabsTabId, settings, notificationTitle, notificationMessage] =
    await Promise.all([
      openSavedTabsPage(),
      getUserSettings(),
      getBackgroundText('background.saveTabs.notificationTitle'),
      getBackgroundText('background.saveTabs.windowTabsSaved', undefined, {
        count: String(filteredTabs.length),
      }),
    ])
  await showNotification(notificationTitle, notificationMessage)

  // 閉じるタブを収集
  const tabIdsToClose: number[] = []
  for (const tab of filteredTabs) {
    const tabUrl = tab.url
    if (
      tab.id &&
      tab.id !== savedTabsTabId &&
      tabUrl &&
      !settings.excludePatterns.some(
        (pattern) => tabUrl.split(pattern).length > 1,
      )
    ) {
      tabIdsToClose.push(tab.id)
    }
  }

  // タブを閉じる（一括処理）
  if (tabIdsToClose.length > 0) {
    console.log(`${tabIdsToClose.length}個のタブを閉じます:`, tabIdsToClose)
    try {
      await chrome.tabs.remove(tabIdsToClose)
      console.log(`${tabIdsToClose.length}個のタブを一括で閉じました`)
    } catch (error: unknown) {
      console.error(
        'タブを閉じる際にエラーが発生しました:',
        error instanceof Error ? error.message : error,
      )
    }
  } else {
    console.log('閉じるべきタブはありません')
  }
  return toResultItems(filteredTabs)
}
