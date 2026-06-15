import type { TabGroup, UrlRecord } from '@/types/storage'

import type { ParentCategoryDto } from '../../domain/dto/ParentCategoryDto'
import type { PresentationCategoryLookup } from '../../domain/services/SavedTabsCategorizationService'

/**
 * `tabGroup` 内の表示用 URL 件数を数える。
 *
 * - `urlIds` を持つ modern 形式: `urlIds.length`
 * - `urlIds` を持たない legacy 形式: `urls?.length`
 * - どちらも無い: 0
 *
 * 旧 `savedTabsApp.helpers.ts` の `countTabGroupUrls` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const countTabGroupUrls = (group: TabGroup): number =>
  group.urlIds?.length ?? group.urls?.length ?? 0

/**
 * `idsToExclude` に含まれない `TabGroup` だけを返す。
 *
 * 旧 `savedTabsApp.helpers.ts` の `filterGroupsByExcludedIds` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const filterGroupsByExcludedIds = (
  groups: TabGroup[],
  idsToExclude: ReadonlySet<string>,
): TabGroup[] => groups.filter((group) => !idsToExclude.has(group.id))

/**
 * `idsToExclude` を持つ updater factory。
 * 旧 `createFilterGroupsByExcludedIdsUpdater` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const createFilterGroupsByExcludedIdsUpdater =
  (idsToExclude: ReadonlySet<string>) =>
  (groups: TabGroup[]): TabGroup[] =>
    filterGroupsByExcludedIds(groups, idsToExclude)

/**
 * URL 文字列配列 + UrlRecord 群から、削除対象 `UrlRecordId` 集合を算出する。
 *
 * 旧 `savedTabsApp.helpers.ts` の `buildUrlIdsToRemove` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const buildUrlIdsToRemove = (
  urlsToRemove: readonly string[],
  urlRecords: readonly Pick<UrlRecord, 'id' | 'url'>[],
): Set<string> => {
  const uniqueUrlSet = new Set(urlsToRemove)
  const urlIdsToRemove = new Set<string>()
  for (const record of urlRecords) {
    if (uniqueUrlSet.has(record.url)) {
      urlIdsToRemove.add(record.id)
    }
  }
  return urlIdsToRemove
}

/**
 * `TabGroup[]` から指定の `idsToRemove` を取り除く。
 * 空になったグループは結果から取り除き、変更があったかを
 * `hasChanges` で返す。
 *
 * 旧 `savedTabsApp.helpers.ts` の `removeUrlIdsFromSavedTabs` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const removeUrlIdsFromSavedTabs = (
  savedTabs: TabGroup[],
  idsToRemove: ReadonlySet<string>,
): { updatedSavedTabs: TabGroup[]; hasChanges: boolean } => {
  let hasChanges = false
  const updatedSavedTabs: TabGroup[] = []

  for (const group of savedTabs) {
    if (!(group.urlIds && group.urlIds.length > 0)) {
      updatedSavedTabs.push(group)
      continue
    }

    const remainingUrlIds = group.urlIds.filter((id) => !idsToRemove.has(id))
    if (remainingUrlIds.length === group.urlIds.length) {
      updatedSavedTabs.push(group)
      continue
    }

    hasChanges = true
    if (remainingUrlIds.length === 0) {
      continue
    }

    updatedSavedTabs.push(
      buildUpdatedGroupAfterUrlIdRemoval(group, remainingUrlIds, idsToRemove),
    )
  }

  return { hasChanges, updatedSavedTabs }
}

/**
 * `urlIds` を取り除いた後の `TabGroup` を構築する。
 * `urlSubCategories` からも対応する id を取り除き、空オブジェクトになったら
 * `undefined` に戻す。
 *
 * 旧 `savedTabsApp.helpers.ts` の `buildUpdatedGroupAfterUrlIdRemoval` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const buildUpdatedGroupAfterUrlIdRemoval = (
  group: TabGroup,
  remainingUrlIds: string[],
  idsToRemove: ReadonlySet<string>,
): TabGroup => {
  const updatedGroup: TabGroup = {
    ...group,
    urlIds: remainingUrlIds,
  }

  if (!group.urlSubCategories) {
    return updatedGroup
  }

  const nextUrlSubCategories = { ...group.urlSubCategories }
  for (const id of idsToRemove) {
    // eslint-disable-next-line typescript/no-dynamic-delete
    delete nextUrlSubCategories[id]
  }
  updatedGroup.urlSubCategories =
    Object.keys(nextUrlSubCategories).length > 0
      ? nextUrlSubCategories
      : undefined

  return updatedGroup
}

/**
 * `CategorySyncState` — カテゴリ同期処理中の更新状態を表す。
 *
 * 旧 `savedTabsApp.helpers.ts` の同名を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 *
 * `updatedCategories` は domain DTO `ParentCategoryDto[]` ベース
 * (issue #511)。`updatedSavedTabs` は storage 形 `TabGroup[]` の
 * ままだが、これは `urlSubCategories` 等の presentation 専用
 * 補助フィールドを含むため。
 */
interface CategorySyncState {
  categoriesChanged: boolean
  savedTabsChanged: boolean
  updatedCategories: ParentCategoryDto[]
  updatedSavedTabs: TabGroup[]
}

/**
 * 旧 `savedTabsApp.helpers.ts` の `updateSavedTabParentCategory` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 */
export const updateSavedTabParentCategory = (
  tabs: TabGroup[],
  groupId: string,
  categoryId: string,
): TabGroup[] =>
  tabs.map((tab) =>
    tab.id === groupId
      ? {
          ...tab,
          parentCategoryId: categoryId,
        }
      : tab,
  )

/**
 * 旧 `savedTabsApp.helpers.ts` の `syncGroupCategoryAssignment` を
 * `presentation/lib/tab-group-state.ts` へ移設 (issue #512)。
 *
 * presentation state への反映のみ担当し、永続化は use-case 側で行う。
 */
export const syncGroupCategoryAssignment = (
  group: TabGroup,
  categoryLookup: PresentationCategoryLookup,
  state: CategorySyncState,
): CategorySyncState => {
  const idBasedCategory = categoryLookup.byGroupId.get(group.id)
  if (idBasedCategory && group.parentCategoryId !== idBasedCategory.id) {
    state.updatedSavedTabs = updateSavedTabParentCategory(
      state.updatedSavedTabs,
      group.id,
      idBasedCategory.id,
    )
    state.savedTabsChanged = true
    console.log(
      `[カテゴリ同期] ドメイン ${group.domain} のparentCategoryIdをIDベースで ${idBasedCategory.id} に更新しました`,
    )
  }
  const foundByDomainName = categoryLookup.byDomainName.get(group.domain)
  if (!foundByDomainName) {
    return state
  }
  if (
    foundByDomainName.domains.includes(group.id) ||
    foundByDomainName.id === idBasedCategory?.id
  ) {
    return state
  }
  state.updatedCategories = state.updatedCategories.map((category) =>
    category.id === foundByDomainName.id
      ? {
          ...category,
          domains: [...category.domains, group.id],
        }
      : category,
  )
  state.categoriesChanged = true
  state.updatedSavedTabs = updateSavedTabParentCategory(
    state.updatedSavedTabs,
    group.id,
    foundByDomainName.id,
  )
  state.savedTabsChanged = true
  console.log(
    `[カテゴリ同期] ドメイン ${group.domain} のIDを親カテゴリ ${foundByDomainName.id} に同期しました`,
  )
  return state
}

export type { CategorySyncState }
