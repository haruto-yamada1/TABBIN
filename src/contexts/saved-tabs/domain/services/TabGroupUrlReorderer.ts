import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

type MembershipOrderProjection = {
  readonly memberships: readonly { readonly urlId: string }[]
}

/**
 * 単一 `TabGroupDto` の `urlIds` 並び替えに関する pure ドメインサービス。
 *
 * 旧 `src/lib/storage/tabs.reorderTabGroupUrls` 内の URL 並び替え
 * ロジックを domain 等価物として抽出したもの。
 * `chrome.storage.local` を知らず、永続化は use-case / repository
 * 側に委ねる。
 *
 * 戻り値の `urlIds` は `string[]` のまま返す。`TabGroupDto` は
 * branded ではなく plain string の urlIds を持つため、use-case 側で
 * 必要なら `createUrlRecordId` を掛けて再ラップする。
 *
 * `@/types/storage` には依存せず、domain DTO `TabGroupDto` だけで
 * 動作する (issue #511)。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */

/**
 * `newUrlOrder`（URL 文字列配列）に基づいて、対象 `TabGroupDto` の
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
  group: MembershipOrderProjection
  newUrlOrder: readonly string[]
  urlRecords: readonly UrlRecord[]
}): readonly string[] => {
  const membershipUrlIds = group.memberships.map(({ urlId }) => urlId)
  if (membershipUrlIds.length === 0) {
    return []
  }
  if (newUrlOrder.length === 0) {
    return membershipUrlIds
  }
  const urlRecordsByUrl = new Map<string, UrlRecord>()
  for (const record of urlRecords) {
    // domain `UrlRecord.url` は branded `Url` だが、Map キーは
    // 文字列比較で十分なため raw string へ寄せる。
    urlRecordsByUrl.set(record.url, record)
  }
  const groupUrlIds = new Set(membershipUrlIds)
  const reorderedUrlIds: string[] = []
  for (const url of newUrlOrder) {
    const urlRecord = urlRecordsByUrl.get(url)
    if (urlRecord && groupUrlIds.has(urlRecord.id)) {
      reorderedUrlIds.push(urlRecord.id)
    }
  }
  // newUrlOrder に含まれなかった残りの urlIds を末尾に追加
  const reorderedSet = new Set(reorderedUrlIds)
  for (const urlId of membershipUrlIds) {
    if (!reorderedSet.has(urlId)) {
      reorderedUrlIds.push(urlId)
    }
  }
  return reorderedUrlIds
}
