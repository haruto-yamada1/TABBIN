import type { TabGroup } from '@/types/storage'

import type { UrlRecord } from '../entities/UrlRecord'

/**
 * 単一 `TabGroup` の `urlIds` 並び替えに関する pure ドメインサービス。
 *
 * 旧 `src/lib/storage/tabs.reorderTabGroupUrls` 内の URL 並び替え
 * ロジックを domain 等価物として抽出したもの。
 * `chrome.storage.local` を知らず、永続化は use-case / repository
 * 側に委ねる。
 *
 * 戻り値の `urlIds` は `string[]` のまま返す。domain `TabGroup` の
 * `urlIds` は branded `UrlRecordId[]` だが、use-case 側で
 * `createUrlRecordId` をかけて再ラップする（既存の
 * `TabGroupRepository.saveAll` も branded 型を受け取れる）。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */

/**
 * `newUrlOrder`（URL 文字列配列）に基づいて、対象 `TabGroup` の
 * `urlIds` の新しい並び順を計算して返す。
 *
 * - 入力 `group` の `urlIds` が空、または `newUrlOrder` が空なら
 *   `urlIds` をそのまま返す（破壊的変更なし）。
 * - `newUrlOrder` に現れた URL は、対応する `UrlRecordId` を `urlIds`
 *   の先頭から順に並べる。
 * - `newUrlOrder` に含まれない `urlIds` は末尾に維持する
 *   （旧 `reorderTabGroupUrls` の挙動と一致）。
 */
export const reorderTabGroupUrlIds = ({
  group,
  newUrlOrder,
  urlRecords,
}: {
  group: TabGroup
  newUrlOrder: readonly string[]
  urlRecords: readonly UrlRecord[]
}): readonly string[] => {
  if (!group.urlIds || group.urlIds.length === 0) {
    return group.urlIds ?? []
  }
  if (newUrlOrder.length === 0) {
    return group.urlIds
  }
  const urlRecordsByUrl = new Map<string, UrlRecord>()
  for (const record of urlRecords) {
    // domain `UrlRecord.url` は branded `Url` だが、Map キーは
    // 文字列比較で十分なため raw string へ寄せる。
    urlRecordsByUrl.set(record.url, record)
  }
  const groupUrlIds: Set<string> = group.urlIds
    ? new Set(group.urlIds)
    : new Set()
  const reorderedUrlIds: string[] = []
  for (const url of newUrlOrder) {
    const urlRecord = urlRecordsByUrl.get(url)
    if (urlRecord && groupUrlIds.has(urlRecord.id)) {
      reorderedUrlIds.push(urlRecord.id)
    }
  }
  // newUrlOrder に含まれなかった残りの urlIds を末尾に追加
  const reorderedSet = new Set(reorderedUrlIds)
  for (const urlId of group.urlIds ?? []) {
    if (!reorderedSet.has(urlId)) {
      reorderedUrlIds.push(urlId)
    }
  }
  return reorderedUrlIds
}

// `UrlRecordId` factory への参照を保持し、unused import を避ける。
export const _reorderTabGroupUrlIdsMarker = true
