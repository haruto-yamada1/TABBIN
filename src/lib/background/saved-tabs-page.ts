import { browser } from 'wxt/browser'

/** 保存画面の識別とタブの再利用を管理する。 */
let openingSavedTabsPage: Promise<number | null> | null = null
let savedTabsPageId: number | null = null

const isSavedTabsPageUrl = (value?: string): boolean => {
  if (!value) {
    return false
  }
  try {
    const expected = new URL(browser.runtime.getURL('/saved-tabs.html'))
    const url = new URL(value)
    // Extension schemes have an opaque URL.origin in some runtimes.
    if (
      (expected.protocol !== 'chrome-extension:' &&
        expected.protocol !== 'moz-extension:') ||
      !expected.hostname ||
      url.protocol !== expected.protocol ||
      url.host !== expected.host ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== ''
    ) {
      return false
    }
    if (url.pathname === expected.pathname) {
      return true
    }
    const appUrl = new URL(browser.runtime.getURL('/app.html'))
    return (
      url.pathname === appUrl.pathname &&
      (url.hash === '#/saved-tabs' || url.hash.startsWith('#/saved-tabs?'))
    )
  } catch {
    return false
  }
}

const isSavedTabsPage = (tab: chrome.tabs.Tab): boolean =>
  // A pending navigation away makes the current URL unsafe to reuse or close.
  isSavedTabsPageUrl(tab.pendingUrl ?? tab.url)

const getSavedTabsPage = async (
  tabId: number,
): Promise<chrome.tabs.Tab | null> => {
  try {
    const tab = await browser.tabs.get(tabId)
    return tab.id === tabId && isSavedTabsPage(tab) ? tab : null
  } catch {
    return null
  }
}

const activateAndPinTabIfNeeded = async (tabId: number): Promise<boolean> => {
  const tab = await getSavedTabsPage(tabId)
  if (!tab) {
    return false
  }
  await browser.tabs.update(tabId, { active: true })
  if (!tab.pinned) {
    const current = await getSavedTabsPage(tabId)
    if (!current) {
      return false
    }
    if (!current.pinned) {
      try {
        await browser.tabs.update(tabId, { pinned: true })
      } catch (error) {
        console.error('タブのピン留め設定中にエラー:', error)
      }
    }
  }
  return true
}

const isValidTabId = (id: number | undefined): id is number =>
  id !== undefined && Number.isInteger(id) && id >= 0

const closeDuplicateTabs = async (
  candidates: chrome.tabs.Tab[],
  mainTabId: number,
): Promise<void> => {
  const duplicateIds = new Set(
    candidates
      .map((tab) => tab.id)
      .filter((id) => isValidTabId(id) && id !== mainTabId),
  )
  await Promise.all(
    [...duplicateIds].map(async (id) => {
      if (!isValidTabId(id) || !(await getSavedTabsPage(id))) {
        return
      }
      try {
        await browser.tabs.remove(id)
      } catch (error) {
        console.error('重複タブを閉じる際にエラー:', error)
      }
    }),
  )
}

const findOrCreateSavedTabsPage = async (): Promise<number | null> => {
  try {
    if (savedTabsPageId !== null) {
      const cachedId = savedTabsPageId
      savedTabsPageId = null
      if (await activateAndPinTabIfNeeded(cachedId)) {
        savedTabsPageId = cachedId
        return cachedId
      }
    }
    const candidates = (await browser.tabs.query({})).filter(isSavedTabsPage)
    for (const candidate of candidates) {
      const id = candidate.id
      // eslint-disable-next-line eslint/no-await-in-loop -- Only activate one validated candidate; parallel activation would touch every tab.
      if (isValidTabId(id) && (await activateAndPinTabIfNeeded(id))) {
        savedTabsPageId = id
        // eslint-disable-next-line eslint/no-await-in-loop -- Finish cleanup for the selected main tab before returning its ID.
        await closeDuplicateTabs(candidates, id)
        return id
      }
    }
    const created = await browser.tabs.create({
      url: browser.runtime.getURL('/saved-tabs.html'),
      // Firefox can report about:blank until the requested page commits.
      // Set the initial pin state at creation, without updating a provisional tab.
      pinned: true,
    })
    if (isValidTabId(created.id)) {
      savedTabsPageId = created.id
      return created.id
    }
  } catch (error) {
    console.error('saved-tabsページを開く際にエラーが発生しました:', error)
  }
  savedTabsPageId = null
  return null
}

/** 全呼び出し元が同じ確定済みID、または失敗時のnullを受け取る。 */
const openSavedTabsPage = async (): Promise<number | null> => {
  openingSavedTabsPage ??= findOrCreateSavedTabsPage().finally(() => {
    openingSavedTabsPage = null
  })
  return openingSavedTabsPage
}

/** テスト用。進行中の処理が終了した後にリセットする。 */
const resetSavedTabsPageId = (): void => {
  savedTabsPageId = null
  openingSavedTabsPage = null
}

export { openSavedTabsPage, resetSavedTabsPageId }
