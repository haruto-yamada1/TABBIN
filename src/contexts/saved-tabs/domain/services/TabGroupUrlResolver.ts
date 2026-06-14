import type { TabGroup } from '@/types/storage'

import type { UrlRecord } from '../entities/UrlRecord'
import { urlRecordIdToString } from '../value-objects/UrlRecordId'

/**
 * ドメイン型として保持している `TabGroup` に対して、
 * `urlIds` から `UrlRecord` を引き当てて `urls` フィールドを組み立てる
 * pure ドメインサービス。
 *
 * 旧 `src/lib/storage/tabs.resolveTabGroupsWithUrls` /
 * `src/lib/storage/tabs.getTabGroupUrls` の domain 等価物。
 * `chrome.storage.local` を知らず、repository 経由の読み取りを
 * 呼び出し側（use-case）に委ねる。
 *
 * `urlSubCategories` 引き継ぎはここで行う（presentation 層での
 * `subCategory` 付与より domain 側で確定させる方が、presentation
 * 層の `lib/storage` 直叩きを置換しやすい）。
 *
 * 入力 / 出力は storage 形の `TabGroup` を採用している。domain
 * エンティティは `urlSubCategories` などの rich 補助フィールドを
 * 持たないが、presentation 層は `subCategory` 引き継ぎが必要
 * なため storage 形を直接扱う。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */

export interface ResolvedTabGroupUrl {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly savedAt: number
  readonly subCategory?: string
}

/**
 * `TabGroup.urlIds` を `UrlRecord` に解決し、`urls` フィールドを
 * 埋めた `TabGroup[]` を返す。
 *
 * - `urlGroups` が空配列なら空配列を返す（storage アクセス不要）。
 * - `urlIds` が空のグループは `urls: []` として返す（旧挙動と一致）。
 * - `urlSubCategories` があれば、各 URL に `subCategory` を引き継ぐ。
 *
 * 戻り値は `TabGroup[]` 型だが、storage `TabGroup.urls` の要素型は
 * 緩い（`id?` / `savedAt?` 任意）なので、戻り値では `id` と
 * `savedAt` が常に存在する点を TypeScript に明示するため
 * `ResolvedTabGroupUrl[]` を経由せず `TabGroup` 配列として返す。
 * 呼び出し側で `TabGroup[]` として扱えば十分。
 */
export const resolveTabGroupsWithUrls = ({
  tabGroups,
  urlRecords,
}: {
  tabGroups: readonly TabGroup[]
  urlRecords: readonly UrlRecord[]
}): readonly TabGroup[] => {
  if (tabGroups.length === 0) {
    return []
  }

  const urlRecordMap = new Map<string, UrlRecord>()
  for (const record of urlRecords) {
    // domain `UrlRecord.id` は branded `UrlRecordId` だが、Map キーは
    // 文字列比較で十分なため raw string へ寄せる。
    urlRecordMap.set(urlRecordIdToString(record.id), record)
  }
  return tabGroups.map((group) => ({
    ...group,
    urls: resolveGroupUrls({
      group,
      urlRecordMap,
    }),
  }))
}

export const resolveGroupUrls = ({
  group,
  urlRecordMap,
}: {
  group: TabGroup
  urlRecordMap: ReadonlyMap<string, UrlRecord>
}): NonNullable<TabGroup['urls']> => {
  if (!(group.urlIds && group.urlIds.length > 0)) {
    return []
  }
  return group.urlIds.flatMap((urlId) => {
    const record = urlRecordMap.get(urlId)
    if (!record) {
      return []
    }
    const recordId = urlRecordIdToString(record.id)
    return [
      {
        id: recordId,
        savedAt: record.savedAt,
        title: record.title,
        url: record.url,
        ...(group.urlSubCategories?.[recordId] !== undefined
          ? { subCategory: group.urlSubCategories[recordId] }
          : {}),
      },
    ]
  })
}
