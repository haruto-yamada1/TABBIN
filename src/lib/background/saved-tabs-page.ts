/**
 * 保存されたタブページ管理モジュール
 */

// タブ作成を制御するためのフラグ
let isCreatingSavedTabsPage = false
let savedTabsPageId: number | null = null

const isSavedTabsPageUrl = (value?: string): boolean => {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    const normalizedPath = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)

    if (normalizedPath === 'saved-tabs.html') {
      return true
    }

    if (normalizedPath !== 'app.html') {
      return false
    }

    const hashPath = url.hash.replace(/^#/, '')
    return hashPath === '/saved-tabs' || hashPath.startsWith('/saved-tabs?')
  } catch {
    return (
      value.includes('saved-tabs.html') ||
      value.includes('app.html#/saved-tabs')
    )
  }
}

const activateAndPinTabIfNeeded = async (
  tabId: number,
  isPinned: boolean,
): Promise<void> => {
  await chrome.tabs.update(tabId, {
    active: true,
  })
  if (!isPinned) {
    try {
      await chrome.tabs.update(tabId, {
        pinned: true,
      })
      console.log(`タブ ${tabId} をピン留めしました`)
    } catch (error) {
      console.error('タブのピン留め設定中にエラー:', error)
    }
  }
}
const reuseStoredSavedTabsPageId = async (): Promise<number | null> => {
  if (!savedTabsPageId) {
    return null
  }
  try {
    const tab = await chrome.tabs.get(savedTabsPageId)
    if (!tab) {
      return null
    }
    console.log(`保存されていたタブID ${savedTabsPageId} を再利用します`)
    await activateAndPinTabIfNeeded(savedTabsPageId, tab.pinned)
    return savedTabsPageId
  } catch {
    console.log('保存されていたタブIDは存在しませんでした。新規作成します。')
    savedTabsPageId = null
    return null
  }
}
const findSavedTabsPages = (allTabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] =>
  allTabs.filter(
    (tab) => isSavedTabsPageUrl(tab.url) || isSavedTabsPageUrl(tab.pendingUrl),
  )
const reuseExistingSavedTabsPage = async (
  savedTabsPages: chrome.tabs.Tab[],
): Promise<number | null> => {
  if (savedTabsPages.length === 0) {
    return null
  }
  const mainTab = savedTabsPages[0]
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  savedTabsPageId = mainTab.id || null
  console.log(`既存のタブを使用します: ${savedTabsPageId}`)
  if (!savedTabsPageId) {
    return null
  }
  await activateAndPinTabIfNeeded(savedTabsPageId, mainTab.pinned)
  await closeDuplicateTabs(savedTabsPages, savedTabsPageId)
  return savedTabsPageId
}
const createSavedTabsPage = async (
  savedTabsUrl: string,
): Promise<number | null> => {
  console.log('新しいタブを作成します')
  const newTab = await chrome.tabs.create({
    url: savedTabsUrl,
  })
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  savedTabsPageId = newTab.id || null
  console.log(`新しいsaved-tabsページを作成しました。ID: ${savedTabsPageId}`)
  if (savedTabsPageId) {
    await activateAndPinTabIfNeeded(savedTabsPageId, false)
  }
  return savedTabsPageId
}
/**
 * 保存されたタブを表示する共通関数
 */
const openSavedTabsPage = async (): Promise<number | null> => {
  // 既に作成中の場合は待機
  if (isCreatingSavedTabsPage) {
    console.log('既にsaved-tabsページの作成処理が実行中です。待機します...')
    // 既存のタブIDを返す
    if (savedTabsPageId) {
      console.log(`既存のsaved-tabsページのIDを返します: ${savedTabsPageId}`)
      return savedTabsPageId
    }

    // 処理中なのでダミーの値を返す（後で正しいIDに置き換えられる）
    return -1
  }

  // 作成中フラグをセット
  isCreatingSavedTabsPage = true
  try {
    // 保存されたタブを表示するページのURLを構築
    const savedTabsUrl = chrome.runtime.getURL('saved-tabs.html')
    console.log('開くURL:', savedTabsUrl)
    const reusedStoredTabId = await reuseStoredSavedTabsPageId()
    if (reusedStoredTabId) {
      return reusedStoredTabId
    }
    const allTabs = await chrome.tabs.query({})
    console.log(`全タブ数: ${allTabs.length}`)
    const savedTabsPages = findSavedTabsPages(allTabs)
    console.log(`既存のsaved-tabsページ数: ${savedTabsPages.length}`)
    const reusedExistingTabId = await reuseExistingSavedTabsPage(savedTabsPages)
    if (reusedExistingTabId) {
      return reusedExistingTabId
    }
    return await createSavedTabsPage(savedTabsUrl)
  } catch (error) {
    console.error('saved-tabsページを開く際にエラーが発生しました:', error)
    return null
  } finally {
    // 処理完了後にフラグをリセット
    isCreatingSavedTabsPage = false
  }
}
/**
 * 重複タブを閉じる
 */
const closeDuplicateTabs = async (
  savedTabsPages: chrome.tabs.Tab[],
  _mainTabId: number,
): Promise<void> => {
  if (savedTabsPages.length > 1) {
    console.log(`${savedTabsPages.length - 1}個の重複タブを閉じます`)
    await Promise.all(
      savedTabsPages.slice(1).map(async (tab) => {
        const tabId = tab.id
        if (typeof tabId === 'number') {
          try {
            await chrome.tabs.remove(tabId)
            console.log(`重複タブ ${tabId} を閉じました`)
          } catch (error) {
            console.error('重複タブを閉じる際にエラー:', error)
          }
        }
      }),
    )
  }
}
/**
 * Saved-tabsページのIDをリセット（テスト用）
 */
const resetSavedTabsPageId = (): void => {
  savedTabsPageId = null
  isCreatingSavedTabsPage = false
}

export { openSavedTabsPage, resetSavedTabsPageId }
