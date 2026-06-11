/* eslint-disable import/first */
/**
 * Background script - メインエントリーポイント
 * リファクタリング後のモジュラー構造
 */

// プロダクションビルドではデバッグログを抑制する
if (!import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log = () => {}
  // eslint-disable-next-line no-console
  console.debug = () => {}
}

import { defineBackground } from 'wxt/utils/define-background'

import { setupExpiredTabsCheckAlarm } from '@/lib/background/alarm-notification'
// 分離したモジュールをインポート
import { createContextMenus } from '@/lib/background/context-menu'
import { handleExtensionActionClick } from '@/lib/background/extension-actions'
import { setupMessageListener } from '@/lib/background/message-handler'
import { openSavedTabsPage } from '@/lib/background/saved-tabs-page'
import { handleTabCreated } from '@/lib/background/url-storage'
import { getParentCategories } from '@/lib/storage/categories'
import { migrateParentCategoriesToDomainNames } from '@/lib/storage/migration'

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

        if (items.seenVersion !== manifestVersion) {
          // 新しいバージョンの場合、changelogShownをリセット
          if (items.changelogShown) {
            // ただしバージョンは更新する
            await chrome.storage.local.set({ seenVersion: manifestVersion })
            console.log(
              `新バージョン ${manifestVersion} に更新されましたが、変更履歴は既に表示済みです`,
            )
          } else {
            // まだ表示していない場合のみ開く
            await chrome.tabs.create({
              url: chrome.runtime.getURL('changelog.html'),
            })
            await chrome.storage.local.set({
              changelogShown: true, // 表示したことをマークする
              seenVersion: manifestVersion,
            })
            console.log(
              `新バージョン ${manifestVersion} の変更履歴を表示しました`,
            )
          }
        }

        // 更新時も保存タブページを前面表示 + ピン留めする
        await openSavedTabsPage()
      }
    } catch (error) {
      console.error('インストール/更新時の自動オープン処理エラー:', error)
    }
  })

  // ブラウザ起動時にも保存タブページを自動で開く
  // eslint-disable-next-line typescript/no-misused-promises
  chrome.runtime.onStartup.addListener(async () => {
    try {
      console.log('ブラウザ起動時にsaved-tabsページを開きます')
      await openSavedTabsPage()
    } catch (error) {
      console.error(
        '起動時のsaved-tabsページ自動オープンに失敗しました:',
        error,
      )
    }
  })

  // 初期化時にコンテキストメニューとハンドラーを設定
  try {
    // コンテキストメニューを作成
    createContextMenus()
    console.log('コンテキストメニューの初期化が完了しました')
  } catch (error) {
    console.error('コンテキストメニュー初期化エラー:', error)
  }
  // バックグラウンド初期化時に一度だけマイグレーションを実行
  // eslint-disable-next-line typescript/no-floating-promises
  ;(async () => {
    try {
      console.log('バックグラウンド起動時のデータ構造チェックを開始...')

      // 既存のカテゴリを確認
      const categories = await getParentCategories()
      console.log('現在の親カテゴリ:', categories)

      // 強制的にマイグレーションを実行する
      console.log('親カテゴリのdomainNamesの強制マイグレーションを実行')
      await migrateParentCategoriesToDomainNames()

      // 移行後のデータを確認
      const updatedCategories = await getParentCategories()
      console.log('移行後の親カテゴリ:', updatedCategories)

      // 期限切れタブのチェック用アラームを設定
      setupExpiredTabsCheckAlarm()
    } catch (error) {
      console.error('バックグラウンド初期化エラー:', error)
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
