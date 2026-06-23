import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Toaster } from '@/components/ui/sonner'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { savedTabsDefaultUserSettings as defaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import type { SavedTabsUserSettingsDto as UserSettingsDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import {
  buildPresentationCategoryLookup,
  organizeTabGroupsWithCategories,
} from '@/contexts/saved-tabs/application/services/SavedTabsCategorizationService'
import { CategoryReorderFooter } from '@/contexts/saved-tabs/presentation/components/Footer'
import { Header } from '@/contexts/saved-tabs/presentation/components/Header' // ヘッダーコンポーネントをインポート
import { CustomModeContainer } from '@/contexts/saved-tabs/presentation/containers/CustomModeContainer'
import { DomainModeContainer } from '@/contexts/saved-tabs/presentation/containers/DomainModeContainer'
import { useDomainModeController } from '@/contexts/saved-tabs/presentation/controllers/useDomainModeController'
import type { UseSavedTabsControllerReturn } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import { useCategoryManagement } from '@/contexts/saved-tabs/presentation/hooks/useCategoryManagement'
import { useCategorySync } from '@/contexts/saved-tabs/presentation/hooks/useCategorySync'
import { useFilteredCustomProjects } from '@/contexts/saved-tabs/presentation/hooks/useFilteredCustomProjects'
import { useProjectManagement } from '@/contexts/saved-tabs/presentation/hooks/useProjectManagement'
import { useTabData } from '@/contexts/saved-tabs/presentation/hooks/useTabData'
import { createCategorizedDisplayState } from '@/contexts/saved-tabs/presentation/lib/categorized-display'
import { syncStorageChanges } from '@/contexts/saved-tabs/presentation/services/modeSyncService'
import type { ResolveActiveRef } from '@/contexts/saved-tabs/presentation/types/ResolveActiveRef'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { TabGroup, ViewMode } from '@/types/storage'

import { useProjectMoveHandlers } from './handlers/useProjectMoveHandlers'
import { useTabGroupDeletionHandlers } from './handlers/useTabGroupDeletionHandlers'
import { useTabOpeningHandlers } from './handlers/useTabOpeningHandlers'
import { useUncategorizedReorderHandlers } from './handlers/useUncategorizedReorderHandlers'
import {
  shouldWaitForInitialViewMode,
  syncSavedTabsViewModeLocation,
} from './savedTabsApp.helpers'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

interface SavedTabsAppProps {
  readonly controller: UseSavedTabsControllerReturn
  readonly deps: SavedTabsPresentationPorts
  readonly initialViewMode?: ViewMode
  readonly isAiSidebarOpen?: boolean
  readonly onViewModeNavigate?: (mode: ViewMode) => void
  readonly resolveActiveRef: ResolveActiveRef
  readonly useCases: SavedTabsUseCases
}

const useSavedTabsAppView = ({
  controller,
  deps,
  initialViewMode,
  isAiSidebarOpen = false,
  onViewModeNavigate,
  resolveActiveRef,
  useCases: savedTabsUseCases,
}: SavedTabsAppProps) => {
  const { t } = useI18n()
  const [settings, setSettings] = useState<UserSettingsDto>(defaultUserSettings)
  const hasResolvedInitialViewModeRef = useRef(!initialViewMode)
  const previousInitialViewModeRef = useRef(initialViewMode)

  if (previousInitialViewModeRef.current !== initialViewMode) {
    previousInitialViewModeRef.current = initialViewMode
    hasResolvedInitialViewModeRef.current = !initialViewMode
  }

  // BrowserTabPort の `resolveActive` から参照される最新 settings。
  // settings オブジェクト全体が変わってもタブを開く度に最新値を見るため、
  // 関数クロージャからは ref を読む。
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // `SavedTabsPage` 側で組み立てた `BrowserTabPort` の `resolveActive` を
  // 最新 settings から毎回評価する関数で上書きする。`BrowserTabPort` は
  // `open()` 呼び出し時に `resolveActive?.()` を都度評価するため、
  // use-case / port を作り直さずに `openUrlInBackground` を反映できる。
  // 関数 ref の中身だけ差し替えるため ref 自体は安定。
  useEffect(() => {
    resolveActiveRef.current = () => !settingsRef.current.openUrlInBackground
  }, [resolveActiveRef])

  // presentation 層の controller は composition root である
  // `SavedTabsPage` 側で組み立てて props 注入する。`SavedTabsApp` 側では
  // UI 派生 state のために `useDomainModeController` を controller に対して
  // 適用するだけに留め、use-case / repository / port の再生成は行わない。
  const domainController = useDomainModeController({
    controller,
  })
  const searchQuery = domainController.searchQuery
  const setSearchQuery = domainController.setSearchQuery

  // 未分類ドメインの並び替えモード状態管理
  const [isUncategorizedReorderMode, setIsUncategorizedReorderMode] =
    useState(false)
  const [tempUncategorizedOrder, setTempUncategorizedOrder] = useState<
    TabGroup[]
  >([])

  const categoryState = useCategoryManagement({
    reorderParentCategoriesUseCase: savedTabsUseCases.reorderParentCategories,
    removeSubCategoryFromTabGroupsUseCase:
      savedTabsUseCases.removeSubCategoryFromTabGroups,
    moveDomainBetweenCategoriesUseCase:
      savedTabsUseCases.moveDomainBetweenCategories,
    reorderDomainsInCategoryUseCase: savedTabsUseCases.reorderDomainsInCategory,
  })
  const tabDataState = useTabData({
    loadTabGroupsWithUrlsUseCase: savedTabsUseCases.loadTabGroupsWithUrls,
    getSavedTabsPageDataQuery: savedTabsUseCases.getSavedTabsPageData,
    getSavedTabsQuery: savedTabsUseCases.getSavedTabs,
    repairTabGroupParentCategoryIdsUseCase:
      savedTabsUseCases.repairTabGroupParentCategoryIds,
    migrationPort: deps.migrationPort,
    onCategoriesLoaded: categoryState.setCategories,
    onSettingsLoaded: setSettings,
  })
  const projectState = useProjectManagement(
    savedTabsUseCases.getCustomProjects,
    savedTabsUseCases.getCustomProjectOrder,
    savedTabsUseCases.getCustomProjectUndoSnapshot,
    savedTabsUseCases.getCustomProjectRaws,
    tabDataState.tabGroups,
    settings,
    initialViewMode,
    // issue #540 範囲: `customProjectsCommandService` パラメータ
    // を撤去し、`addCategoryToProject` /
    // `removeCategoryFromProject` を含むすべての操作を
    // SavedTabsUseCases 経由の use-case 関数として渡す形へ統一。
    savedTabsUseCases.createCustomProject,
    savedTabsUseCases.deleteCustomProject,
    savedTabsUseCases.updateCustomProjectName,
    savedTabsUseCases.saveCustomProjectOrder,
    savedTabsUseCases.restoreCustomProjectsSnapshot,
    savedTabsUseCases.addUrlToCustomProject,
    savedTabsUseCases.removeUrlFromCustomProject,
    savedTabsUseCases.removeUrlsFromCustomProject,
    savedTabsUseCases.setCustomProjectUrlCategory,
    savedTabsUseCases.updateCustomProjectCategoryOrder,
    savedTabsUseCases.reorderCustomProjectUrls,
    savedTabsUseCases.renameCustomProjectCategory,
    savedTabsUseCases.updateCustomProjectKeywords,
    savedTabsUseCases.addCategoryToCustomProject,
    savedTabsUseCases.removeCategoryFromCustomProject,
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
    () => buildPresentationCategoryLookup(categories),
    [categories],
  )
  const { handleOpenTab, handleOpenAllTabs } = useTabOpeningHandlers({
    savedTabsUseCases,
    deps,
    settings,
    categories,
    refreshTabGroupsWithUrls,
    setCustomProjects,
    t,
  })

  const {
    handleDeleteGroup,
    handleDeleteGroups,
    handleDeleteUrl,
    handleDeleteUrls,
    handleUpdateUrls,
  } = useTabGroupDeletionHandlers({
    isUncategorizedReorderMode,
    setTempUncategorizedOrder,
    categories,
    refreshTabGroupsWithUrls,
    savedTabsUseCases,
    setCustomProjects,
    setCategories,
    t,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

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
  // ストレージに反映するための副作用。同期本体は custom hook
  // `useCategorySync` 側に切り出してあり、effect 内のクロージャに catch 句の
  // `error` 変数が残らないため `react-doctor/no-pass-data-to-parent` が誤検出
  // しない設計。
  const syncCategoryAssignments = useCategorySync(savedTabsUseCases)
  useEffect(() => {
    if (!settings.enableCategories) {
      return
    }
    if (tabGroupsWithUrls.length === 0 || categories.length === 0) {
      return
    }
    void syncCategoryAssignments()
  }, [
    tabGroupsWithUrls,
    categories,
    categoryLookup,
    settings.enableCategories,
    syncCategoryAssignments,
  ])

  // 検索・フィルタ適用後のグループを整理（メモ化）
  const { categorized, uncategorized } = useMemo(
    () => organizeTabGroups(),
    [organizeTabGroups],
  )

  const {
    handleCancelUncategorizedReorder,
    handleUncategorizedDragEnd,
    handleConfirmUncategorizedReorder,
  } = useUncategorizedReorderHandlers({
    isUncategorizedReorderMode,
    setIsUncategorizedReorderMode,
    tempUncategorizedOrder,
    setTempUncategorizedOrder,
    uncategorized,
    categorized,
    refreshTabGroupsWithUrls,
    savedTabsUseCases,
    t,
  })
  console.log('表示判定デバッグ:')
  console.log('- categorized:', categorized)
  console.log('- uncategorized:', uncategorized)

  const customProjectsForHeader = customProjects
  const filteredCustomProjects = useFilteredCustomProjects(
    savedTabsUseCases,
    customProjects,
    searchQuery,
  )

  // 表示判定・表示用整形は `createCategorizedDisplayState` へ移設（issue #504）。
  // domain / chrome API / storage に依存しない pure 関数として
  // `presentation/lib/categorized-display.ts` に切り出し済み。
  // `filteredCustomProjects` は `useFilteredCustomProjects` hook 内で
  // 非同期 filter された値（customProjects / searchQuery / savedTabsUseCases
  // 変更時に更新）。
  const {
    hasContentTabGroups,
    hasVisibleCategoryGroups,
    headerFilteredTabGroups,
    shouldShowUncategorizedList,
    shouldShowUncategorizedSectionHeader,
    uncategorizedForDisplay,
  } = useMemo(
    () =>
      createCategorizedDisplayState({
        categorized,
        enableCategories: settings.enableCategories,
        filteredCustomProjects,
        isUncategorizedReorderMode,
        searchQuery,
        tempUncategorizedOrder,
        uncategorized,
        viewMode,
      }),
    [
      categorized,
      settings.enableCategories,
      filteredCustomProjects,
      isUncategorizedReorderMode,
      searchQuery,
      tempUncategorizedOrder,
      uncategorized,
      viewMode,
    ],
  )

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

  // ストレージ変更検出時のリスナー。`StorageChangePort` 経由で chrome API 実装
  // (infrastructure 層) と疎結合にし、port 境界をまたいだ購読 / 解除として
  // 扱う（issue #503）。React 側は購読開始 / 解除と state 反映のみに責務を絞り、
  // Chrome ストレージ変更通知の詳細は port 実装側に閉じ込めている。
  useEffect(() => {
    const unsubscribe = deps.storageChangePort.subscribe((changes) => {
      console.log('ストレージ変更を検出:', changes)
      void syncStorageChanges({
        changes,
        refreshTabGroupsWithUrls,
        setCategories,
        setCustomProjects,
        setSettings,
        syncDomainDataToCustomProjects,
        viewModeRef,
      })
    })
    return () => {
      unsubscribe()
    }
  }, [
    deps.storageChangePort,
    refreshTabGroupsWithUrls,
    syncDomainDataToCustomProjects,
    setCategories,
    setCustomProjects,
    viewModeRef,
  ])

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

  const { handleMoveUrlBetweenProjects } = useProjectMoveHandlers({
    savedTabsUseCases,
    setCustomProjects,
    t,
  })

  // カテゴリ間でURLを移動するハンドラ
  const handleMoveUrlsBetweenCategories = useCallback(async () => {}, [])
  const customProjectsForDisplay = filteredCustomProjects
  const shouldShowCategoryReorderFooter =
    isCategoryReorderMode && viewMode === 'domain'
  const categoryOrderForDisplay = isCategoryReorderMode
    ? tempCategoryOrder
    : categoryOrder
  const domainState = useMemo(
    () => ({
      hasVisibleCategoryGroups,
      isCategoryReorderMode,
      isLoading,
      isUncategorizedReorderMode,
      shouldShowUncategorizedList,
      shouldShowUncategorizedSectionHeader,
    }),
    [
      hasVisibleCategoryGroups,
      isCategoryReorderMode,
      isLoading,
      isUncategorizedReorderMode,
      shouldShowUncategorizedList,
      shouldShowUncategorizedSectionHeader,
    ],
  )
  const categoryManagementModalDeps = useMemo(
    () => ({
      categoryAssignmentPort: deps.categoryAssignmentPort,
      getSavedTabsPageDataQuery: savedTabsUseCases.getSavedTabsPageData,
    }),
    [deps.categoryAssignmentPort, savedTabsUseCases.getSavedTabsPageData],
  )
  const categoryManagementModalUseCases = useMemo(
    () => ({
      renameParentCategory: savedTabsUseCases.renameParentCategory,
      addDomainToParentCategory: savedTabsUseCases.addDomainToParentCategory,
      removeDomainFromParentCategory:
        savedTabsUseCases.removeDomainFromParentCategory,
      deleteParentCategory: savedTabsUseCases.deleteParentCategory,
    }),
    [
      savedTabsUseCases.renameParentCategory,
      savedTabsUseCases.addDomainToParentCategory,
      savedTabsUseCases.removeDomainFromParentCategory,
      savedTabsUseCases.deleteParentCategory,
    ],
  )
  const mainContent =
    viewMode === 'domain' ? (
      <DomainModeContainer
        state={domainState}
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
        reorderTabGroupUrlsUseCase={savedTabsUseCases.reorderTabGroupUrls}
        renameParentCategoryUseCase={savedTabsUseCases.renameParentCategory}
        categoryManagementModalDeps={categoryManagementModalDeps}
        categoryManagementModalUseCases={categoryManagementModalUseCases}
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
        getProjectUrlsUseCase={savedTabsUseCases.getProjectUrls}
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
          // eslint-disable-next-line typescript/no-misused-promises
          onCreateProject={handleCreateProject}
          currentMode={viewMode}
          // eslint-disable-next-line typescript/no-misused-promises
          onModeChange={handleViewModeChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          getSavedTabsPageDataQuery={savedTabsUseCases.getSavedTabsPageData}
          createParentCategoryUseCase={savedTabsUseCases.createParentCategory}
          deleteParentCategoryUseCase={savedTabsUseCases.deleteParentCategory}
          assignDomainToCategoryUseCase={
            savedTabsUseCases.assignDomainToCategory
          }
        />
        {mainContent}
        {shouldShowCategoryReorderFooter && (
          <CategoryReorderFooter
            // eslint-disable-next-line typescript/no-misused-promises
            onConfirmCategoryReorder={handleConfirmCategoryReorder}
            onCancelCategoryReorder={handleCancelCategoryReorder}
          />
        )}
      </div>
    </>
  )
}

const SavedTabsApp = (props: SavedTabsAppProps) => useSavedTabsAppView(props)

// eslint-disable-next-line react/only-export-components -- useSavedTabsAppView is exported for testing the view in isolation
export { SavedTabsApp, useSavedTabsAppView }
