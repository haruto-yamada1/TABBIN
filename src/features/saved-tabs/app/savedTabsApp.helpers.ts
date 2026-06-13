import { toast } from 'sonner'

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
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

interface OpenedUrlsStorageSnapshot {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
}
interface CategoryLookup {
  byId: Map<string, ParentCategory>
  byGroupId: Map<string, ParentCategory>
  byDomainName: Map<string, ParentCategory>
}
type RefreshTabGroupsWithUrls = (
  groups: TabGroup[],
  // eslint-disable-next-line typescript/no-invalid-void-type
) => Promise<TabGroup[]> | TabGroup[] | Promise<void> | void

const getSnapshotArray = <T>(value: T[] | undefined): T[] | undefined =>
  Array.isArray(value) ? value : undefined
const getSnapshotSavedTabs = (
  snapshot: OpenedUrlsStorageSnapshot,
): TabGroup[] => getSnapshotArray(snapshot.savedTabs) ?? []
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
 * 旧 storage 形式の `TabGroup` を domain entity へ詰め替える。
 *
 * `urls` / `urlSubCategories` / `subCategories` / `categoryKeywords` /
 * `subCategoryOrder` などの chrome.storage 上のリッチ補助フィールドは
 * domain entity に載らないため破棄する。Repository 実装側の mapper が
 * 既存 raw と `urlIds` の整合を取りつつリッチフィールドを持ち越すため、
 * 復元時の見た目データは失われない。
 *
 * factory が `SavedTabsDomainError` を投げる要素（空 ID や重複 urlId）は
 * スキップして Undo 対象から除外する。
 */
const toDomainTabGroups = (
  groups: readonly TabGroup[] | undefined,
): OpenedUrlsRestoreSnapshot['savedTabs'] => {
  if (!groups || groups.length === 0) {
    return undefined
  }
  const result = []
  for (const group of groups) {
    try {
      result.push(
        createTabGroup({
          domain: group.domain,
          id: group.id,
          parentCategoryId: group.parentCategoryId,
          savedAt: group.savedAt,
          urlIds: group.urlIds ?? [],
        }),
      )
    } catch (error) {
      if (error instanceof SavedTabsDomainError) {
        continue
      }
      throw error
    }
  }
  return result
}

const toDomainCustomProjects = (
  projects: readonly CustomProject[] | undefined,
): OpenedUrlsRestoreSnapshot['customProjects'] => {
  if (!projects || projects.length === 0) {
    return undefined
  }
  const result = []
  for (const project of projects) {
    try {
      result.push(
        createCustomProject({
          categories: project.categories ?? [],
          createdAt: project.createdAt,
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt,
          urlIds: project.urlIds ?? [],
        }),
      )
    } catch (error) {
      if (error instanceof SavedTabsDomainError) {
        continue
      }
      throw error
    }
  }
  return result
}

const toDomainParentCategories = (
  categories: readonly ParentCategory[] | undefined,
): OpenedUrlsRestoreSnapshot['parentCategories'] => {
  if (!categories || categories.length === 0) {
    return undefined
  }
  const result = []
  for (const category of categories) {
    try {
      result.push(
        createParentCategory({
          domainNames: category.domainNames ?? [],
          domains: category.domains ?? [],
          id: category.id,
          name: category.name,
        }),
      )
    } catch (error) {
      if (error instanceof SavedTabsDomainError) {
        continue
      }
      throw error
    }
  }
  return result
}

/**
 * 旧 storage スナップショットを `RestoreOpenedUrlsSnapshotUseCase` の
 * command へ変換する。`customProjectOrder` は use-case DTO に載らない
 * ため、command には含めず presentation 層で補助的に書き戻す。
 */
const toOpenedUrlsRestoreCommand = (
  snapshot: OpenedUrlsStorageSnapshot,
): OpenedUrlsRestoreSnapshot => {
  const command: {
    savedTabs?: OpenedUrlsRestoreSnapshot['savedTabs']
    customProjects?: OpenedUrlsRestoreSnapshot['customProjects']
    parentCategories?: OpenedUrlsRestoreSnapshot['parentCategories']
  } = {}
  const savedTabs = toDomainTabGroups(snapshot.savedTabs)
  if (savedTabs) {
    command.savedTabs = savedTabs
  }
  const customProjects = toDomainCustomProjects(snapshot.customProjects)
  if (customProjects) {
    command.customProjects = customProjects
  }
  const parentCategories = toDomainParentCategories(snapshot.parentCategories)
  if (parentCategories) {
    command.parentCategories = parentCategories
  }
  return command
}

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
  // presentation 層は snapshot を domain command へ詰め替えるだけとし、
  // chrome.storage.local.set の直接呼び出しは customProjectOrder の補助
  // 書き込みに限定する。
  const command = toOpenedUrlsRestoreCommand(snapshot)
  await savedTabsUseCases.restoreOpenedUrlsSnapshot({
    snapshot: command,
  })

  // customProjectOrder は RestoreOpenedUrlsSnapshotUseCase の DTO に含まれ
  // ない（repository interface 未整備のため別 issue 切り出し）ため、
  // presentation 層で補助的に書き戻す。
  if (snapshot.customProjectOrder) {
    await chrome.storage.local.set({
      customProjectOrder: [...snapshot.customProjectOrder],
    })
  }

  // 画面側 state は storage 形状を期待するため、use-case DTO ではなく
  // 入力 snapshot をそのまま state へ反映する。Repository 側の mapper が
  // `urls` / `urlSubCategories` などのリッチ補助フィールドを保存時に
  // 持ち越すため、見た目の欠落は起こらない。
  if (snapshot.customProjects) {
    setCustomProjects([...snapshot.customProjects])
  }
  if (snapshot.parentCategories && setCategories) {
    setCategories([...snapshot.parentCategories])
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
}
