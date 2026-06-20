/**
 * コンテキストメニュー管理モジュール
 */

import { getBackgroundMessage } from '@/lib/background/i18n'
import type { ContextMenuId } from '@/types/background'

import {
  handleSaveAllWindowsTabs,
  handleSaveCurrentTab,
  handleSaveSameDomainTabs,
  handleSaveWindowTabs,
} from './extension-actions'
import { openSavedTabsPage } from './saved-tabs-page'

/**
 * コンテキストメニューを作成する関数
 */
const createContextMenus = (): void => {
  console.log('コンテキストメニュー作成開始')

  // 既存のメニューをすべて削除
  if ('contextMenus' in chrome) {
    try {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          console.error('メニュー削除エラー:', chrome.runtime.lastError)
        }
        console.log('既存のコンテキストメニューを削除しました')

        // メニュー項目を作成
        void createMenuItems()
          .then(() => {
            setupMenuClickHandler()
            console.log('コンテキストメニューを作成しました')
          })
          .catch((error: unknown) => {
            console.error('メニュー作成エラー:', error)
          })
      })
    } catch (error) {
      console.error('メニュー削除中のエラー:', error)
    }
  } else {
    console.error(
      'chrome.contextMenus APIが利用できません。manifest.jsonのパーミッションを確認してください。',
    )
  }
}
/**
 * メニュー項目を作成
 */
const createMenuItems = async (): Promise<void> => {
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
  const menuItems: {
    id: ContextMenuId
    title: string
    type?: 'separator'
    contexts: ['page']
  }[] = [
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
  for (const item of menuItems) {
    chrome.contextMenus.create({
      contexts: item.contexts,
      id: item.id,
      title: item.title,
      ...(item.type && {
        type: item.type,
      }),
    })
  }
}
/**
 * コンテキストメニュークリックハンドラーを設定
 */
const setupMenuClickHandler = (): void => {
  // eslint-disable-next-line typescript/no-misused-promises
  chrome.contextMenus.onClicked.addListener(async (info, _tab) => {
    console.log(`コンテキストメニューがクリックされました: ${info.menuItemId}`)
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
      console.error('コンテキストメニュー処理エラー:', error)
    }
  })
  console.log('コンテキストメニュークリックハンドラーを設定しました')
}

export { createContextMenus }
