import type { ResolvedTabGroupUrlDto } from '@/contexts/saved-tabs/domain/dto/ResolvedTabGroupUrlDto'
import type { TabGroupDto } from '@/contexts/saved-tabs/domain/dto/TabGroupDto'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { urlRecordIdToString } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * ドメイン型として保持している `UrlRecord` に対して、
 * `TabGroupDto.urlIds` から `UrlRecord` を引き当てて
 * `urls` フィールドを組み立てる pure ドメインサービス。
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
 * `@/types/storage` には依存せず、domain DTO (`TabGroupDto` /
 * `ResolvedTabGroupUrlDto`) だけで動作する (issue #511)。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */

/**
 * `TabGroupDto.urlIds` を `UrlRecord` に解決し、`urls` フィールドを
 * 埋めた `TabGroupDto[]` を返す。
 *
 * - `urlGroups` が空配列なら空配列を返す（storage アクセス不要）。
 * - `urlIds` が空のグループは `urls: []` として返す（旧挙動と一致）。
 *
 * `@/types/storage` には依存せず、domain DTO のみで動作する
 * (issue #511)。
 */
export const resolveTabGroupsWithUrls = ({
  tabGroups,
  urlRecords,
}: {
  tabGroups: readonly TabGroupDto[]
  urlRecords: readonly UrlRecord[]
}): readonly TabGroupDto[] => {
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

/**
 * `TabGroupDto.urlIds` を `UrlRecord` に解決し、解決済み
 * `ResolvedTabGroupUrlDto[]` を返す。
 *
 * `urlSubCategories` 引き継ぎは `group.urlSubCategories` 経由で
 * 各 URL に `subCategory` を注入する (issue #501 由来)。
 * `TabGroupDto` に `urlSubCategories?: Record<string, string>` を
 * 含めているため widening なしで受け取れる。
 */
export const resolveGroupUrls = ({
  group,
  urlRecordMap,
}: {
  group: TabGroupDto
  urlRecordMap: ReadonlyMap<string, UrlRecord>
}): ResolvedTabGroupUrlDto[] => {
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
