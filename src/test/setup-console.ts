import { afterEach, beforeEach } from 'vitest'

import '@testing-library/jest-dom/vitest'

const allowedConsoleMessagePrefixes = [
  'The width(-1) and height(-1) of chart should be greater than 0,',
  '[カテゴリ同期] ストレージ同期エラー:',
  'chrome.storage APIが利用できないため カテゴリ変更監視 はフォールバック動作になります',
  'chrome.storage APIが利用できないため 言語設定変更監視 はフォールバック動作になります',
  'chrome.storage APIが利用できないため 設定変更監視 はフォールバック動作になります',
  'chrome.storage APIが利用できないため 設定読み込み はフォールバック動作になります',
  'Failed to bulk delete analytics drilldown urls:',
  'Failed to delete analytics drilldown url:',
  'Failed to restore analytics drilldown urls:',
  'URL ID一括同期削除エラー:',
  'URLクリーンアップ中にエラー:',
  'URLデータ未解決ドメイン（代替URLを生成して継続）:',
  'URLレコード保存エラー:',
  'URLレコード取得エラー:',
  'URLをプロジェクトに追加中にエラーが発生しました:',
  'URL一括同期削除エラー:',
  'URL一覧の取得または削除エラー:',
  'URL削除エラー:',
  'URL参照チェック中にエラー:',
  'URL参照更新中にエラー:',
  'URL移動エラー:',
  'URL重複統合中にエラー:',
  'windows.getAll で全タブ取得に失敗したため tabs.query にフォールバックします',
  'エクスポート補完:',
  'カスタムプロジェクトからのURL削除中にエラーが発生しました:',
  'カスタムプロジェクトからのURL同期削除に失敗しました:',
  'カスタムプロジェクトからの複数URL ID削除中にエラーが発生しました:',
  'カスタムプロジェクトからの複数URL ID同期削除に失敗しました:',
  'カスタムプロジェクトからの複数URL削除中にエラーが発生しました:',
  'カスタムプロジェクト保存エラー:',
  'カスタムプロジェクト取得エラー:',
  'グループ削除エラー:',
  'ストレージ変更を検出:',
  'タイムスタンプ更新エラー:',
  '[storage] 配列要素',
  'タブを開く処理エラー:',
  'タブ一括オープンエラー:',
  'チェックエラー:',
  'ドメインモードの同期中にエラーが発生しました:',
  'プロジェクト順序の保存に失敗しました:',
  '不正なプロジェクトデータが検出されました:',
  '時刻更新エラー:',
  '未分類ドメイン順序の更新に失敗しました:',
  '未知のメッセージアクション:',
  '残り時間計算エラー:',
  '自動カテゴリ実行前に重複検出:',
  '親カテゴリ移行エラー:',
  '言語設定の読み込みエラー:',
  '重複ID検出:',
  '開いた後に削除したURLの復元に失敗しました:',
  'In HTML, %s cannot be a child of <%s>.%s',
  '<%s> cannot contain a nested %s.',
]

const stringifyConsoleArg = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const formatConsoleArgs = (args: unknown[]): string =>
  args.map(stringifyConsoleArg).join(' ')

const isAllowedConsoleMessage = (message: string): boolean =>
  allowedConsoleMessagePrefixes.some((prefix) => message.startsWith(prefix))

let unexpectedConsoleMessages: string[] = []
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

const createConsoleGuard =
  (type: 'error' | 'warn') =>
  (...args: unknown[]): void => {
    const message = formatConsoleArgs(args)

    if (!isAllowedConsoleMessage(message)) {
      unexpectedConsoleMessages.push(`console.${type}: ${message}`)
    }
  }

console.error = createConsoleGuard('error')
console.warn = createConsoleGuard('warn')

beforeEach(() => {
  unexpectedConsoleMessages = []
})

afterEach(() => {
  console.error = createConsoleGuard('error')
  console.warn = createConsoleGuard('warn')

  if (unexpectedConsoleMessages.length > 0) {
    originalConsoleError(
      [
        'Unexpected console.error/warn calls in test:',
        ...unexpectedConsoleMessages,
      ].join('\n'),
    )

    throw new Error(
      [
        'Unexpected console.error/warn calls in test:',
        ...unexpectedConsoleMessages,
      ].join('\n'),
    )
  }
})

process.once('exit', () => {
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})
