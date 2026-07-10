import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * 「URL を開いたあと、保存リストから削除するか」を決める pure ポリシー。
 *
 * 既存 `SavedTabsApp.tsx` の挙動を domain 側で再表現する。
 * 設定 `removeTabAfterOpen` を起点に、開いた URL 集合と保存タブ集合から
 * 「削除すべき `UrlRecordId` の集合」を計算する。
 *
 * 実際の削除（`chrome.storage.local` 書き込み）は use-case / infrastructure
 * 側で行うため、このサービスは純粋に判定だけを担当する。
 */

/**
 * 削除ポリシーの設定値。
 *
 * `removeTabAfterOpen`: 通常クリックで開いた URL を削除するか
 * `removeTabAfterExternalDrop`: 外部アプリへドラッグして開いた URL を削除するか
 */
export type OpenedUrlRemovalSettings = {
  readonly removeTabAfterOpen: boolean
  readonly removeTabAfterExternalDrop: boolean
}

/**
 * URL を開いた経路。
 *
 * - `click`: ユーザーが URL をクリックした
 * - `externalDrop`: 外部アプリへドラッグしてドロップで開いた
 */
export type OpenedUrlOrigin = 'click' | 'externalDrop'

/**
 * 開いた URL の入力情報。
 */
export type OpenedUrlInput = {
  readonly urlRecordId: UrlRecordId
  readonly origin: OpenedUrlOrigin
}

const shouldRemoveOpenedUrl = (
  origin: OpenedUrlOrigin,
  settings: OpenedUrlRemovalSettings,
): boolean => {
  if (origin === 'click') {
    return settings.removeTabAfterOpen
  }
  return settings.removeTabAfterExternalDrop
}

/**
 * 設定と開いた URL から、保存タブから削除すべき `UrlRecordId` の集合を返す。
 *
 * `origin` ごとに設定を評価し、削除許可された URL だけを抽出する。
 * 重複は自動的に排除される。
 *
 * @example
 * ```ts
 * const ids = decideUrlRecordIdsToRemoveAfterOpen({
 *   openedUrls: [{ urlRecordId: id, origin: 'click' }],
 *   settings: { removeTabAfterOpen: true, removeTabAfterExternalDrop: false },
 * })
 * ```
 */
export const decideUrlRecordIdsToRemoveAfterOpen = ({
  openedUrls,
  settings,
}: {
  openedUrls: readonly OpenedUrlInput[]
  settings: OpenedUrlRemovalSettings
}): ReadonlySet<UrlRecordId> => {
  const result = new Set<UrlRecordId>()
  for (const opened of openedUrls) {
    if (shouldRemoveOpenedUrl(opened.origin, settings)) {
      result.add(opened.urlRecordId)
    }
  }
  return result
}

/**
 * URL 文字列の集合から、保存タブ内の対応 `UrlRecordId` を逆引きする。
 *
 * `SavedTabsApp.tsx` の `buildUrlIdsToRemove` を domain 等価物にしたもの。
 * `chrome.tabs.create` 側から返ってくるのは URL 文字列だけのため、
 * 削除候補を `UrlRecordId` に正規化するためのヘルパー。
 *
 * @example
 * ```ts
 * const ids = lookupUrlRecordIdsByUrl({
 *   urlRecords,
 *   urls: ['https://example.com'],
 * })
 * ```
 */
export const lookupUrlRecordIdsByUrl = ({
  urlRecords,
  urls,
}: {
  urlRecords: readonly UrlRecord[]
  urls: readonly string[]
}): ReadonlySet<UrlRecordId> => {
  const targetSet = new Set(urls)
  const result = new Set<UrlRecordId>()
  for (const record of urlRecords) {
    if (targetSet.has(record.url)) {
      result.add(record.id)
    }
  }
  return result
}

/**
 * 指定 `UrlRecordId` の集合を取り除いた `TabGroup` 集合を返す pure 関数。
 *
 * 空になった `TabGroup` は結果から取り除く。
 * 既存 `removeUrlIdsFromSavedTabs` の domain 等価物。
 *
 * @example
 * ```ts
 * const updated = removeUrlRecordIdsFromTabGroups({
 *   tabGroups,
 *   urlRecordIdsToRemove,
 * })
 * ```
 */
export const removeUrlRecordIdsFromTabGroups = ({
  tabGroups,
  urlRecordIdsToRemove,
}: {
  tabGroups: readonly TabGroup[]
  urlRecordIdsToRemove: ReadonlySet<UrlRecordId>
}): TabGroup[] => {
  if (urlRecordIdsToRemove.size === 0) {
    return [...tabGroups]
  }
  const result: TabGroup[] = []
  for (const group of tabGroups) {
    const remainingUrlIds = group.urlIds.filter(
      (urlId) => !urlRecordIdsToRemove.has(urlId),
    )
    if (remainingUrlIds.length === group.urlIds.length) {
      result.push(group)
      continue
    }
    if (remainingUrlIds.length === 0) {
      continue
    }
    result.push({
      ...group,
      urlIds: remainingUrlIds,
    })
  }
  return result
}
