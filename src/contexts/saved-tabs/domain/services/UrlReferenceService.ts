import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `UrlRecord` 参照関係を扱う pure ドメインサービス。
 *
 * `TabGroup` と `CustomProject` の両方から `urlIds` で `UrlRecord` を参照する
 * 設計のため、ある URL レコードを安全に削除して良いかどうかは
 * 「他にどこからも参照されていないこと」で判定する必要がある。
 *
 * 既存 `SavedTabsApp.tsx` の URL 削除フローと同じ前提に立つが、
 * domain 層では「参照確認」だけを担当し、実際の削除は use-case に任せる。
 */

/**
 * `TabGroup` / `CustomProject` から参照されている `UrlRecordId` の集合を返す。
 *
 * @example
 * ```ts
 * const referenced = collectReferencedUrlRecordIds({
 *   tabGroups: savedTabs,
 *   customProjects,
 * })
 * referenced.has(urlRecordId)
 * ```
 */
export const collectReferencedUrlRecordIds = ({
  tabGroups,
  customProjects,
}: {
  tabGroups: readonly TabGroup[]
  customProjects: readonly CustomProject[]
}): ReadonlySet<UrlRecordId> => {
  const referenced = new Set<UrlRecordId>()
  for (const group of tabGroups) {
    for (const { urlId } of group.memberships) {
      referenced.add(urlId)
    }
  }
  for (const project of customProjects) {
    for (const { urlId } of project.memberships) {
      referenced.add(urlId)
    }
  }
  return referenced
}

/**
 * 指定の `UrlRecordId` が他の集約からも参照されているかを判定する。
 *
 * 削除候補の URL について、削除元（`origin`）以外で参照が残っているかを
 * 確認する用途に使う。`origin` を集計対象から除外することで、
 * 「他の場所から参照されているか」を正しく判定する。
 *
 * @example
 * ```ts
 * const stillReferenced = isUrlRecordReferencedElsewhere({
 *   urlRecordId,
 *   tabGroups: savedTabs,
 *   customProjects,
 *   origin: { kind: 'tabGroup', id: deletedGroupId },
 * })
 * ```
 */
export const isUrlRecordReferencedElsewhere = ({
  urlRecordId,
  tabGroups,
  customProjects,
  origin,
}: {
  urlRecordId: UrlRecordId
  tabGroups: readonly TabGroup[]
  customProjects: readonly CustomProject[]
  origin?: UrlReferenceOrigin
}): boolean => {
  for (const group of tabGroups) {
    if (origin?.kind === 'tabGroup' && origin.id === group.id) {
      continue
    }
    if (group.memberships.some(({ urlId }) => urlId === urlRecordId)) {
      return true
    }
  }
  for (const project of customProjects) {
    if (origin?.kind === 'customProject' && origin.id === project.id) {
      continue
    }
    if (project.memberships.some(({ urlId }) => urlId === urlRecordId)) {
      return true
    }
  }
  return false
}

/**
 * 削除元の集約を示す識別タグ。
 */
export type UrlReferenceOrigin =
  | { kind: 'tabGroup'; id: TabGroup['id'] }
  | { kind: 'customProject'; id: CustomProject['id'] }

/**
 * `UrlRecord` 配列のうち、どこからも参照されていない（未参照）レコードを抽出する。
 *
 * `RemoveUnreferencedUrlRecordsUseCase` の入力データを作るための pure 関数。
 *
 * @example
 * ```ts
 * const unreferenced = filterUnreferencedUrlRecords({
 *   urlRecords,
 *   tabGroups,
 *   customProjects,
 * })
 * ```
 */
export const filterUnreferencedUrlRecords = ({
  urlRecords,
  tabGroups,
  customProjects,
}: {
  urlRecords: readonly UrlRecord[]
  tabGroups: readonly TabGroup[]
  customProjects: readonly CustomProject[]
}): UrlRecord[] => {
  const referenced = collectReferencedUrlRecordIds({
    tabGroups,
    customProjects,
  })
  return urlRecords.filter((record) => !referenced.has(record.id))
}
