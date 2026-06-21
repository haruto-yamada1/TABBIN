import type { BuildSavedTabsSnapshotCommand } from '@/contexts/saved-tabs/application/commands/BuildSavedTabsSnapshotCommand'
import type {
  OpenedUrlsRestoreSnapshot,
  RestoreOpenedUrlsSnapshotCommand,
} from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { CustomProject as DomainCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { ParentCategory as DomainParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup as DomainTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { CustomProjectRawSnapshot } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProject, ParentCategory, TabGroup } from '@/types/storage'

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

/** raw snapshot の rich 補助フィールドを保持したまま storage 形へ投影する。 */
export const toStorageCustomProjectFromRaw = (
  raw: CustomProjectRawSnapshot,
): CustomProject => {
  const result: CustomProject = {
    categories: [...raw.categories],
    createdAt: raw.createdAt,
    id: raw.id,
    name: raw.name,
    updatedAt: raw.updatedAt,
  }
  if (raw.urlIds && raw.urlIds.length > 0) {
    result.urlIds = [...raw.urlIds]
  }
  if (raw.urls && raw.urls.length > 0) {
    result.urls = raw.urls.map((entry) => ({ ...entry }))
  }
  if (raw.urlMetadata && Object.keys(raw.urlMetadata).length > 0) {
    result.urlMetadata = Object.fromEntries(
      Object.entries(raw.urlMetadata).map(([urlId, metadata]) => [
        urlId,
        { ...metadata },
      ]),
    )
  }
  if (raw.projectKeywords) {
    result.projectKeywords = {
      domainKeywords: [...raw.projectKeywords.domainKeywords],
      titleKeywords: [...raw.projectKeywords.titleKeywords],
      urlKeywords: [...raw.projectKeywords.urlKeywords],
    }
  }
  if (raw.categoryOrder && raw.categoryOrder.length > 0) {
    result.categoryOrder = [...raw.categoryOrder]
  }
  return result
}

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
 * domain entity の `TabGroup` 配列を、presentation 専用フィールド
 * (`urls` を含む storage shape) へ投影する。
 *
 * `GetSavedTabsPageDataQuery` の戻り値 (branded readonly domain
 * `TabGroup[]`) を presentation 層で編集できるよう storage shape に
 * 持ち替える。`urls` 等の presentation 拡張フィールドは mapper 呼び出し
 * 側で `.urls` アクセス可能なよう spread する。
 *
 * branded 型と構造差分 (domain ⊂ storage) の吸収は `unknown` 経由の
 * キャストに限定し、呼び出し側の disable を排除する。
 */
export const toPresentationTabGroups = (
  groups: readonly DomainTabGroup[],
): TabGroup[] =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  groups as unknown as TabGroup[]

/**
 * storage 形 `TabGroup` (presentation 編集結果を含む) を domain 形
 * `TabGroup` へ持ち替える。`CategoryAssignmentPort.saveTabGroups` 入口で
 * の branded 型差分を吸収する橋渡し用。
 *
 * branded 型の差分は port 実装側の factory で吸収される前提で
 * キャストする（`toDomainParentCategories` /
 * `toDomainTabGroupsForReorder` と同パターン）。
 */
export const toDomainTabGroupFromStorage = (group: TabGroup): DomainTabGroup =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  group as unknown as DomainTabGroup

/**
 * snapshot 内の readonly 配列を immutable copy に正規化する。
 * `Array.isArray` でない場合は `undefined` 扱いにする。
 */
function getSnapshotArray<T>(value: readonly T[] | undefined): T[] | undefined {
  return Array.isArray(value) ? value.slice() : undefined
}

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

/**
 * storage 形 `TabGroup[]` を domain 形 `TabGroup[]` へ持ち替える
 * 複数要素版。`toDomainTabGroupFromStorage` を配列に適用する sugar。
 */
export const toDomainTabGroupsFromStorage = (
  groups: readonly TabGroup[],
): readonly DomainTabGroup[] => groups.map(toDomainTabGroupFromStorage)

/**
 * storage 形 `ParentCategory` を domain 形 `ParentCategory` へ持ち替える。
 * `RepairTabGroupParentCategoryIdsUseCase` 等の branded 入力 port
 * への橋渡し用。構造がほぼ一致するため、branded 差分のみ
 * `as unknown` 経由で吸収する。
 */
const toDomainParentCategory = (
  category: ParentCategory,
): DomainParentCategory => {
  const { domains, domainNames, id, name } = category
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return { domains, domainNames, id, name } as unknown as DomainParentCategory
}

/**
 * storage 形 `ParentCategory[]` を domain 形 `ParentCategory[]` へ
 * 持ち替える複数要素版。`toDomainParentCategory` を配列に適用する sugar。
 */
export const toDomainParentCategoriesFromStorage = (
  categories: readonly ParentCategory[],
): readonly DomainParentCategory[] => categories.map(toDomainParentCategory)
