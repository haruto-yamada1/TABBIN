import { browser } from 'wxt/browser'

import {
  readNativeTitleSavedUrls,
  subscribeNativeTitleSavedChanges,
} from '@/app/composition/nativeTitleIndicator'
import {
  PRODUCTION_OPTIONAL_EXTENSION_PERMISSIONS,
  PRODUCTION_OPTIONAL_HOST_PERMISSIONS,
} from '@/constants/extensionPermissions'
import { SAVED_TAB_TITLE_ENABLED_KEY } from '@/constants/savedTabTitleIndicator'
import {
  applySavedTabTitle,
  NATIVE_SAVED_TAB_TITLE_ACTION,
} from '@/lib/browser/saved-tab-title'
import { readSavedTabTitleEnabled } from '@/lib/storage/saved-tab-title-indicator'

import { createSavedTabTitleState } from './saved-tab-title-state'

const state = createSavedTabTitleState({
  readEnabled: async () =>
    (await readSavedTabTitleEnabled()) &&
    (await browser.permissions.contains({
      permissions: [...PRODUCTION_OPTIONAL_EXTENSION_PERMISSIONS],
      origins: [...PRODUCTION_OPTIONAL_HOST_PERMISSIONS],
    })),
  readSavedUrls: readNativeTitleSavedUrls,
  queryTabs: async () => browser.tabs.query({}),
  apply: async (id, url) => {
    await browser.scripting.executeScript({
      target: { tabId: id },
      func: applySavedTabTitle,
      args: [true, url],
    })
  },
  restore: async (id) => {
    await browser.tabs.sendMessage(id, {
      action: NATIVE_SAVED_TAB_TITLE_ACTION,
      command: 'restore',
    })
  },
})

export const refreshSavedTabTitleIndicator = async (): Promise<void> =>
  state.refresh()

let registered = false
/** Register wake listeners synchronously before background bootstrap awaits. */
export const registerSavedTabTitleIndicator = (): void => {
  if (registered) {
    return
  }
  registered = true
  browser.tabs.onUpdated.addListener((_id, change, tab) => {
    if (
      change.url !== undefined ||
      change.title !== undefined ||
      change.status === 'complete'
    ) {
      void state.update(tab)
    }
  })
  browser.tabs.onRemoved.addListener((id) => {
    state.removed(id)
  })
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then(state.update, () => {})
  })
  browser.permissions.onAdded.addListener(() => {
    void state.refresh()
  })
  browser.permissions.onRemoved.addListener(() => {
    void state.refresh()
  })
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      Object.hasOwn(changes, SAVED_TAB_TITLE_ENABLED_KEY)
    ) {
      void state.refresh()
    }
  })
  try {
    subscribeNativeTitleSavedChanges(() => {
      void state.refresh()
    })
  } catch {
    // An optional title observer must not interrupt the background bootstrap.
  }
  void state.refresh()
}
