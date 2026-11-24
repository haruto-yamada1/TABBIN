import { browser } from 'wxt/browser'

import {
  getAppEntryHref,
  getSavedTabsEntryRoute,
} from '@/features/navigation/lib/pageNavigation'

/** 保存画面の識別とタブの再利用を管理する。 */
let openingSavedTabsPage: Promise<number | null> | null = null
let savedTabsPageId: number | null = null
let duplicateCleanupRequested = false
const NEW_PAGE_TIMEOUT_MS = 10_000

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

const hasSavedTabsPageRoute = (tab: chrome.tabs.Tab): boolean =>
  isSavedTabsPageUrl(tab.pendingUrl ?? tab.url)

// Firefox can keep the previous URL during loading without a pendingUrl.
const hasUnconfirmedFirefoxNavigation = (tab: chrome.tabs.Tab): boolean =>
  tab.status === 'loading' &&
  tab.pendingUrl === undefined &&
  browser.runtime.getURL('/').startsWith('moz-extension:')

const isSavedTabsPage = (tab: chrome.tabs.Tab): boolean =>
  hasSavedTabsPageRoute(tab) && !hasUnconfirmedFirefoxNavigation(tab)

const getTab = async (tabId: number): Promise<chrome.tabs.Tab | null> => {
  try {
    const tab = await browser.tabs.get(tabId)
    return tab.id === tabId ? tab : null
  } catch {
    return null
  }
}

const getSavedTabsPage = async (
  tabId: number,
): Promise<chrome.tabs.Tab | null> => {
  const tab = await getTab(tabId)
  return tab && isSavedTabsPage(tab) ? tab : null
}

const isProvisionalTab = (tab: chrome.tabs.Tab | null): boolean =>
  tab !== null &&
  tab.pendingUrl === undefined &&
  (tab.url === undefined ||
    tab.url === 'about:blank' ||
    (hasUnconfirmedFirefoxNavigation(tab) && hasSavedTabsPageRoute(tab)))

/** Firefox may return about:blank before the requested extension page commits. */
const waitForSavedTabsPage = async (tabId: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (confirmed: boolean) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      browser.tabs.onUpdated.removeListener(onUpdated)
      browser.tabs.onRemoved.removeListener(onRemoved)
      resolve(confirmed)
    }
    const inspect = (tab: chrome.tabs.Tab | null) => {
      if (tab && isSavedTabsPage(tab)) {
        finish(true)
      } else if (!isProvisionalTab(tab)) {
        finish(false)
      }
    }
    const onUpdated: Parameters<
      typeof browser.tabs.onUpdated.addListener
    >[0] = (id, _change, tab) => {
      if (id === tabId) {
        inspect(tab)
      }
    }
    const onRemoved = (id: number) => {
      if (id === tabId) {
        finish(false)
      }
    }
    const timer = setTimeout(() => {
      finish(false)
    }, NEW_PAGE_TIMEOUT_MS)
    try {
      browser.tabs.onUpdated.addListener(onUpdated)
      browser.tabs.onRemoved.addListener(onRemoved)
      // Read after subscribing so a commit between create() and subscription
      // is still observed.
      void getTab(tabId).then(inspect)
    } catch {
      finish(false)
    }
  })

const getReadyExistingPage = async (
  tabId: number,
): Promise<chrome.tabs.Tab | null> => {
  const tab = await getTab(tabId)
  if (!tab || !hasSavedTabsPageRoute(tab)) {
    return null
  }
  if (hasUnconfirmedFirefoxNavigation(tab)) {
    return (await waitForSavedTabsPage(tabId)) ? getSavedTabsPage(tabId) : null
  }
  return tab
}

const activateAndPinTabIfNeeded = async (tabId: number): Promise<boolean> => {
  const tab = await getReadyExistingPage(tabId)
  if (!tab) {
    return false
  }
  await browser.tabs.update(tabId, { active: true })
  if (!tab.pinned) {
    const current = await getReadyExistingPage(tabId)
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

const querySavedTabsPages = async (): Promise<chrome.tabs.Tab[]> =>
  (await browser.tabs.query({})).filter(isSavedTabsPage)

const closeDuplicateTabs = async (mainTabId: number): Promise<void> => {
  try {
    const candidates = await querySavedTabsPages()
    const duplicateIds = new Set(
      candidates
        .map((tab) => tab.id)
        .filter((id): id is number => isValidTabId(id) && id !== mainTabId),
    )
    const checked = await Promise.all(
      [...duplicateIds].map(async (id) =>
        (await getSavedTabsPage(id)) && (await getSavedTabsPage(mainTabId))
          ? id
          : undefined,
      ),
    )
    const verifiedIds = checked.filter(isValidTabId)
    if (verifiedIds.length === 0) {
      return
    }

    // Either tab can navigate during the individual checks. Confirm both
    // identities in one browser snapshot immediately before removing tabs.
    const currentIds = new Set(
      (await querySavedTabsPages()).map((tab) => tab.id),
    )
    if (!currentIds.has(mainTabId)) {
      return
    }
    await Promise.all(
      verifiedIds
        .filter((id) => currentIds.has(id))
        .map(async (id) => {
          try {
            await browser.tabs.remove(id)
          } catch (error) {
            console.error('重複タブを閉じる際にエラー:', error)
          }
        }),
    )
  } catch (error) {
    console.error('重複タブを検索する際にエラー:', error)
  }
}

const findOrCreateSavedTabsPage = async (): Promise<number | null> => {
  const cachedId = savedTabsPageId
  savedTabsPageId = null
  if (cachedId !== null && (await activateAndPinTabIfNeeded(cachedId))) {
    return cachedId
  }
  const candidates = (await browser.tabs.query({})).filter(
    hasSavedTabsPageRoute,
  )
  for (const { id } of candidates) {
    // eslint-disable-next-line eslint/no-await-in-loop -- Only activate one validated candidate; parallel activation would touch every tab.
    if (isValidTabId(id) && (await activateAndPinTabIfNeeded(id))) {
      return id
    }
  }

  const created = await browser.tabs.create({
    url: new URL(
      getAppEntryHref(getSavedTabsEntryRoute()),
      browser.runtime.getURL('/'),
    ).href,
    pinned: true,
  })
  if (!isValidTabId(created.id)) {
    return null
  }
  if (isProvisionalTab(created) && !(await waitForSavedTabsPage(created.id))) {
    return null
  }
  return created.id
}

const openSharedSavedTabsPage = async (): Promise<number | null> => {
  try {
    const id = await findOrCreateSavedTabsPage()
    if (id === null || !(await getSavedTabsPage(id))) {
      return null
    }
    // An explicit open can join while locating or creating the main tab.
    if (duplicateCleanupRequested) {
      await closeDuplicateTabs(id)
      if (!(await getSavedTabsPage(id))) {
        return null
      }
    }
    savedTabsPageId = id
    return id
  } catch (error) {
    console.error('saved-tabsページを開く際にエラーが発生しました:', error)
    return null
  } finally {
    openingSavedTabsPage = null
    duplicateCleanupRequested = false
  }
}

/** 全呼び出し元が同じ確定済みID、または失敗時のnullを受け取る。 */
const openSavedTabsPage = async ({
  closeDuplicates = true,
}: { readonly closeDuplicates?: boolean } = {}): Promise<number | null> => {
  duplicateCleanupRequested ||= closeDuplicates
  openingSavedTabsPage ??= openSharedSavedTabsPage()
  return openingSavedTabsPage
}

/** テスト用。進行中の処理が終了した後にリセットする。 */
const resetSavedTabsPageId = (): void => {
  savedTabsPageId = null
  openingSavedTabsPage = null
  duplicateCleanupRequested = false
}

export { openSavedTabsPage, resetSavedTabsPageId }
