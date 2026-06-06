import type { DragEndEvent } from '@dnd-kit/core'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Toaster } from '@/components/ui/sonner'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getPageHref } from '@/features/navigation/lib/pageNavigation'
import { CategoryReorderFooter } from '@/features/saved-tabs/components/Footer'
import { Header } from '@/features/saved-tabs/components/Header' // ヘッダーコンポーネントをインポート
import { CustomModeContainer } from '@/features/saved-tabs/custom/CustomModeContainer'
import { DomainModeContainer } from '@/features/saved-tabs/domain/DomainModeContainer'
import { useCategoryManagement } from '@/features/saved-tabs/hooks/useCategoryManagement'
import { useProjectManagement } from '@/features/saved-tabs/hooks/useProjectManagement'
import { useTabData } from '@/features/saved-tabs/hooks/useTabData'
import { moveCustomProjectUrlAndSyncState } from '@/features/saved-tabs/lib/custom-project-move'
import { filterCustomProjectsByQuery } from '@/features/saved-tabs/lib/custom-project-search'
import { handleTabGroupRemoval } from '@/features/saved-tabs/lib/tab-operations'
import { shouldShowUncategorizedHeader as computeShouldShowUncategorizedHeader } from '@/features/saved-tabs/lib/uncategorized-display'
import { syncStorageChanges } from '@/features/saved-tabs/shared/services/modeSyncService'
import { saveParentCategories } from '@/lib/storage/categories'
import {
  getCustomProjects,
  moveUrlBetweenCustomProjects,
  removeUrlIdsFromAllCustomProjects,
  removeUrlsFromAllCustomProjects,
} from '@/lib/storage/projects'
import { defaultSettings } from '@/lib/storage/settings'
import {
  getTabGroupUrls,
  removeUrlFromTabGroup,
  removeUrlIdsFromTabGroup,
  removeUrlsFromTabGroup,
} from '@/lib/storage/tabs'
import { getUrlRecords } from '@/lib/storage/urls'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UserSettings,
  ViewMode,
} from '@/types/storage'

import '@/assets/global.css'

interface OpenedUrlsStorageSnapshot {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
}
interface OpenedUrlsRestorePayload {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
  parentCategories?: ParentCategory[]
  savedTabs: TabGroup[]
}
interface CategoryLookup {
  byId: Map<string, ParentCategory>
  byGroupId: Map<string, ParentCategory>
  byDomainName: Map<string, ParentCategory>
}
type RefreshTabGroupsWithUrls = (
  groups: TabGroup[],
) => Promise<TabGroup[]> | TabGroup[] | Promise<void> | void
const getSnapshotArray = <T,>(value: T[] | undefined): T[] | undefined =>
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
const createOpenedUrlsRestorePayload = (
  snapshot: OpenedUrlsStorageSnapshot,
) => {
  const customProjects = getSnapshotArray(snapshot.customProjects)
  const customProjectOrder = getSnapshotArray(snapshot.customProjectOrder)
  const parentCategories = getSnapshotArray(snapshot.parentCategories)
  const payload: OpenedUrlsRestorePayload = {
    savedTabs: getSnapshotSavedTabs(snapshot),
  }

  if (customProjects) {
    payload.customProjects = customProjects
  }
  if (customProjectOrder) {
    payload.customProjectOrder = customProjectOrder
  }
  if (parentCategories) {
    payload.parentCategories = parentCategories
  }

  return {
    customProjects,
    parentCategories,
    payload,
  }
}

const restoreOpenedUrlsSnapshot = async ({
  refreshTabGroupsWithUrls,
  setCategories,
  setCustomProjects,
  snapshot,
}: {
  refreshTabGroupsWithUrls: RefreshTabGroupsWithUrls
  setCategories?: (categories: ParentCategory[]) => void
  setCustomProjects: (projects: CustomProject[]) => void
  snapshot: OpenedUrlsStorageSnapshot
}) => {
  const { customProjects, parentCategories, payload } =
    createOpenedUrlsRestorePayload(snapshot)

  await chrome.storage.local.set(payload)
  if (customProjects) {
    setCustomProjects(customProjects)
  }
  if (parentCategories && setCategories) {
    setCategories(parentCategories)
  }
  await refreshTabGroupsWithUrls(payload.savedTabs)
}

const notifyDeleteFailure = async ({
  refreshTabGroupsWithUrls,
  setCategories,
  setCustomProjects,
  snapshot,
  t,
}: {
  refreshTabGroupsWithUrls: RefreshTabGroupsWithUrls
  setCategories?: (categories: ParentCategory[]) => void
  setCustomProjects: (projects: CustomProject[]) => void
  snapshot?: OpenedUrlsStorageSnapshot
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  if (snapshot) {
    try {
      await restoreOpenedUrlsSnapshot({
        refreshTabGroupsWithUrls,
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

const showOpenedUrlsUndoToast = ({
  count,
  messageKey = 'savedTabs.undo.removedAfterOpen',
  refreshTabGroupsWithUrls,
  setCategories,
  setCustomProjects,
  snapshot,
  t,
}: {
  count: number
  messageKey?: string
  refreshTabGroupsWithUrls: RefreshTabGroupsWithUrls
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
        onClick: async () => {
          try {
            await restoreOpenedUrlsSnapshot({
              refreshTabGroupsWithUrls,
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
  (group.urls || group.urlIds || []).length
const buildDisplayTabGroup = (project: CustomProject): TabGroup =>
  ({
    id: project.id,
    domain: project.name,
    urls: project.urls || [],
    urlIds: project.urlIds || [],
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
  const currentUrls = group.urls || []
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
const hasDisplayableUrls = (group: TabGroup): boolean => {
  const hasNewUrls = Boolean(group.urlIds && group.urlIds.length > 0)
  const hasOldUrls = Boolean(group.urls && group.urls.length > 0)
  console.log(
    `フィルタチェック ${group.domain}: urlIds=${group.urlIds?.length || 0}, urls=${group.urls?.length || 0}, 表示=${hasNewUrls || hasOldUrls}`,
  )
  return hasNewUrls || hasOldUrls
}
const pushGroupToCategory = (
  categorizedGroups: Record<string, TabGroup[]>,
  categoryId: string,
  group: TabGroup,
): void => {
  if (!categorizedGroups[categoryId]) {
    categorizedGroups[categoryId] = []
  }
  const categorizedGroup =
    group.parentCategoryId === categoryId
      ? group
      : {
          ...group,
          parentCategoryId: categoryId,
        }
  categorizedGroups[categoryId].push(categorizedGroup)
}
const tryCategorizeById = (
  group: TabGroup,
  categoryLookup: CategoryLookup,
  categorizedGroups: Record<string, TabGroup[]>,
): boolean => {
  const category = categoryLookup.byGroupId.get(group.id)
  if (category) {
    pushGroupToCategory(categorizedGroups, category.id, group)
    if (group.parentCategoryId !== category.id) {
      console.log(
        `ドメイン ${group.domain} のparentCategoryIdをIDベースで ${category.id} に更新しました`,
      )
    }
    console.log(
      `ドメイン ${group.domain} はIDベースで ${category.name} に分類されました`,
    )
    return true
  }
  return false
}
const tryCategorizeByDomainName = (
  group: TabGroup,
  categoryLookup: CategoryLookup,
  categorizedGroups: Record<string, TabGroup[]>,
): boolean => {
  const category = categoryLookup.byDomainName.get(group.domain)
  if (category) {
    pushGroupToCategory(categorizedGroups, category.id, group)
    console.log(
      `ドメイン ${group.domain} はドメイン名ベースで ${category.name} に分類されました`,
    )
    console.log(
      `ドメイン ${group.domain} のparentCategoryIdを ${category.id} に設定しました`,
    )
    return true
  }
  return false
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
const organizeTabGroupsWithCategories = ({
  enableCategories,
  tabGroupsWithUrls,
  categoryLookup,
  searchQuery,
}: {
  enableCategories: boolean
  tabGroupsWithUrls: TabGroup[]
  categoryLookup: CategoryLookup
  searchQuery: string
}): {
  categorized: Record<string, TabGroup[]>
  uncategorized: TabGroup[]
} => {
  if (!enableCategories) {
    return {
      categorized: {},
      uncategorized: tabGroupsWithUrls,
    }
  }
  console.log('親カテゴリ一覧:', [...categoryLookup.byId.values()])
  console.log('organizeTabGroups開始:')
  console.log('- tabGroupsWithUrls:', tabGroupsWithUrls)
  console.log('- tabGroupsWithUrls.length:', tabGroupsWithUrls.length)
  const categorizedGroups: Record<string, TabGroup[]> = {}
  const uncategorizedGroups: TabGroup[] = []
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const hasSearchQuery = normalizedQuery.length > 0
  const groupsToOrganize = tabGroupsWithUrls.reduce<TabGroup[]>(
    (groups, group) => {
      const nextGroup = hasSearchQuery
        ? filterGroupByQuery(group, normalizedQuery, categoryLookup)
        : group
      if (hasDisplayableUrls(nextGroup)) {
        groups.push(nextGroup)
      }
      return groups
    },
    [],
  )
  console.log('groupsToOrganize:', groupsToOrganize)
  console.log('groupsToOrganize.length:', groupsToOrganize.length)
  for (const group of groupsToOrganize) {
    const categorizedById = tryCategorizeById(
      group,
      categoryLookup,
      categorizedGroups,
    )
    if (categorizedById) {
      continue
    }
    const categorizedByDomainName = tryCategorizeByDomainName(
      group,
      categoryLookup,
      categorizedGroups,
    )
    if (!categorizedByDomainName) {
      uncategorizedGroups.push(group)
      console.log(`ドメイン ${group.domain} は未分類です`)
    }
  }
  sortCategorizedGroups(categorizedGroups, categoryLookup)
  console.log('organizeTabGroups結果:')
  console.log('- categorizedGroups:', categorizedGroups)
  console.log('- uncategorizedGroups:', uncategorizedGroups)
  console.log('- uncategorizedGroups.length:', uncategorizedGroups.length)
  return {
    categorized: categorizedGroups,
    uncategorized: uncategorizedGroups,
  }
}

const resolveSavedTabsViewModeHref = (viewMode: ViewMode): string =>
  getPageHref(viewMode === 'custom' ? 'saved-tabs-custom' : 'saved-tabs-domain')

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
  const allUrlIdsToDelete = groupsWithUrlIds.flatMap((group) => group.urlIds!)
  if (allUrlIdsToDelete.length > 0) {
    await removeUrlIdsFromAllCustomProjects(allUrlIdsToDelete, {
      throwOnError: true,
    })
  }

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
 * 親カテゴリから指定されたドメインIDを削除して保存します。
 */
const removeDomainFromParentCategories = async (
  id: string,
  categories: ParentCategory[],
  setCategories: (cats: ParentCategory[]) => void,
) => {
  const updatedCategories = categories.map((category) => ({
    ...category,
    domains: category.domains.filter((domainId) => domainId !== id),
  }))
  await saveParentCategories(updatedCategories)
  setCategories(updatedCategories)
}

interface SavedTabsAppProps {
  initialViewMode?: ViewMode
  isAiSidebarOpen?: boolean
  onViewModeNavigate?: (mode: ViewMode) => void
}

const useSavedTabsAppView = ({
  initialViewMode,
  isAiSidebarOpen = false,
  onViewModeNavigate,
}: SavedTabsAppProps) => {
  const { t } = useI18n()
  const [settings, setSettings] = useState<UserSettings>(defaultSettings)
  const [searchQuery, setSearchQuery] = useState('')
  const hasResolvedInitialViewModeRef = useRef(!initialViewMode)
  const previousInitialViewModeRef = useRef(initialViewMode)

  if (previousInitialViewModeRef.current !== initialViewMode) {
    previousInitialViewModeRef.current = initialViewMode
    hasResolvedInitialViewModeRef.current = !initialViewMode
  }

  // 未分類ドメインの並び替えモード状態管理
  const [isUncategorizedReorderMode, setIsUncategorizedReorderMode] =
    useState(false)
  const [tempUncategorizedOrder, setTempUncategorizedOrder] = useState<
    TabGroup[]
  >([])

  const categoryState = useCategoryManagement()
  const tabDataState = useTabData(categoryState.setCategories, setSettings)
  const projectState = useProjectManagement(
    tabDataState.tabGroups,
    settings,
    initialViewMode,
  )
  const {
    categories,
    setCategories,
    categoryOrder,
    isCategoryReorderMode,
    tempCategoryOrder,
    handleDeleteCategory,
    handleCategoryDragEnd,
    handleConfirmCategoryReorder,
    handleCancelCategoryReorder,
    handleUpdateDomainsOrder,
    handleMoveDomainToCategory,
  } = categoryState
  const { tabGroups, isLoading, tabGroupsWithUrls, refreshTabGroupsWithUrls } =
    tabDataState
  const {
    customProjects,
    setCustomProjects,
    viewMode,
    viewModeRef,
    syncDomainDataToCustomProjects,
    handleViewModeChange,
    handleCreateProject,
    handleDeleteProject,
    handleRenameProject,
    handleUpdateProjectKeywords,
    handleAddUrlToProject,
    handleDeleteUrlFromProject,
    handleDeleteUrlsFromProject,
    handleAddCategory,
    handleDeleteProjectCategory,
    handleSetUrlCategory,
    handleUpdateCategoryOrder,
    handleReorderUrls,
    handleReorderProjects,
    handleRenameCategory,
  } = projectState
  const categoryLookup = useMemo(
    () => buildCategoryLookup(categories),
    [categories],
  )
  const removeOpenedUrlsFromStorage = useCallback(
    async (urlsToRemove: string[]) => {
      if (urlsToRemove.length === 0) {
        return
      }
      const [storageResult, urlRecords] = await Promise.all([
        chrome.storage.local.get<OpenedUrlsStorageSnapshot>([
          'savedTabs',
          'customProjects',
          'customProjectOrder',
        ]),
        getUrlRecords(),
      ])
      const savedTabs = getSnapshotSavedTabs(storageResult)
      const urlIdsToRemove = buildUrlIdsToRemove(urlsToRemove, urlRecords)
      if (urlIdsToRemove.size === 0) {
        return
      }

      const { updatedSavedTabs, hasChanges } = removeUrlIdsFromSavedTabs(
        savedTabs,
        urlIdsToRemove,
      )
      if (!hasChanges) {
        return
      }

      await chrome.storage.local.set({
        savedTabs: updatedSavedTabs,
      })

      try {
        await removeUrlIdsFromAllCustomProjects([...urlIdsToRemove])
      } catch (error) {
        console.error(
          'カスタムプロジェクトからの複数URL ID同期削除に失敗しました:',
          error,
        )
      }

      await refreshTabGroupsWithUrls(updatedSavedTabs)
      showOpenedUrlsUndoToast({
        count: urlIdsToRemove.size,
        refreshTabGroupsWithUrls,
        setCustomProjects,
        snapshot: storageResult,
        t,
      })
    },
    [refreshTabGroupsWithUrls, setCustomProjects, t],
  )

  // 既存のタブ開く処理を拡張して両方のモードで同期する
  const handleOpenTab = useCallback(
    async (url: string) => {
      try {
        // 設定に基づきバックグラウンド(active: false)またはフォアグラウンド(active: true)で開く
        await chrome.tabs.create({
          active: !settings.openUrlInBackground,
          url,
        })

        // 設定に基づいて、開いたタブを削除するかどうかを決定（新形式対応）
        if (settings.removeTabAfterOpen) {
          await removeOpenedUrlsFromStorage([url])
          console.log(`URL ${url} を開いた後、保存データから削除しました`)
        }
      } catch (error) {
        console.error('タブを開く処理エラー:', error)
      }
    },
    [
      settings.openUrlInBackground,
      settings.removeTabAfterOpen,
      removeOpenedUrlsFromStorage,
    ],
  )
  const handleOpenAllTabs = useCallback(
    async (
      urls: {
        url: string
        title: string
      }[],
    ) => {
      try {
        // ①新しいウィンドウでまとめて開くモード
        if (settings.openAllInNewWindow) {
          await chrome.windows.create({
            focused: true, // 新ウィンドウを常に前面に表示
            url: urls.map((u) => u.url),
          })
        }
        // ②通常モード: タブを一括で開く（Promise.allで並列処理）
        else {
          await Promise.all(
            urls.map(({ url }) =>
              chrome.tabs.create({
                active: !settings.openUrlInBackground,
                url,
              }),
            ),
          )
        }

        // ③開いた後に削除設定が有効ならグループ/プロジェクトを更新（新形式対応）
        if (settings.removeTabAfterOpen) {
          await removeOpenedUrlsFromStorage(urls.map(({ url }) => url))
          console.log(
            `${urls.length}個のURLを開いた後、保存データから削除しました`,
          )
        }
      } catch (error) {
        console.error('タブ一括オープンエラー:', error)
      }
    },
    [
      settings.openAllInNewWindow,
      settings.openUrlInBackground,
      settings.removeTabAfterOpen,
      removeOpenedUrlsFromStorage,
    ],
  )

  // HandleDeleteGroup関数を修正
  const handleDeleteGroup = useCallback(
    async (id: string) => {
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // 削除前にカテゴリ設定と親カテゴリ情報を保存
        const storageResult =
          await chrome.storage.local.get<OpenedUrlsStorageSnapshot>([
            'savedTabs',
            'customProjects',
            'customProjectOrder',
          ])
        deleteSnapshot = {
          ...storageResult,
          parentCategories: categories,
        }
        const savedTabs = getSnapshotSavedTabs(storageResult)
        const groupToDelete = savedTabs.find((group) => group.id === id)
        if (!groupToDelete) {
          return
        }
        console.log(`グループを削除: ${groupToDelete.domain}`)

        // 専用の削除前処理関数を呼び出し（インポートした関数を使用）
        await handleTabGroupRemoval(id)

        // グループに属するすべてのURLをカスタムプロジェクトからも削除
        await removeUrlsFromCustomProjectsForGroup(groupToDelete)

        // 以降は従来通りの処理
        const updatedGroups = savedTabs.filter((group) => group.id !== id)
        await chrome.storage.local.set({
          savedTabs: updatedGroups,
        })
        await refreshTabGroupsWithUrls(updatedGroups)

        // 並び替えモード中の削除処理：一時的な順序からも削除
        if (isUncategorizedReorderMode) {
          setTempUncategorizedOrder((prev) =>
            prev.filter((group) => group.id !== id),
          )
          console.log(
            `並び替えモード中にドメイン ${groupToDelete.domain} を一時順序からも削除しました`,
          )
        }

        // 親カテゴリからはドメインIDのみを削除（ドメイン名は保持）
        await removeDomainFromParentCategories(id, categories, setCategories)
        showOpenedUrlsUndoToast({
          count: countTabGroupUrls(groupToDelete),
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })

        console.log('グループ削除処理が完了しました')
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      isUncategorizedReorderMode,
      categories,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      setCategories,
      t,
    ],
  )

  const handleDeleteGroups = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        return
      }
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        const storageResult =
          await chrome.storage.local.get<OpenedUrlsStorageSnapshot>([
            'savedTabs',
            'customProjects',
            'customProjectOrder',
          ])
        deleteSnapshot = {
          ...storageResult,
          parentCategories: categories,
        }
        const savedTabs = getSnapshotSavedTabs(storageResult)

        const groupsToDelete = savedTabs.filter((group) =>
          ids.includes(group.id),
        )
        if (groupsToDelete.length === 0) {
          return
        }

        console.log(`${groupsToDelete.length}件のグループを一括削除します`)

        await Promise.all(ids.map((id) => handleTabGroupRemoval(id)))

        await removeUrlsFromCustomProjectsForGroups(groupsToDelete)

        const idSet = new Set(ids)
        const updatedGroups = savedTabs.filter((group) => !idSet.has(group.id))

        await chrome.storage.local.set({
          savedTabs: updatedGroups,
        })
        await refreshTabGroupsWithUrls(updatedGroups)

        if (isUncategorizedReorderMode) {
          setTempUncategorizedOrder(
            createFilterGroupsByExcludedIdsUpdater(idSet),
          )
        }

        const updatedCategories = categories.map((category) => ({
          ...category,
          domains: category.domains.filter((domainId) => !idSet.has(domainId)),
        }))
        await saveParentCategories(updatedCategories)
        setCategories(updatedCategories)
        showOpenedUrlsUndoToast({
          count: groupsToDelete.reduce(
            (total, group) => total + countTabGroupUrls(group),
            0,
          ),
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })

        console.log('一括グループ削除処理が完了しました')
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      isUncategorizedReorderMode,
      categories,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      setCategories,
      t,
    ],
  )
  const handleDeleteUrl = useCallback(
    async (groupId: string, url: string) => {
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        deleteSnapshot =
          await chrome.storage.local.get<OpenedUrlsStorageSnapshot>([
            'savedTabs',
            'customProjects',
            'customProjectOrder',
          ])
        // 新形式のURL削除関数を呼び出し
        await removeUrlFromTabGroup(groupId, url, {
          throwOnSyncError: true,
        })
        showOpenedUrlsUndoToast({
          count: 1,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
        console.log(`URL ${url} をグループ ${groupId} から削除しました`)
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [refreshTabGroupsWithUrls, setCustomProjects, t],
  )
  const handleDeleteUrls = useCallback(
    async (groupId: string, urls: string[]) => {
      if (urls.length === 0) {
        return
      }
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        deleteSnapshot =
          await chrome.storage.local.get<OpenedUrlsStorageSnapshot>([
            'savedTabs',
            'customProjects',
            'customProjectOrder',
          ])
        const targetUrls = new Set(urls)
        const targetGroup = tabGroupsWithUrls.find(
          (group) => group.id === groupId,
        )
        const resolvedUrlIds = (targetGroup?.urls || [])
          .reduce<{ id: string; url: string }[]>((items, item) => {
            if (item.id && targetUrls.has(item.url)) {
              items.push({
                id: item.id,
                url: item.url,
              })
            }
            return items
          }, [])
          .map((item) => item.id)

        if (resolvedUrlIds.length === urls.length) {
          await removeUrlIdsFromTabGroup(groupId, resolvedUrlIds, {
            throwOnSyncError: true,
          })
        } else {
          await removeUrlsFromTabGroup(groupId, urls, {
            throwOnSyncError: true,
          })
        }
        console.log(
          `${urls.length}件のURLをグループ ${groupId} から削除しました`,
        )
        showOpenedUrlsUndoToast({
          count: urls.length,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [refreshTabGroupsWithUrls, setCustomProjects, t, tabGroupsWithUrls],
  )
  const handleUpdateUrls = useCallback(
    (groupId: string, _updatedUrls: TabGroup['urls']) => {
      console.log(`グループ ${groupId} のURL更新はストレージ同期に委譲しました`)
    },
    [],
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Const handleDragEnd = (event: DragEndEvent) => {
  //   Const { active, over } = event

  //   If (over && active.id !== over.id) {
  //     SetTabGroups((groups: TabGroup[]) => {
  //       Const oldIndex = groups.findIndex(group => group.id === active.id)
  //       Const newIndex = groups.findIndex(group => group.id === over.id)

  //       Const newGroups = arrayMove(groups, oldIndex, newIndex)

  //       // ストレージに保存
  //       Chrome.storage.local.set({ savedTabs: newGroups })

  //       Return newGroups
  //     })
  //   }
  // }

  // 未分類ドメインの並び替えをキャンセルする
  const handleCancelUncategorizedReorder = useCallback(() => {
    if (!isUncategorizedReorderMode) {
      return
    }

    // 元の順序に戻す
    setTempUncategorizedOrder([])

    // 並び替えモードを終了
    setIsUncategorizedReorderMode(false)
    toast.info(t('savedTabs.domainOrder.canceled'))
  }, [isUncategorizedReorderMode, t])

  // タブグループをカテゴリごとに整理する関数を強化
  const organizeTabGroups = useCallback(
    (): {
      categorized: Record<string, TabGroup[]>
      uncategorized: TabGroup[]
    } =>
      organizeTabGroupsWithCategories({
        categoryLookup,
        enableCategories: settings.enableCategories,
        searchQuery,
        tabGroupsWithUrls,
      }),
    [tabGroupsWithUrls, categoryLookup, settings.enableCategories, searchQuery],
  )

  // TabGroupsWithUrls と categories が変わったとき、カテゴリ割り当ての不一致を
  // ストレージに反映するための副作用（organizeTabGroups から分離した副作用）
  useEffect(() => {
    if (!settings.enableCategories) {
      return
    }
    if (tabGroupsWithUrls.length === 0 || categories.length === 0) {
      return
    }
    const syncCategoryAssignments = async () => {
      try {
        const { savedTabs = [] } = await chrome.storage.local.get<{
          savedTabs?: import('@/types/storage').TabGroup[]
        }>('savedTabs')
        const currentSavedTabs = savedTabs
        const currentCategories = [...categories]
        const syncState: CategorySyncState = {
          categoriesChanged: false,
          savedTabsChanged: false,
          updatedCategories: currentCategories.map((c) => ({
            ...c,
          })),
          updatedSavedTabs: [...currentSavedTabs],
        }
        for (const group of tabGroupsWithUrls) {
          syncGroupCategoryAssignment(group, categoryLookup, syncState)
        }
        if (syncState.categoriesChanged) {
          await saveParentCategories(syncState.updatedCategories)
        }
        if (syncState.savedTabsChanged) {
          await chrome.storage.local.set({
            savedTabs: syncState.updatedSavedTabs,
          })
          console.log('[カテゴリ同期] savedTabs をストレージに書き込みました')
        }
      } catch (error) {
        console.error('[カテゴリ同期] ストレージ同期エラー:', error)
      }
    }
    syncCategoryAssignments()
  }, [tabGroupsWithUrls, categories, categoryLookup, settings.enableCategories])

  // 検索・フィルタ適用後のグループを整理（メモ化）
  const { categorized, uncategorized } = useMemo(
    () => organizeTabGroups(),
    [organizeTabGroups],
  )
  // コンテンツがあるグループリスト（カテゴリと未分類を結合、URLがあるもののみ）
  const hasContentTabGroups = useMemo(
    () =>
      [...Object.values(categorized).flat(), ...uncategorized].filter(
        (group) => getDisplayUrlCount(group) > 0,
      ),
    [categorized, uncategorized],
  )

  // 未分類ドメインのドラッグエンド処理（並び替えモード対応）
  const handleUncategorizedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const currentOrder = isUncategorizedReorderMode
          ? tempUncategorizedOrder
          : uncategorized
        const oldIndex = currentOrder.findIndex(
          (group) => group.id === active.id,
        )
        const newIndex = currentOrder.findIndex((group) => group.id === over.id)
        if (oldIndex !== -1 && newIndex !== -1) {
          const updatedOrder = arrayMove(currentOrder, oldIndex, newIndex)
          if (isUncategorizedReorderMode) {
            // 既に並び替えモード中：一時的な順序を更新
            setTempUncategorizedOrder(updatedOrder)
          } else {
            // 初回の並び替え時：並び替えモードを開始
            setIsUncategorizedReorderMode(true)
            setTempUncategorizedOrder(updatedOrder)
          }
        }
      }
    },
    [isUncategorizedReorderMode, tempUncategorizedOrder, uncategorized],
  )

  // 未分類ドメインの並び替えを確定する
  const handleConfirmUncategorizedReorder = useCallback(async () => {
    if (!isUncategorizedReorderMode) {
      return
    }
    try {
      const categorizedDomains = Object.values(categorized).flat()

      // 新しい順序：カテゴリ分類されたドメイン + 並び替えた未分類ドメイン
      const newTabGroups = [...categorizedDomains, ...tempUncategorizedOrder]

      // ストレージに保存
      await chrome.storage.local.set({
        savedTabs: newTabGroups,
      })
      await refreshTabGroupsWithUrls(newTabGroups)

      // 並び替えモードを終了
      setIsUncategorizedReorderMode(false)
      setTempUncategorizedOrder([])
      toast.success(t('savedTabs.domainOrder.updated'))
    } catch (error) {
      console.error('未分類ドメイン順序の更新に失敗しました:', error)
      toast.error(t('savedTabs.domainOrder.updateError'))
    }
  }, [
    isUncategorizedReorderMode,
    categorized,
    tempUncategorizedOrder,
    refreshTabGroupsWithUrls,
    t,
  ])
  console.log('表示判定デバッグ:')
  console.log('- categorized:', categorized)
  console.log('- uncategorized:', uncategorized)
  console.log('- hasContentTabGroups:', hasContentTabGroups)
  console.log('- hasContentTabGroups.length:', hasContentTabGroups.length)

  const customProjectsForHeader = customProjects
  const [filteredCustomProjects, setFilteredCustomProjects] =
    useState(customProjects)

  const handleDeleteUrlFromCustomMode = useCallback(
    async (projectId: string, url: string) => {
      await handleDeleteUrlFromProject(projectId, url)
    },
    [handleDeleteUrlFromProject],
  )
  const handleDeleteCategoryWithRefresh = useCallback(
    async (groupId: string, categoryName: string) =>
      handleDeleteCategory(groupId, categoryName, refreshTabGroupsWithUrls),
    [handleDeleteCategory, refreshTabGroupsWithUrls],
  )

  useEffect(() => {
    let isCancelled = false

    const syncFilteredCustomProjects = async () => {
      const nextProjects = await filterCustomProjectsByQuery({
        customProjects,
        searchQuery,
      })

      if (!isCancelled) {
        setFilteredCustomProjects(nextProjects)
      }
    }

    void syncFilteredCustomProjects()

    return () => {
      isCancelled = true
    }
  }, [customProjects, searchQuery])

  // ストレージ変更検出時のリスナーを改善（ドメインモードとカスタムモード間の同期）
  useEffect(() => {
    const handleStorageChanged = async (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      console.log('ストレージ変更を検出:', changes)
      await syncStorageChanges({
        changes,
        refreshTabGroupsWithUrls,
        setCategories,
        setCustomProjects,
        setSettings,
        syncDomainDataToCustomProjects,
        viewModeRef,
      })
    }
    chrome.storage.onChanged.addListener(handleStorageChanged)
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged)
    }
  }, [
    refreshTabGroupsWithUrls,
    syncDomainDataToCustomProjects,
    setCategories,
    setCustomProjects,
    viewModeRef,
  ]) // 必要な依存関係を追加

  useEffect(() => {
    if (
      shouldWaitForInitialViewMode({
        hasResolvedInitialViewMode: hasResolvedInitialViewModeRef.current,
        initialViewMode,
        viewMode,
      })
    ) {
      return
    }

    if (initialViewMode && !hasResolvedInitialViewModeRef.current) {
      hasResolvedInitialViewModeRef.current = true
    }

    syncSavedTabsViewModeLocation({ onViewModeNavigate, viewMode })
  }, [initialViewMode, onViewModeNavigate, viewMode])

  // カスタムプロジェクト間でURLを移動するハンドラ
  const handleMoveUrlBetweenProjects = useCallback(
    async (sourceProjectId: string, targetProjectId: string, url: string) => {
      try {
        console.log(
          `URL移動: ${sourceProjectId} → ${targetProjectId}, URL: ${url}`,
        )
        await moveCustomProjectUrlAndSyncState({
          getCustomProjects,
          moveUrlBetweenCustomProjects,
          setCustomProjects,
          sourceProjectId,
          targetProjectId,
          url,
        })
        toast.success(t('savedTabs.tab.movedBetweenProjects'))
        return null
      } catch (error) {
        console.error('URL移動エラー:', error)
        toast.error(t('savedTabs.tab.moveBetweenProjectsError'))
        return null
      }
    },
    [setCustomProjects, t],
  )

  // カテゴリ間でURLを移動するハンドラ
  const handleMoveUrlsBetweenCategories = useCallback(async () => {}, [])
  const visibleUncategorizedGroups = useMemo(
    () => uncategorized.filter((group) => getDisplayUrlCount(group) > 0),
    [uncategorized],
  )
  const hasVisibleCategoryGroups =
    settings.enableCategories && Object.keys(categorized).length > 0
  const shouldShowUncategorizedSectionHeader =
    settings.enableCategories &&
    computeShouldShowUncategorizedHeader({
      isUncategorizedReorderMode,
      searchQuery,
      uncategorizedCount: uncategorized.length,
      visibleUncategorizedCount: visibleUncategorizedGroups.length,
    })
  const shouldShowUncategorizedList = visibleUncategorizedGroups.length > 0
  const headerFilteredTabGroups = useMemo(() => {
    if (viewMode === 'domain') {
      return hasContentTabGroups
    }
    return filteredCustomProjects.map((project) =>
      buildDisplayTabGroup(project),
    )
  }, [viewMode, hasContentTabGroups, filteredCustomProjects])
  const customProjectsForDisplay = filteredCustomProjects
  const shouldShowCategoryReorderFooter =
    isCategoryReorderMode && viewMode === 'domain'
  const categoryOrderForDisplay = isCategoryReorderMode
    ? tempCategoryOrder
    : categoryOrder
  const uncategorizedForDisplay = (
    isUncategorizedReorderMode ? tempUncategorizedOrder : uncategorized
  ).filter((group) => getDisplayUrlCount(group) > 0)
  const mainContent =
    viewMode === 'domain' ? (
      <DomainModeContainer
        state={{
          hasVisibleCategoryGroups,
          isCategoryReorderMode,
          isLoading,
          isUncategorizedReorderMode,
          shouldShowUncategorizedList,
          shouldShowUncategorizedSectionHeader,
        }}
        settings={settings}
        categories={categories}
        categorized={categorized}
        categoryOrderForDisplay={categoryOrderForDisplay}
        tabGroups={tabGroups}
        searchQuery={searchQuery}
        sensors={sensors}
        handleCategoryDragEnd={handleCategoryDragEnd}
        handleOpenAllTabs={handleOpenAllTabs}
        handleDeleteGroup={handleDeleteGroup}
        handleDeleteGroups={handleDeleteGroups}
        handleDeleteUrl={handleDeleteUrl}
        handleDeleteUrls={handleDeleteUrls}
        handleOpenTab={handleOpenTab}
        handleUpdateUrls={handleUpdateUrls}
        handleUpdateDomainsOrder={handleUpdateDomainsOrder}
        handleMoveDomainToCategory={handleMoveDomainToCategory}
        handleDeleteCategory={handleDeleteCategoryWithRefresh}
        handleCancelUncategorizedReorder={handleCancelUncategorizedReorder}
        handleConfirmUncategorizedReorder={handleConfirmUncategorizedReorder}
        uncategorizedForDisplay={uncategorizedForDisplay}
        handleUncategorizedDragEnd={handleUncategorizedDragEnd}
        hasContentTabGroupsCount={hasContentTabGroups.length}
      />
    ) : (
      <CustomModeContainer
        isLoading={isLoading}
        projects={customProjectsForDisplay}
        settings={settings}
        handleOpenUrl={handleOpenTab}
        handleDeleteUrl={handleDeleteUrlFromCustomMode}
        handleDeleteUrlsFromProject={handleDeleteUrlsFromProject}
        handleAddUrl={handleAddUrlToProject}
        handleCreateProject={handleCreateProject}
        handleDeleteProject={handleDeleteProject}
        handleRenameProject={handleRenameProject}
        handleUpdateProjectKeywords={handleUpdateProjectKeywords}
        handleAddCategory={handleAddCategory}
        handleDeleteCategory={handleDeleteProjectCategory}
        handleSetUrlCategory={handleSetUrlCategory}
        handleUpdateCategoryOrder={handleUpdateCategoryOrder}
        handleReorderUrls={handleReorderUrls}
        handleOpenAllUrls={handleOpenAllTabs}
        handleMoveUrlBetweenProjects={handleMoveUrlBetweenProjects}
        handleMoveUrlsBetweenCategories={handleMoveUrlsBetweenCategories}
        handleReorderProjects={handleReorderProjects}
        handleRenameCategory={handleRenameCategory}
      />
    )
  return (
    <>
      <Toaster />
      <div
        className={
          isAiSidebarOpen
            ? 'min-h-screen w-full py-2'
            : 'container mx-auto min-h-screen py-2'
        }
      >
        <Header
          tabGroups={tabGroups}
          filteredTabGroups={headerFilteredTabGroups}
          customProjects={customProjectsForHeader}
          filteredCustomProjects={filteredCustomProjects}
          onCreateProject={handleCreateProject}
          currentMode={viewMode}
          onModeChange={handleViewModeChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        {mainContent}
        {shouldShowCategoryReorderFooter && (
          <CategoryReorderFooter
            onConfirmCategoryReorder={handleConfirmCategoryReorder}
            onCancelCategoryReorder={handleCancelCategoryReorder}
          />
        )}
      </div>
    </>
  )
}

const SavedTabsApp = (props: SavedTabsAppProps) => useSavedTabsAppView(props)

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
  notifyDeleteFailure,
  removeUrlsFromCustomProjectsForGroup,
  removeUrlsFromCustomProjectsForGroups,
  restoreOpenedUrlsSnapshot,
  SavedTabsApp,
  sortCategorizedGroups,
  syncGroupCategoryAssignment,
}
