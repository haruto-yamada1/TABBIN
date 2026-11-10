/**
 * コンテキストメニュー管理モジュール
 */

import { getBackgroundMessage } from '@/lib/background/i18n'
import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'
import { logger } from '@/lib/logging/logger'
import type { ContextMenuId } from '@/types/background'

import {
  handleSaveAllWindowsTabs,
  handleSaveCurrentTab,
  handleSaveSameDomainTabs,
  handleSaveWindowTabs,
} from './extension-actions'
import { openSavedTabsPage } from './saved-tabs-page'

type ContextMenuChrome = {
  contextMenus?: Partial<Omit<typeof chrome.contextMenus, 'onClicked'>> & {
    onClicked?: Partial<typeof chrome.contextMenus.onClicked>
  }
  storage?: { onChanged?: Partial<typeof chrome.storage.onChanged> }
}
const getMenuChrome = () =>
  getChromeGlobal((value): value is ContextMenuChrome => isObjectLike(value))

type MenuItem = chrome.contextMenus.CreateProperties & { id: ContextMenuId }

const getMenuItems = async (): Promise<MenuItem[]> => {
  const [
    openSavedTabs,
    saveCurrentTab,
    saveAllTabs,
    saveSameDomainTabs,
    saveAllWindowsTabs,
  ] = await Promise.all([
    getBackgroundMessage('background.contextMenu.openSavedTabs'),
    getBackgroundMessage('background.contextMenu.saveCurrentTab'),
    getBackgroundMessage('background.contextMenu.saveAllTabs'),
    getBackgroundMessage('background.contextMenu.saveSameDomainTabs'),
    getBackgroundMessage('background.contextMenu.saveAllWindowsTabs'),
  ])
  return [
    {
      contexts: ['page'],
      id: 'openSavedTabs',
      title: openSavedTabs,
    },
    {
      contexts: ['page'],
      id: 'sepOpenSavedTabs',
      title: '',
      type: 'separator',
    },
    {
      contexts: ['page'],
      id: 'saveCurrentTab',
      title: saveCurrentTab,
    },
    {
      contexts: ['page'],
      id: 'saveAllTabs',
      title: saveAllTabs,
    },
    {
      contexts: ['page'],
      id: 'saveSameDomainTabs',
      title: saveSameDomainTabs,
    },
    {
      contexts: ['page'],
      id: 'saveAllWindowsTabs',
      title: saveAllWindowsTabs,
    },
  ]
}

const updateOrCreateMenu = async (item: MenuItem): Promise<void> =>
  new Promise((resolve, reject) => {
    const { id, ...properties } = item
    chrome.contextMenus.update(id, properties, () => {
      // Chrome has no getAll(). A missing ID is recovered by creating the same
      // stable ID; other failures (including duplicates) are consumed below.
      if (!chrome.runtime.lastError) {
        resolve()
        return
      }
      try {
        chrome.contextMenus.create(item, () => {
          if (chrome.runtime.lastError) {
            reject(new Error('Context menu creation failed'))
          } else {
            resolve()
          }
        })
      } catch (error) {
        reject(new Error('Context menu creation failed', { cause: error }))
      }
    })
  })

const removeMenus = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        reject(new Error('Context menu removal failed'))
      } else {
        resolve()
      }
    })
  })

let reconciliation = Promise.resolve()

/** Serialize install/update and settings events, recovering partial failures. */
const reconcileContextMenus = async (
  options: { reset?: boolean } = {},
): Promise<void> => {
  reconciliation = reconciliation
    .then(async () => {
      const menus = getMenuChrome()?.contextMenus
      if (
        typeof menus?.update !== 'function' ||
        typeof menus.create !== 'function' ||
        (options.reset && typeof menus.removeAll !== 'function')
      ) {
        logger.warn('background_context_menu_api_unavailable')
        return
      }
      // Resolve translations before a deliberate install/update reset.
      const items = await getMenuItems()
      if (options.reset) {
        await removeMenus()
      }
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop -- menu insertion order is visible to users
        await updateOrCreateMenu(item)
      }
    })
    .catch((error: unknown) => {
      logger.error('background_context_menu_reconciliation_failed', error)
    })
  return reconciliation
}

const dispatchMenuClick = async (
  info: chrome.contextMenus.OnClickData,
  _tab?: chrome.tabs.Tab,
): Promise<void> => {
  try {
    switch (info.menuItemId) {
      case 'saveCurrentTab': {
        await handleSaveCurrentTab()
        break
      }
      case 'saveAllTabs': {
        await handleSaveWindowTabs()
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
      case 'openSavedTabs': {
        await openSavedTabsPage()
        break
      }
      default: {
        break
      }
    }
  } catch (error) {
    logger.error('background_context_menu_action_failed', error)
  }
}

const handleMenuClick = (info: chrome.contextMenus.OnClickData): void => {
  void dispatchMenuClick(info)
}

/** MV3 wake subscriptions must be synchronous and independent of all I/O. */
const registerContextMenuClickListener = (): void => {
  try {
    const clicked = getMenuChrome()?.contextMenus?.onClicked
    if (
      typeof clicked?.hasListener !== 'function' ||
      typeof clicked.addListener !== 'function'
    ) {
      logger.warn('background_context_menu_api_unavailable')
      return
    }
    if (!clicked.hasListener(handleMenuClick)) {
      clicked.addListener(handleMenuClick)
    }
  } catch (error) {
    logger.error('background_context_menu_listener_failed', error)
  }
}

const storedLanguage = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && 'language' in value
    ? value.language
    : undefined

const handleSettingsChanged = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
): void => {
  const settings = changes.userSettings
  if (
    area === 'local' &&
    settings &&
    storedLanguage(settings.oldValue) !== storedLanguage(settings.newValue)
  ) {
    void reconcileContextMenus()
  }
}

const registerContextMenuSettingsListener = (): void => {
  try {
    const changed = getMenuChrome()?.storage?.onChanged
    if (
      typeof changed?.hasListener === 'function' &&
      typeof changed.addListener === 'function' &&
      !changed.hasListener(handleSettingsChanged)
    ) {
      changed.addListener(handleSettingsChanged)
    }
  } catch (error) {
    logger.error('background_context_menu_settings_listener_failed', error)
  }
}

export {
  reconcileContextMenus,
  registerContextMenuClickListener,
  registerContextMenuSettingsListener,
}
