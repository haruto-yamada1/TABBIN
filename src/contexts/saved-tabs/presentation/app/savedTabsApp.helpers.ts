import { toast } from 'sonner'

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { CustomProject as DomainCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { ParentCategory as DomainParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup as DomainTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'
import { getPageHref } from '@/features/navigation/lib/pageNavigation'
import {
  removeUrlIdsFromAllCustomProjects,
  removeUrlsFromAllCustomProjects,
} from '@/lib/storage/projects'
import { getTabGroupUrls } from '@/lib/storage/tabs'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  ViewMode,
} from '@/types/storage'

/**
 * `BuildSavedTabsSnapshotUseCase` 由来の `OpenedUrlsRestoreSnapshot` を
 * presentation 層で扱うための alias。旧 `OpenedUrlsStorageSnapshot` と同じ
 * 用途で、復元経路（Undo）とスナップショット捕捉（use-case）の
 * インターフェースが一致するようになった（issue #494）。
 */
type OpenedUrlsStorageSnapshot = OpenedUrlsRestoreSnapshot
interface CategoryLookup {
  byId: Map<string, ParentCategory>
  byGroupId: Map<string, ParentCategory>
  byDomainName: Map<string, ParentCategory>
}
type RefreshTabGroupsWithUrls = (
  groups: TabGroup[],
  // eslint-disable-next-line typescript/no-invalid-void-type
) => Promise<TabGroup[]> | TabGroup[] | Promise<void> | void

const getSnapshotArray = <T>(
  value: readonly T[] | undefined,
): T[] | undefined =>
  // eslint-disable-next-line typescript/no-unsafe-return
  Array.isArray(value) ? value.slice() : undefined
const getSnapshotSavedTabs = (
  snapshot: OpenedUrlsStorageSnapshot,
): TabGroup[] =>
  getSnapshotArray(snapshot.savedTabs)?.map(toStorageTabGroup) ?? []
const buildUrlIdsToRemove = (
  urlsToRemove: string[],
  urlRecords: {
    id: string
    url: string
  }[],
) => {
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
 * domain entity の `CustomProject` を presentation 層の
 * `CustomProject` 形へ持ち替える。エンティティは storage 形のサブセット
 * （`projectKeywords` / `urlMetadata` / `categoryOrder` 等を持たない）なので、
 * Undo 後の state 反映は最小限のフィールドだけで行い、リッチ補助フィールド
 * は次回 storage 同期時に再取得する前提とする（issue #494）。
 */
const toStorageCustomProject = (
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
 * presentation 層（`useCategoryManagement`）が保持する storage 形
 * `ParentCategory[]` を、`BuildSavedTabsSnapshotUseCase` command の
 * `readonly DomainParentCategory[]` へ持ち替える。両者の差分は
 * branded 型（`ParentCategoryId` / `CategoryName` / `TabGroupId` /
 * `DomainName`）の有無のみで、構造は一致する（issue #494）。
 */
const toDomainParentCategories = (
  categories: readonly ParentCategory[] | undefined,
): readonly DomainParentCategory[] | undefined =>
  categories
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (categories.map((category) => ({
        domains: [...category.domains],
        domainNames: [...category.domainNames],
        id: category.id,
        name: category.name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      })) as unknown as readonly DomainParentCategory[])
    : undefined

/**
 * presentation 層が保持する storage 形 `TabGroup[]` を、
 * `ReorderTabGroupsUseCase` command の `readonly DomainTabGroup[]` へ
 * 持ち替える。エンティティは storage 形のサブセットなので、ID / domain /
 * urlIds などの主要フィールドだけ詰め替えれば use-case 入力として十分
 * （issue #494）。
 */
const toDomainTabGroupsForReorder = (
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
 * domain entity の `ParentCategory` を presentation 層の
 * `ParentCategory` 形へ持ち替える。エンティティと storage 形は構造が
 * ほぼ一致するため、`id` / `name` / `domains` / `domainNames` をコピー
 * するだけで十分（issue #494）。
 */
const toStorageParentCategory = (
  category: DomainParentCategory,
): ParentCategory => ({
  domains: [...category.domains],
  domainNames: [...category.domainNames],
  id: category.id,
  name: category.name,
})

/**
 * domain entity の `TabGroup` を presentation 層の `TabGroup` 形へ
 * 持ち替える。エンティティは storage 形のサブセットなので、必要最小限の
 * フィールドのみコピーする。`refreshTabGroupsWithUrls` 側で `urls` を
 * urlRecords から再解決するため、`urls` を持たないエンティティでも
 * 表示に必要な情報は揃う（issue #494）。
 */
const toStorageTabGroup = (group: DomainTabGroup): TabGroup => ({
  id: group.id,
  domain: group.domain,
  urlIds: [...group.urlIds],
  parentCategoryId: group.parentCategoryId,
  savedAt: group.savedAt,
})

const restoreOpenedUrlsSnapshot = async ({
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  setCategories,
  setCustomProjects,
  snapshot,
}: {
  refreshTabGroupsWithUrls: RefreshTabGroupsWithUrls
  savedTabsUseCases: SavedTabsUseCases
  setCategories?: (categories: ParentCategory[]) => void
  setCustomProjects: (projects: CustomProject[]) => void
  snapshot: OpenedUrlsStorageSnapshot
}) => {
  // 復元本体は RestoreOpenedUrlsSnapshotUseCase に委譲する。
  // presentation 層は snapshot を use-case 入力としてそのまま渡し、
  // chrome.storage.local.set の直接呼び出しは行わない
  // （issue #487 / #494）。
  await savedTabsUseCases.restoreOpenedUrlsSnapshot({
    snapshot,
  })

  // 画面側 state は storage 形状を期待するため、use-case 由来の
  // domain entity 形 snapshot を presentation 形へ持ち替えて反映する。
  // リッチ補助フィールド（`projectKeywords` / `urlMetadata` /
  // `categoryOrder` / `urls`）は domain entity には載らないため、
  // 次回 storage 同期時または `refreshTabGroupsWithUrls` の
  // `loadTabGroupsWithUrls` で再取得される前提とする。
  if (snapshot.customProjects) {
    setCustomProjects(snapshot.customProjects.map(toStorageCustomProject))
  }
  if (snapshot.parentCategories && setCategories) {
    setCategories(snapshot.parentCategories.map(toStorageParentCategory))
  }
  const savedTabs = getSnapshotSavedTabs(snapshot)
  await refreshTabGroupsWithUrls(savedTabs)
}

const showOpenedUrlsUndoToast = ({
  count,
  messageKey = 'savedTabs.undo.removedAfterOpen',
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  setCategories,
  setCustomProjects,
  snapshot,
  t,
}: {
  count: number
  messageKey?: string
  refreshTabGroupsWithUrls: RefreshTabGroupsWithUrls
  savedTabsUseCases: SavedTabsUseCases
  setCategories?: (categories: ParentCategory[]) => void
  setCustomProjects: (projects: CustomProject[]) => void
  snapshot: OpenedUrlsStorageSnapshot
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  toast.info(
    t(messageKey, undefined, {
      count: String(count),
    }),
    {
      action: {
        label: t('common.undo'),
        // eslint-disable-next-line typescript/no-misused-promises
        onClick: async () => {
          try {
            await restoreOpenedUrlsSnapshot({
              refreshTabGroupsWithUrls,
              savedTabsUseCases,
              setCategories,
              setCustomProjects,
              snapshot,
            })
            toast.success(t('savedTabs.undo.restored'))
          } catch (error) {
            console.error('開いた後に削除したURLの復元に失敗しました:', error)
            toast.error(t('savedTabs.undo.restoreError'))
          }
        },
      },
    },
  )
}

const notifyDeleteFailure = async ({
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  setCategories,
  setCustomProjects,
  snapshot,
  t,
}: {
  refreshTabGroupsWithUrls: RefreshTabGroupsWithUrls
  savedTabsUseCases: SavedTabsUseCases
  setCategories?: (categories: ParentCategory[]) => void
  setCustomProjects: (projects: CustomProject[]) => void
  snapshot?: OpenedUrlsStorageSnapshot
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  if (snapshot) {
    try {
      await restoreOpenedUrlsSnapshot({
        refreshTabGroupsWithUrls,
        savedTabsUseCases,
        setCategories,
        setCustomProjects,
        snapshot,
      })
    } catch (restoreError) {
      console.error('削除失敗後の保存データ復元に失敗しました:', restoreError)
    }
  }

  toast.error(t('savedTabs.deleteError'))
}

const buildCategoryLookup = (categories: ParentCategory[]): CategoryLookup => {
  const byId = new Map<string, ParentCategory>()
  const byGroupId = new Map<string, ParentCategory>()
  const byDomainName = new Map<string, ParentCategory>()

  for (const category of categories) {
    byId.set(category.id, category)
    for (const domainId of category.domains) {
      if (!byGroupId.has(domainId)) {
        byGroupId.set(domainId, category)
      }
    }
    for (const domainName of category.domainNames) {
      if (!byDomainName.has(domainName)) {
        byDomainName.set(domainName, category)
      }
    }
  }

  return {
    byDomainName,
    byGroupId,
    byId,
  }
}
const countTabGroupUrls = (group: TabGroup): number =>
  group.urlIds?.length ?? group.urls?.length ?? 0
const getDisplayUrlCount = (group: TabGroup): number =>
  (group.urls ?? group.urlIds ?? []).length
const buildDisplayTabGroup = (project: CustomProject): TabGroup =>
  ({
    id: project.id,
    domain: project.name,
    urls: project.urls ?? [],
    urlIds: project.urlIds ?? [],
  }) as TabGroup
const matchesParentCategoryQuery = (
  group: TabGroup,
  categoryLookup: CategoryLookup,
  query: string,
): boolean => {
  if (group.parentCategoryId) {
    const parentCategory = categoryLookup.byId.get(group.parentCategoryId)
    if (parentCategory) {
      const matched = parentCategory.name.toLowerCase().includes(query)
      console.log(
        `親カテゴリ検索デバッグ: ドメイン ${group.domain}, 親カテゴリ「${parentCategory.name}」, クエリ「${query}」, マッチ: ${matched}`,
      )
      if (matched) {
        return true
      }
    } else {
      console.log(
        `親カテゴリ検索デバッグ: ドメイン ${group.domain}, parentCategoryId ${group.parentCategoryId} に対応するカテゴリが見つかりません`,
      )
    }
  }
  const fallbackCategory =
    // `||` needed: Map.get() could return empty string
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    categoryLookup.byGroupId.get(group.id) ||
    categoryLookup.byDomainName.get(group.domain)
  if (fallbackCategory) {
    const matched = fallbackCategory.name.toLowerCase().includes(query)
    if (matched) {
      console.log(
        `親カテゴリ検索デバッグ（リアルタイム）: ドメイン ${group.domain}, 親カテゴリ「${fallbackCategory.name}」, クエリ「${query}」, マッチ: ${matched}`,
      )
      return true
    }
  }
  if (!group.parentCategoryId) {
    console.log(
      `親カテゴリ検索デバッグ: ドメイン ${group.domain}, parentCategoryIdが未設定かつカテゴリマッチなし`,
    )
  }
  return false
}
const filterGroupByQuery = (
  group: TabGroup,
  normalizedQuery: string,
  categoryLookup: CategoryLookup,
): TabGroup => {
  const currentUrls = group.urls ?? []
  if (currentUrls.length === 0) {
    return group
  }
  const parentCategoryMatched = matchesParentCategoryQuery(
    group,
    categoryLookup,
    normalizedQuery,
  )
  const filteredUrls = currentUrls.filter((item) => {
    const matchesBasicFields =
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.url.toLowerCase().includes(normalizedQuery) ||
      group.domain.toLowerCase().includes(normalizedQuery)
    const matchesSubCategory = item.subCategory
      ?.toLowerCase()
      .includes(normalizedQuery)
    // eslint-disable-next-line typescript/prefer-nullish-coalescing -- boolean values; false should not fall through
    return matchesBasicFields || matchesSubCategory || parentCategoryMatched
  })
  if (filteredUrls.length === currentUrls.length) {
    return group
  }
  return {
    ...group,
    urls: filteredUrls,
  }
}
const sortCategorizedGroups = (
  categorizedGroups: Record<string, TabGroup[]>,
  categoryLookup: CategoryLookup,
): void => {
  for (const categoryId of Object.keys(categorizedGroups)) {
    const category = categoryLookup.byId.get(categoryId)
    const domains = category?.domains
    if (!(domains && domains.length > 0)) {
      continue
    }
    const domainOrder = new Map(domains.map((domain, index) => [domain, index]))
    categorizedGroups[categoryId].sort((a, b) => {
      const indexA = domainOrder.get(a.id) ?? -1
      const indexB = domainOrder.get(b.id) ?? -1
      if (indexA === -1) {
        return 1
      }
      if (indexB === -1) {
        return -1
      }
      return indexA - indexB
    })
  }
}
const filterGroupsByExcludedIds = (
  groups: TabGroup[],
  idsToExclude: Set<string>,
): TabGroup[] => groups.filter((group) => !idsToExclude.has(group.id))
const createFilterGroupsByExcludedIdsUpdater =
  (idsToExclude: Set<string>) =>
  (groups: TabGroup[]): TabGroup[] =>
    filterGroupsByExcludedIds(groups, idsToExclude)
const removeUrlIdsFromSavedTabs = (
  savedTabs: TabGroup[],
  idsToRemove: ReadonlySet<string>,
): {
  updatedSavedTabs: TabGroup[]
  hasChanges: boolean
} => {
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

    const updatedGroup = buildUpdatedGroupAfterUrlIdRemoval(
      group,
      remainingUrlIds,
      idsToRemove,
    )

    updatedSavedTabs.push(updatedGroup)
  }

  return {
    hasChanges,
    updatedSavedTabs,
  }
}
const buildUpdatedGroupAfterUrlIdRemoval = (
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
interface CategorySyncState {
  updatedSavedTabs: TabGroup[]
  updatedCategories: ParentCategory[]
  savedTabsChanged: boolean
  categoriesChanged: boolean
}
const updateSavedTabParentCategory = (
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
const syncGroupCategoryAssignment = (
  group: TabGroup,
  categoryLookup: CategoryLookup,
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

/**
 * 指定のタブグループ内のURLをすべてカスタムプロジェクトからも削除します。
 */
const removeUrlsFromCustomProjectsForGroup = async (
  groupToDelete: TabGroup,
) => {
  if (groupToDelete.urlIds && groupToDelete.urlIds.length > 0) {
    await removeUrlIdsFromAllCustomProjects(groupToDelete.urlIds, {
      throwOnError: true,
    })
    return
  }

  // eslint-disable-next-line eslint/no-useless-assignment
  let urlsToDelete: Awaited<ReturnType<typeof getTabGroupUrls>> = []
  try {
    urlsToDelete = await getTabGroupUrls(groupToDelete)
  } catch (error) {
    console.error('URL一覧の取得または削除エラー:', error)
    return
  }
  if (urlsToDelete && urlsToDelete.length > 0) {
    await removeUrlsFromAllCustomProjects(
      urlsToDelete.map((item) => item.url),
      {
        throwOnError: true,
      },
    )
  }
}

/**
 * 複数のドメイングループに属するURLをすべてカスタムプロジェクトから一括削除します。
 */
const removeUrlsFromCustomProjectsForGroups = async (
  groupsToDelete: TabGroup[],
) => {
  const groupsWithUrlIds = groupsToDelete.filter(
    (group) => group.urlIds && group.urlIds.length > 0,
  )
  const groupsWithoutUrlIds = groupsToDelete.filter(
    (group) => !(group.urlIds && group.urlIds.length > 0),
  )
  const allUrlIdsToDelete = groupsWithUrlIds.flatMap(
    (group) => group.urlIds ?? [],
  )
  if (allUrlIdsToDelete.length > 0) {
    await removeUrlIdsFromAllCustomProjects(allUrlIdsToDelete, {
      throwOnError: true,
    })
  }

  // eslint-disable-next-line eslint/no-useless-assignment
  let urlsByGroup: Awaited<ReturnType<typeof getTabGroupUrls>>[] = []
  try {
    urlsByGroup = await Promise.all(
      groupsWithoutUrlIds.map((group) => getTabGroupUrls(group)),
    )
  } catch (error) {
    console.error('複数グループのURL取得エラー:', error)
    return
  }
  const allUrlsToDelete = urlsByGroup.flatMap((urlsToDelete) =>
    (urlsToDelete || []).map((item) => item.url),
  )

  if (allUrlsToDelete.length > 0) {
    await removeUrlsFromAllCustomProjects(allUrlsToDelete, {
      throwOnError: true,
    })
  }
}

/**
 * view mode に対応する href を解決する。
 */
const resolveSavedTabsViewModeHref = (viewMode: ViewMode): string =>
  getPageHref(viewMode === 'custom' ? 'saved-tabs-custom' : 'saved-tabs-domain')

/**
 * 初期 view mode の解決待ち状態を判定する。
 */
const shouldWaitForInitialViewMode = ({
  hasResolvedInitialViewMode,
  initialViewMode,
  viewMode,
}: {
  hasResolvedInitialViewMode: boolean
  initialViewMode?: ViewMode
  viewMode: ViewMode
}): boolean => {
  if (!initialViewMode || hasResolvedInitialViewMode) {
    return false
  }

  return viewMode !== initialViewMode
}

/**
 * 現在の view mode を URL に同期する。
 * ナビゲートコールバックが指定されていればそれを使う。
 */
const syncSavedTabsViewModeLocation = ({
  onViewModeNavigate,
  viewMode,
}: {
  onViewModeNavigate?: (mode: ViewMode) => void
  viewMode: ViewMode
}): void => {
  if (onViewModeNavigate) {
    onViewModeNavigate(viewMode)
    return
  }

  const nextHref = resolveSavedTabsViewModeHref(viewMode)
  const currentUrl = new URL(window.location.href)
  const nextUrl = new URL(nextHref, window.location.href)

  if (
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search
  ) {
    return
  }

  window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`)
}

export type { CategoryLookup, CategorySyncState, OpenedUrlsStorageSnapshot }
export {
  buildCategoryLookup,
  buildDisplayTabGroup,
  buildUpdatedGroupAfterUrlIdRemoval,
  buildUrlIdsToRemove,
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  filterGroupByQuery,
  filterGroupsByExcludedIds,
  getDisplayUrlCount,
  getSnapshotSavedTabs,
  notifyDeleteFailure,
  removeUrlsFromCustomProjectsForGroup,
  removeUrlsFromCustomProjectsForGroups,
  removeUrlIdsFromSavedTabs,
  resolveSavedTabsViewModeHref,
  restoreOpenedUrlsSnapshot,
  shouldWaitForInitialViewMode,
  showOpenedUrlsUndoToast,
  sortCategorizedGroups,
  syncGroupCategoryAssignment,
  syncSavedTabsViewModeLocation,
  toDomainParentCategories,
  toDomainTabGroupsForReorder,
  toStorageCustomProject,
  toStorageParentCategory,
  toStorageTabGroup,
}
