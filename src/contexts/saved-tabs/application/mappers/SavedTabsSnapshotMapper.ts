import type { CustomProject, ParentCategory, TabGroup } from '@/types/storage'

import type { CustomProject as DomainCustomProject } from '../../domain/entities/CustomProject'
import type { ParentCategory as DomainParentCategory } from '../../domain/entities/ParentCategory'
import type { TabGroup as DomainTabGroup } from '../../domain/entities/TabGroup'
import type { BuildSavedTabsSnapshotCommand } from '../commands/BuildSavedTabsSnapshotCommand'
import type {
  OpenedUrlsRestoreSnapshot,
  RestoreOpenedUrlsSnapshotCommand,
} from '../commands/RestoreOpenedUrlsSnapshotCommand'

/**
 * `BuildSavedTabsSnapshotUseCase` / `RestoreOpenedUrlsSnapshotUseCase` 由来の
 * domain entity 形 snapshot を presentation 層 (chrome.storage 互換の
 * storage 形) へ持ち替える mapper。
 *
 * 旧 `savedTabsApp.helpers.ts` の `toStorageCustomProject` /
 * `toStorageParentCategory` / `toStorageTabGroup` /
 * `toDomainParentCategories` / `toDomainTabGroupsForReorder` /
 * `getSnapshotArray` / `getSnapshotSavedTabs` を
 * `application/mappers/` 配下へ移設した (issue #512)。
 *
 * 役割分担:
 * - domain entity ↔ storage 形 変換の責務を集約
 * - 旧 helpers.ts の snapshot 取り回し (`getSnapshotSavedTabs` 等) も
 *   ここに置き、UI 側は `mapper.toStorageXxx(snapshot)` 形式で受け取る
 */

/**
 * domain entity の `CustomProject` を storage 形 `CustomProject` へ
 * 持ち替える。エンティティは storage 形のサブセット
 * (`projectKeywords` / `urlMetadata` / `categoryOrder` 等を持たない) なので、
 * Undo 後の state 反映は最小限のフィールドだけで行い、リッチ補助フィールドは
 * 次回 storage 同期時に再取得する前提とする (issue #494)。
 */
export const toStorageCustomProject = (
  project: DomainCustomProject,
): CustomProject => ({
  categories: [...project.categories],
  createdAt: project.createdAt,
  id: project.id,
  name: project.name,
  updatedAt: project.updatedAt,
  urlIds: [...project.urlIds],
})

/**
 * domain entity の `ParentCategory` を storage 形 `ParentCategory` へ
 * 持ち替える。エンティティと storage 形は構造がほぼ一致するため、
 * `id` / `name` / `domains` / `domainNames` をコピーするだけで十分
 * (issue #494)。
 */
export const toStorageParentCategory = (
  category: DomainParentCategory,
): ParentCategory => ({
  domains: [...category.domains],
  domainNames: [...category.domainNames],
  id: category.id,
  name: category.name,
})

/**
 * domain entity の `TabGroup` を storage 形 `TabGroup` へ持ち替える。
 * エンティティは storage 形のサブセットなので、必要最小限のフィールドのみ
 * コピーする。`refreshTabGroupsWithUrls` 側で `urls` を urlRecords から
 * 再解決するため、`urls` を持たないエンティティでも表示に必要な情報は
 * 揃う (issue #494)。
 */
export const toStorageTabGroup = (group: DomainTabGroup): TabGroup => ({
  id: group.id,
  domain: group.domain,
  urlIds: [...group.urlIds],
  parentCategoryId: group.parentCategoryId,
  savedAt: group.savedAt,
})

/**
 * snapshot 内の readonly 配列を immutable copy に正規化する。
 * `Array.isArray` でない場合は `undefined` 扱いにする。
 */
const getSnapshotArray = <T>(
  value: readonly T[] | undefined,
): T[] | undefined => (Array.isArray(value) ? value.slice() : undefined)

/**
 * snapshot.savedTabs を storage 形 `TabGroup[]` へ変換して返す。
 * 未指定 / 不正な場合は空配列を返す。
 */
export const getSnapshotSavedTabs = (
  snapshot: OpenedUrlsRestoreSnapshot,
): TabGroup[] =>
  getSnapshotArray(snapshot.savedTabs)?.map(toStorageTabGroup) ?? []

/**
 * presentation 層が保持する storage 形 `ParentCategory[]` を、
 * `BuildSavedTabsSnapshotUseCase` command の
 * `readonly DomainParentCategory[]` へ持ち替える。両者の差分は
 * branded 型 (`ParentCategoryId` / `CategoryName` / `TabGroupId` /
 * `DomainName`) の有無のみで、構造は一致する (issue #494)。
 */
export const toDomainParentCategories = (
  categories: readonly ParentCategory[] | undefined,
): BuildSavedTabsSnapshotCommand['parentCategories'] => {
  if (!categories) {
    return undefined
  }
  // 構造は一致しているため、branded 型の差分は use-case 側の mapper / factory
  // が `RestoreOpenedUrlsSnapshotUseCase` 経由で吸収する前提でキャストする。
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return categories.map((category) => ({
    domains: [...category.domains],
    domainNames: [...category.domainNames],
    id: category.id,
    name: category.name,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  })) as unknown as BuildSavedTabsSnapshotCommand['parentCategories']
}

/**
 * presentation 層が保持する storage 形 `TabGroup[]` を、
 * `ReorderTabGroupsUseCase` command の `readonly DomainTabGroup[]` へ
 * 持ち替える。エンティティは storage 形のサブセットなので、
 * ID / domain / urlIds などの主要フィールドだけ詰め替えれば use-case 入力
 * として十分 (issue #494)。
 */
export const toDomainTabGroupsForReorder = (
  groups: readonly TabGroup[],
): readonly DomainTabGroup[] =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  groups.map((group) => ({
    id: group.id,
    domain: group.domain,
    parentCategoryId: group.parentCategoryId,
    savedAt: group.savedAt,
    urlIds: [...(group.urlIds ?? [])],
  })) as unknown as readonly DomainTabGroup[]

/**
 * snapshot を `RestoreOpenedUrlsSnapshotCommand` 形式へ持ち替える純粋関数。
 *
 * 旧 `restoreOpenedUrlsSnapshot` の冒頭で `savedTabsUseCases.restoreOpenedUrlsSnapshot({ snapshot })`
 * に渡していた形を mapper に切り出した。
 * domain entity → command の構造変換は mapper 側で行い、presentation 層は
 * 「mapper.toCommand(snapshot)」だけで use-case 入力が整う。
 */
export const toRestoreOpenedUrlsSnapshotCommand = (
  snapshot: OpenedUrlsRestoreSnapshot,
): RestoreOpenedUrlsSnapshotCommand => ({ snapshot })

/**
 * snapshot 内の `customProjects` / `parentCategories` を storage 形配列へ
 * 変換して返す。`undefined` 入力時は `undefined` を維持する。
 */
export const toStorageCustomProjects = (
  snapshot: OpenedUrlsRestoreSnapshot,
): CustomProject[] | undefined =>
  snapshot.customProjects?.map(toStorageCustomProject)

export const toStorageParentCategories = (
  snapshot: OpenedUrlsRestoreSnapshot,
): ParentCategory[] | undefined =>
  snapshot.parentCategories?.map(toStorageParentCategory)
