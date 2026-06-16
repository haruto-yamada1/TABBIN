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
import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import {
  buildPresentationCategoryLookup,
  organizeTabGroupsWithCategories,
} from '@/contexts/saved-tabs/domain/services/SavedTabsCategorizationService'
import { defaultUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'
import { CategoryReorderFooter } from '@/contexts/saved-tabs/presentation/components/Footer'
import { Header } from '@/contexts/saved-tabs/presentation/components/Header' // ヘッダーコンポーネントをインポート
import { CustomModeContainer } from '@/contexts/saved-tabs/presentation/containers/CustomModeContainer'
import { DomainModeContainer } from '@/contexts/saved-tabs/presentation/containers/DomainModeContainer'
import { useDomainModeController } from '@/contexts/saved-tabs/presentation/controllers/useDomainModeController'
import type { UseSavedTabsControllerReturn } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import { useCategoryManagement } from '@/contexts/saved-tabs/presentation/hooks/useCategoryManagement'
import { useProjectManagement } from '@/contexts/saved-tabs/presentation/hooks/useProjectManagement'
import { useTabData } from '@/contexts/saved-tabs/presentation/hooks/useTabData'
import { createCategorizedDisplayState } from '@/contexts/saved-tabs/presentation/lib/categorized-display'
import { moveCustomProjectUrlAndSyncState } from '@/contexts/saved-tabs/presentation/lib/custom-project-move'
import { filterCustomProjectsByQuery } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import { handleTabGroupRemoval } from '@/contexts/saved-tabs/presentation/lib/tab-operations'
import type { ResolveActiveRef } from '@/contexts/saved-tabs/presentation/pages/SavedTabsPage'
import { syncStorageChanges } from '@/contexts/saved-tabs/presentation/services/modeSyncService'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { ParentCategory, TabGroup, ViewMode } from '@/types/storage'

import {
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  getSnapshotSavedTabs,
  notifyDeleteFailure,
  shouldWaitForInitialViewMode,
  showOpenedUrlsUndoToast,
  syncSavedTabsViewModeLocation,
  toDomainParentCategories,
  toDomainTabGroupsForReorder,
} from './savedTabsApp.helpers'
import type { OpenedUrlsStorageSnapshot } from './savedTabsApp.helpers'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

/**
 * 親カテゴリから指定されたドメインIDを削除して保存します。
 */
const removeDomainFromParentCategories = async (
  id: string,
  categories: ParentCategory[],
  setCategories: (cats: ParentCategory[]) => void,
  parentCategoryRepository: ParentCategoryRepository,
) => {
  const updatedCategories = categories.map((category) => ({
    ...category,
    domains: category.domains.filter((domainId) => domainId !== id),
  }))
  await parentCategoryRepository.saveAll(
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    updatedCategories as unknown as Parameters<
      typeof parentCategoryRepository.saveAll
    >[0],
  )
  setCategories(updatedCategories)
}

interface SavedTabsAppProps {
  readonly controller: UseSavedTabsControllerReturn
  readonly deps: SavedTabsUseCasesDeps
  readonly initialViewMode?: ViewMode
  readonly isAiSidebarOpen?: boolean
  readonly onViewModeNavigate?: (mode: ViewMode) => void
  readonly resolveActiveRef: ResolveActiveRef
  readonly useCases: SavedTabsUseCases
}

const useSavedTabsAppView = ({
  // eslint-disable-line eslint/max-lines-per-function
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
    getSavedTabsPageDataQuery: savedTabsUseCases.getSavedTabsPageData,
    categoryAssignmentPort: deps.categoryAssignmentPort,
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
    deps.customProjectRepository,
    tabDataState.tabGroups,
    settings,
    initialViewMode,
    deps.customProjectsCommandService,
    savedTabsUseCases.createCustomProject,
    savedTabsUseCases.deleteCustomProject,
    savedTabsUseCases.updateCustomProjectName,
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
  // 既存のタブ開く処理を OpenSavedUrlUseCase 経由に置き換え。
  // - URL → urlRecordId は `findUrlRecordByUrlUseCase` から逆引きし、
  //   見つからない旧データは `browserTabPort` で開くだけのフォールバックを取る。
  // - `removeTabAfterOpen` が true のときは、`BuildSavedTabsSnapshotUseCase`
  //   経由で削除前 snapshot を取得して既存の Undo トースト経路と接続する
  //   （issue #494 で `chrome.storage.local.get` 直叩きを撤去）。
  // - post-open の UI 更新は `TabGroupRepository.findAll` を使い、
  //   `chrome.storage.local.get` を残さない（`refreshTabGroupsWithUrls` 内で
  //   urlRecords から `urls` を再解決する）。
  const handleOpenTab = useCallback(
    async (url: string) => {
      try {
        const lookup = await savedTabsUseCases.findUrlRecordByUrl({ url })

        if (!lookup.record) {
          // urlRecord に登録されていない URL（旧データなど）は
          // browserTabPort 経由で開くだけにとどめ、削除処理はスキップする。
          await deps.browserTabPort.open({ url })
          return
        }

        const snapshot = settings.removeTabAfterOpen
          ? await savedTabsUseCases.buildSavedTabsSnapshot({
              parentCategories: toDomainParentCategories(categories),
            })
          : undefined

        const urlRecordId = lookup.record.id
        const result = await savedTabsUseCases.openSavedUrl({
          origin: 'click',
          settings: {
            removeTabAfterExternalDrop: false,
            removeTabAfterOpen: settings.removeTabAfterOpen,
          },
          urlRecordId,
        })

        // use-case が `snapshot` を返すのは「TabGroup / CustomProject の
        // urlIds から実際に削除が走った」ケース。urlRecord 自体が他で
        // 参照されていて削除されない場合でも、TabGroup から URL ID が
        // 取り除かれているなら Undo 対象として扱う必要がある。よって
        // `removedUrlRecordId` ではなく `snapshot` の有無を判定基準にする。
        if (snapshot && result.snapshot) {
          // post-open の UI 更新は \`refreshTabGroupsWithUrls()\` (引数なし)
          // に委譲し、\`useTabData\` 側の storage 読み取り経路 (\`urls\` /
          // \`urlSubCategories\` / \`subCategories\` / \`categoryKeywords\` /
          // \`subCategoryOrder\` などのリッチ補助フィールド付き) を
          // そのまま使う。repository の \`findAll\` 戻り値は domain entity
          // (リッチ補助フィールドを持たない) なので、ここでは渡さない
          // (Codex レビュー対応: P2 / issue #494)。
          await refreshTabGroupsWithUrls()
          showOpenedUrlsUndoToast({
            count: 1,
            refreshTabGroupsWithUrls,
            savedTabsUseCases,
            setCustomProjects,
            snapshot,
            t,
          })
          console.log(`URL ${url} を開いた後、保存データから削除しました`)
        }
      } catch (error) {
        console.error('タブを開く処理エラー:', error)
      }
    },
    [
      categories,
      deps,
      savedTabsUseCases,
      settings.removeTabAfterOpen,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      t,
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
        // Undo 用 snapshot は use-case 呼び出し**前**に取得する。
        // use-case 実行後は storage が post-delete 状態になっているため、
        // その snapshot を渡しても Undo が no-op 相当になり復元できない。
        // `BuildSavedTabsSnapshotUseCase` 経由で取得し、
        // `chrome.storage.local.get` の直叩きを撤去する（issue #494）。
        const preDeleteSnapshot = settings.removeTabAfterOpen
          ? await savedTabsUseCases.buildSavedTabsSnapshot({
              parentCategories: toDomainParentCategories(categories),
            })
          : undefined

        // 一括オープンは OpenAllSavedUrlsUseCase に委譲し、
        // eslint-disable-next-line eslint/no-restricted-properties -- TODO(#488-followup): presentation 層から chrome.* を撤去し Repository / Port 経由へ移行
        // eslint-disable-next-line eslint/no-restricted-properties, typescript/unbound-method -- TODO(#488-followup): presentation 層から chrome.* を撤去し Repository / Port 経由へ移行
        // `chrome.tabs.create` / `chrome.windows.create` の直接呼び出しを
        // presentation 層から撤去する。`active` 制御は composition 層の
        // `BrowserTabPort.resolveActive` が `settings.openUrlInBackground` を
        // 反映する。
        const result = await savedTabsUseCases.openAllSavedUrls({
          mode: settings.openAllInNewWindow ? 'newWindow' : 'backgroundTabs',
          removeTabAfterOpen: settings.removeTabAfterOpen,
          urls: urls.map((u) => u.url),
        })

        // 開いたあとに保存データから削除する設定のときは、Undo 用 toast を
        // 出して pre-delete snapshot から復元できるようにする。
        if (
          settings.removeTabAfterOpen &&
          preDeleteSnapshot &&
          result.snapshot
        ) {
          // Codex review (PR #521): 旧実装は `preDeleteSnapshot` を
          // `refreshTabGroupsWithUrls` に渡していたが、use-case 側で
          // 既に `UrlRecordRepository.removeByIds` が走っているため、
          // pre-delete snapshot で UI を塗り替えると storage change
          // 通知が無いときに「削除済み URL が見えたまま」になる。
          // ここでは storage から最新を取得して UI を同期し、
          // `preDeleteSnapshot` は Undo 用にだけ保持する。
          await refreshTabGroupsWithUrls()
          showOpenedUrlsUndoToast({
            count: result.removedUrlRecordIds.length,
            refreshTabGroupsWithUrls,
            savedTabsUseCases,
            setCustomProjects,
            snapshot: preDeleteSnapshot,
            t,
          })
          console.log(
            `${urls.length}個のURLを開いた後、保存データから削除しました`,
          )
        }
      } catch (error) {
        console.error('タブ一括オープンエラー:', error)
      }
    },
    [
      categories,
      settings.openAllInNewWindow,
      settings.removeTabAfterOpen,
      savedTabsUseCases,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      t,
    ],
  )

  // 単一 TabGroup 削除を DeleteTabGroupUseCase 経由に置き換える。
  // - 削除判断・未参照 URL 削除・対象 TabGroup の storage 書き戻しは
  //   use-case に委譲し、UI 側は `chrome.storage.local` の
  //   `savedTabs` 直接 set を持たない。
  // - Undo snapshot は `BuildSavedTabsSnapshotUseCase` 経由で repository
  //   群から組み立て、`chrome.storage.local.get` の直叩きを撤去する
  //   （issue #494）。
  // - `handleTabGroupRemoval` /
  //   `removeDomainFromParentCategories` などは他 storage key を触る
  //   副作用なので、issue 範囲外として従来通り UI 側で実行する。
  // - `removeUrlsFromCustomProjectsForGroup` は issue #512 で
  //   `savedTabsUseCases.removeUrlsFromCustomProjects` use-case へ
  //   移設済み。
  const handleDeleteGroup = useCallback(
    async (id: string) => {
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // 削除前にカテゴリ設定と親カテゴリ情報を含めた snapshot を取得
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        const savedTabs = getSnapshotSavedTabs(deleteSnapshot)
        const groupToDelete = savedTabs.find((group) => group.id === id)
        if (!groupToDelete) {
          return
        }
        console.log(`グループを削除: ${groupToDelete.domain}`)

        // 専用の削除前処理関数を呼び出し（インポートした関数を使用）
        await handleTabGroupRemoval(id, {
          categoriesCommandService: deps.categoriesCommandService,
          domainCategoryMappingRepository: deps.domainCategoryMappingRepository,
          parentCategoryRepository: deps.parentCategoryRepository,
          tabGroupRepository: deps.tabGroupRepository,
        })

        // 削除判断・未参照 UrlRecord 掃除・savedTabs の書き戻しは
        // DeleteTabGroupUseCase に委譲する。use-case が見つからない
        // グループを SavedTabsDomainError で通知するため、UI 側は
        // 事前に savedTabs から対象グループの存在を保証しておく。
        await savedTabsUseCases.deleteTabGroup({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupId: id as unknown as TabGroupId,
        })

        // グループに属するすべてのURLをカスタムプロジェクトからも削除
        // (issue #512: presentation helper から application use-case
        //  `removeUrlsFromCustomProjects` へ移設済み)。
        await savedTabsUseCases.removeUrlsFromCustomProjects({
          tabGroups: [groupToDelete],
        })

        // 以降は従来通りの処理
        const updatedGroups = savedTabs.filter((group) => group.id !== id)
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
        await removeDomainFromParentCategories(
          id,
          categories,
          setCategories,
          deps.parentCategoryRepository,
        )
        showOpenedUrlsUndoToast({
          count: countTabGroupUrls(groupToDelete),
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })

        console.log('グループ削除処理が完了しました')
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps.* 配下は composition 安定参照
    [
      isUncategorizedReorderMode,
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      setCategories,
      t,
    ],
  )

  const handleDeleteGroups = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps.* 配下は composition 安定参照
    async (ids: string[]) => {
      if (ids.length === 0) {
        return
      }
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // 削除前のスナップショットは `BuildSavedTabsSnapshotUseCase` 経由で
        // repository 群から組み立て、Undo 時の storage 全体復元
        // （`customProjects` / `customProjectOrder` を含む）で使う
        // （issue #494）。`savedTabs` 側の削除本体は use-case 側に委譲する。
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        const savedTabs = getSnapshotSavedTabs(deleteSnapshot)

        const groupsToDelete = savedTabs.filter((group) =>
          ids.includes(group.id),
        )
        if (groupsToDelete.length === 0) {
          return
        }

        console.log(`${groupsToDelete.length}件のグループを一括削除します`)

        // 旧 `features/saved-tabs/lib/tab-operations` のドメイン設定
        // 保存処理は、他 storage key（domainCategorySettings /
        // parentCategories.domainNames）を触る副作用のため、issue 範囲外
        // として従来通り UI 側で実行する。
        await Promise.all(
          ids.map((id) =>
            handleTabGroupRemoval(id, {
              categoriesCommandService: deps.categoriesCommandService,
              domainCategoryMappingRepository:
                deps.domainCategoryMappingRepository,
              parentCategoryRepository: deps.parentCategoryRepository,
              tabGroupRepository: deps.tabGroupRepository,
            }),
          ),
        )

        // 複数 TabGroup 削除本体は DeleteTabGroupsUseCase 経由に置き換える。
        // 未参照になった UrlRecord の掃除と savedTabs の書き戻しは
        // use-case が一括で行う。
        await savedTabsUseCases.deleteTabGroups({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupIds: ids as unknown as Parameters<
            typeof savedTabsUseCases.deleteTabGroups
          >[0]['tabGroupIds'],
        })

        // customProject 側の URL ID 同期削除は他 storage key を触る
        // ため、issue 範囲外として従来通り UI 側で実行していたが、
        // issue #512 で `removeUrlsFromCustomProjects` use-case へ
        // 移設済み。`deps.customProjectsCommandService` 直叩きは
        // 必要なくなった。
        await savedTabsUseCases.removeUrlsFromCustomProjects({
          tabGroups: groupsToDelete,
        })

        const idSet = new Set(ids)
        const updatedGroups = savedTabs.filter((group) => !idSet.has(group.id))
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
        await deps.parentCategoryRepository.saveAll(
          // eslint-disable-next-line typescript/no-unsafe-type-assertion
          updatedCategories as unknown as Parameters<
            typeof deps.parentCategoryRepository.saveAll
          >[0],
        )
        setCategories(updatedCategories)
        showOpenedUrlsUndoToast({
          count: groupsToDelete.reduce(
            (total, group) => total + countTabGroupUrls(group),
            0,
          ),
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })

        console.log('一括グループ削除処理が完了しました')
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps.* 配下は composition 安定参照
    [
      isUncategorizedReorderMode,
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      setCategories,
      t,
    ],
  )
  const handleDeleteUrl = useCallback(
    async (groupId: string, url: string) => {
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // Undo 用 snapshot は `BuildSavedTabsSnapshotUseCase` 経由で
        // repository 群から組み立て、`chrome.storage.local.get` の
        // 直叩きを撤去する（issue #494）。
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        // 単体 URL 削除は DeleteSavedUrlUseCase 経由に置き換える。
        // TabGroup と未参照 UrlRecord の削除は use-case に委譲し、
        // customProject 側の URL 同期削除は他 storage key を触るため
        // issue 範囲外として従来通り UI 側で実行する。
        await savedTabsUseCases.deleteSavedUrl({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupId: groupId as unknown as Parameters<
            typeof savedTabsUseCases.deleteSavedUrl
          >[0]['tabGroupId'],
          url,
        })
        showOpenedUrlsUndoToast({
          count: 1,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
        console.log(`URL ${url} をグループ ${groupId} から削除しました`)
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      t,
    ],
  )
  const handleDeleteUrls = useCallback(
    async (groupId: string, urls: string[]) => {
      if (urls.length === 0) {
        return
      }
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // Undo 用 snapshot は `BuildSavedTabsSnapshotUseCase` 経由で取得
        // （issue #494）。
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        // 複数 URL 削除は DeleteSavedUrlsUseCase 経由に置き換える。
        await savedTabsUseCases.deleteSavedUrls({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupId: groupId as unknown as Parameters<
            typeof savedTabsUseCases.deleteSavedUrls
          >[0]['tabGroupId'],
          urls,
        })
        console.log(
          `${urls.length}件のURLをグループ ${groupId} から削除しました`,
        )
        showOpenedUrlsUndoToast({
          count: urls.length,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      t,
    ],
  )
  const handleUpdateUrls = useCallback(
    (groupId: string, _updatedUrls: TabGroup['urls']) => {
      console.log(`グループ ${groupId} のURL更新はストレージ同期に委譲しました`)
      return Promise.resolve()
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
  // ストレージに反映するための副作用（organizeTabGroups から分離した副作用）。
  // 同期本体は SyncCategoryAssignmentsUseCase 経由で実行し、
  // eslint-disable-next-line eslint/no-restricted-properties -- TODO(#488-followup): presentation 層から chrome.* を撤去し Repository / Port 経由へ移行
  // eslint-disable-next-line eslint/no-restricted-properties, typescript/unbound-method -- TODO(#488-followup): presentation 層から chrome.* を撤去し Repository / Port 経由へ移行
  // `chrome.storage.local.get/set` の直接呼び出しを削減する。
  useEffect(
    () => {
      if (!settings.enableCategories) {
        return
      }
      if (tabGroupsWithUrls.length === 0 || categories.length === 0) {
        return
      }
      const syncCategoryAssignments = async () => {
        try {
          await savedTabsUseCases.syncCategoryAssignments({})
          console.log('[カテゴリ同期] use-case 経由で同期しました')
        } catch (error) {
          console.error('[カテゴリ同期] ストレージ同期エラー:', error)
        }
      }
      // eslint-disable-next-line typescript/no-floating-promises
      syncCategoryAssignments()
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- syncCategoryAssignments は クロージャ内 helper
    [
      tabGroupsWithUrls,
      categories,
      categoryLookup,
      settings.enableCategories,
      savedTabsUseCases,
    ],
  )

  // 検索・フィルタ適用後のグループを整理（メモ化）
  const { categorized, uncategorized } = useMemo(
    () => organizeTabGroups(),
    [organizeTabGroups],
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
  const handleConfirmUncategorizedReorder = useCallback(
    async () => {
      if (!isUncategorizedReorderMode) {
        return
      }
      try {
        const categorizedDomains = Object.values(categorized).flat()

        // 新しい順序：カテゴリ分類されたドメイン + 並び替えた未分類ドメイン
        const newTabGroups = [...categorizedDomains, ...tempUncategorizedOrder]

        // 並び替え保存は `ReorderTabGroupsUseCase` 経由で
        // `TabGroupRepository.saveAll` に委譲し、`chrome.storage.local.set`
        // の直叩きを撤去する（issue #494）。Repository 実装側の mapper が
        // `urls` / `urlSubCategories` などのリッチ補助フィールドを持ち越す。
        await savedTabsUseCases.reorderTabGroups({
          tabGroups: toDomainTabGroupsForReorder(newTabGroups),
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
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- stable deps
    [
      isUncategorizedReorderMode,
      categorized,
      tempUncategorizedOrder,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      t,
    ],
  )
  console.log('表示判定デバッグ:')
  console.log('- categorized:', categorized)
  console.log('- uncategorized:', uncategorized)

  const customProjectsForHeader = customProjects
  const [filteredCustomProjects, setFilteredCustomProjects] =
    useState(customProjects)

  // 表示判定・表示用整形は `createCategorizedDisplayState` へ移設（issue #504）。
  // domain / chrome API / storage に依存しない pure 関数として
  // `presentation/lib/categorized-display.ts` に切り出し済み。
  // `filteredCustomProjects` が `useState(customProjects)` で確定したあとに
  // 組み立てる必要があるため、`useEffect` で同期する処理群の直後に置く。
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

  useEffect(() => {
    let isCancelled = false

    const syncFilteredCustomProjects = async () => {
      const nextProjects = await filterCustomProjectsByQuery({
        customProjects,
        loadProjectUrls: savedTabsUseCases.getProjectUrls,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedTabsUseCases.getProjectUrls は composition 安定参照
  }, [customProjects, searchQuery])

  // ストレージ変更検出時のリスナー。`StorageChangePort` 経由で chrome API 実装
  // (infrastructure 層) と疎結合にし、port 境界をまたいだ購読 / 解除として
  // 扱う（issue #503）。React 側は購読開始 / 解除と state 反映のみに責務を絞り、
  // Chrome ストレージ変更通知の詳細は port 実装側に閉じ込めている。
  useEffect(
    () => {
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
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `deps` 配下は composition 安定参照
    [
      deps.storageChangePort,
      refreshTabGroupsWithUrls,
      syncDomainDataToCustomProjects,
      setCategories,
      setCustomProjects,
      viewModeRef,
    ],
  )

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
          getCustomProjects: async () => {
            const projects = await deps.customProjectRepository.findAll()
            return projects.map((project) => ({
              categories: [...project.categories],
              createdAt: project.createdAt,
              id: project.id,
              name: project.name,
              updatedAt: project.updatedAt,
              urlIds: [...project.urlIds],
            }))
          },
          moveUrlBetweenCustomProjects:
            deps.customProjectsCommandService.moveUrlBetweenCustomProjects,
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
    [
      deps.customProjectRepository,
      deps.customProjectsCommandService,
      setCustomProjects,
      t,
    ],
  )

  // カテゴリ間でURLを移動するハンドラ
  const handleMoveUrlsBetweenCategories = useCallback(async () => {}, [])
  const customProjectsForDisplay = filteredCustomProjects
  const shouldShowCategoryReorderFooter =
    isCategoryReorderMode && viewMode === 'domain'
  const categoryOrderForDisplay = isCategoryReorderMode
    ? tempCategoryOrder
    : categoryOrder
  const mainContent =
    viewMode === 'domain' ? (
      <DomainModeContainer
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
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
        reorderTabGroupUrlsUseCase={savedTabsUseCases.reorderTabGroupUrls}
        renameParentCategoryUseCase={savedTabsUseCases.renameParentCategory}
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop -- TODO(#502-followup): category management deps の memo 化または context 化で解消予定
        categoryManagementModalDeps={{
          categoryAssignmentPort: deps.categoryAssignmentPort,
          getSavedTabsPageDataQuery: savedTabsUseCases.getSavedTabsPageData,
        }}
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop -- TODO(#502-followup): category management use-cases の memo 化または context 化で解消予定
        categoryManagementModalUseCases={{
          renameParentCategory: savedTabsUseCases.renameParentCategory,
          addDomainToParentCategory:
            savedTabsUseCases.addDomainToParentCategory,
          removeDomainFromParentCategory:
            savedTabsUseCases.removeDomainFromParentCategory,
          deleteParentCategory: savedTabsUseCases.deleteParentCategory,
        }}
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

export { SavedTabsApp, useSavedTabsAppView }
