/**
 * Background script - メインエントリーポイント
 * リファクタリング後のモジュラー構造
 */

import { defineBackground } from 'wxt/utils/define-background'

import { getMigrationPreflightController } from '@/app/composition/createMigrationPreflightController'
import { setupExpiredTabsCheckAlarm } from '@/lib/background/alarm-notification'
// 分離したモジュールをインポート
import { createContextMenus } from '@/lib/background/context-menu'
import { handleExtensionActionClick } from '@/lib/background/extension-actions'
import { setupMessageListener } from '@/lib/background/message-handler'
import { openSavedTabsPage } from '@/lib/background/saved-tabs-page'
import { handleTabCreated } from '@/lib/background/url-storage'
import { logger } from '@/lib/logging/logger'

export default defineBackground(() => {
  // eslint-disable-line import/no-default-export
  // 拡張機能インストール・更新時の処理
  // eslint-disable-next-line typescript/no-misused-promises
  chrome.runtime.onInstalled.addListener(async (details) => {
    const manifestVersion = chrome.runtime.getManifest().version

    try {
      if (details.reason === 'install') {
        await openSavedTabsPage()
        await chrome.storage.local.set({
          changelogShown: true,
          seenVersion: manifestVersion,
        })
      } else if (details.reason === 'update') {
        // バージョンアップ時に変更点を表示（一度だけ）
        const items = await chrome.storage.local.get({
          changelogShown: false,
          seenVersion: '',
        })

        if (items.seenVersion !== manifestVersion && !items.changelogShown) {
          // まだ表示していない場合のみ開く
          await chrome.tabs.create({
            url: chrome.runtime.getURL('changelog.html'),
          })
          await chrome.storage.local.set({
            changelogShown: true, // 表示したことをマークする
            seenVersion: manifestVersion,
          })
          logger.debug('background_changelog_displayed')
        }
        if (items.seenVersion !== manifestVersion && items.changelogShown) {
          // ただしバージョンは更新する
          await chrome.storage.local.set({ seenVersion: manifestVersion })
          logger.debug('background_changelog_already_displayed')
        }

        // 更新時も保存タブページを前面表示 + ピン留めする
        await openSavedTabsPage()
      }
    } catch (error) {
      logger.error('background_install_update_failed', error)
    }
  })

  // ブラウザ起動時にも保存タブページを自動で開く
  // eslint-disable-next-line typescript/no-misused-promises
  chrome.runtime.onStartup.addListener(async () => {
    try {
      logger.debug('background_saved_tabs_open_started')
      await openSavedTabsPage()
    } catch (error) {
      logger.error('background_saved_tabs_open_failed', error)
    }
  })

  // 初期化時にコンテキストメニューとハンドラーを設定
  try {
    // コンテキストメニューを作成
    createContextMenus()
    logger.debug('background_context_menu_initialized')
  } catch (error) {
    logger.error('background_context_menu_initialization_failed', error)
  }
  // バックグラウンド初期化時にpreflight済みのPersistence v2 migrationを
  // 一度だけ開始または再開する。bootstrap/control-state coordinationが
  // concurrent contextを直列化し、verification前のcutoverを防ぐ。
  void (async () => {
    try {
      logger.debug('background_persistence_migration_started')
      await getMigrationPreflightController().run()
      logger.debug('background_persistence_migration_completed')

      // 期限切れタブのチェック用アラームを設定
      setupExpiredTabsCheckAlarm()
    } catch (error) {
      logger.error('background_initialization_failed', error)
    }
  })()

  // ブラウザアクション（拡張機能アイコン）クリック時の処理
  // eslint-disable-next-line typescript/no-misused-promises
  chrome.action.onClicked.addListener(handleExtensionActionClick)

  // メッセージリスナーを設定
  setupMessageListener()

  // 新しいタブが作成されたときの処理
  // eslint-disable-next-line typescript/no-misused-promises
  chrome.tabs.onCreated.addListener(handleTabCreated)
})
