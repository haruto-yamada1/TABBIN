import { useCallback, useMemo, useState } from 'react'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { CustomProjectViewModel } from '@/contexts/saved-tabs/presentation/view-models/CustomProjectViewModel'
import type {
  DomainModeViewModel,
  ParentCategoryViewModel,
} from '@/contexts/saved-tabs/presentation/view-models/DomainModeViewModel'
import {
  createDomainModeViewModel,
  toParentCategoryViewModel,
} from '@/contexts/saved-tabs/presentation/view-models/DomainModeViewModel'
import type { TabGroupViewModel } from '@/contexts/saved-tabs/presentation/view-models/TabGroupViewModel'

import type { UseSavedTabsControllerReturn } from './useSavedTabsController'

/**
 * `useDomainModeController` への入力。
 *
 * `useSavedTabsController` の戻り値を必須で受け取り、その上に
 * Domain モード固有の state / handler を組み立てる。parent categories は
 * presentation 層が repository を持たないため、呼び出し側が
 * `parentCategories` を持っていればそのまま合成する。
 */
export type UseDomainModeControllerInput = {
  readonly controller: UseSavedTabsControllerReturn
  readonly initialTabGroups?: readonly TabGroup[]
  readonly initialParentCategories?: readonly ParentCategory[]
  readonly initialCustomProjects?: readonly CustomProject[]
}

/**
 * `useDomainModeController` の戻り値。
 *
 * - `viewModel` は `DomainModeContainer` がそのまま描画できる形に整形済み
 * - `openTab` / `openAllTabs` は `url` ベースの入力を受けて
 *   `useSavedTabsController` の use-case 呼び出しへ変換する
 * - `setSearchQuery` / `setParentCategories` は controller がローカルに持つ
 *   派生 state の setter
 */
export type UseDomainModeControllerReturn = {
  readonly viewModel: DomainModeViewModel
  readonly categories: readonly ParentCategoryViewModel[]
  readonly setParentCategories: (
    next:
      | readonly ParentCategory[]
      | ((prev: readonly ParentCategory[]) => readonly ParentCategory[]),
  ) => void
  readonly searchQuery: string
  readonly setSearchQuery: (next: string) => void
  readonly openTab: (url: string) => Promise<void>
  readonly openAllTabs: (
    urls: readonly { readonly url: string; readonly title: string }[],
    options: {
      readonly openAllInNewWindow: boolean
      readonly openUrlInBackground: boolean
    },
  ) => Promise<void>
  readonly deleteGroup: (tabGroupId: string) => Promise<void>
  readonly deleteGroups: (tabGroupIds: readonly string[]) => Promise<void>
  readonly refresh: () => Promise<void>
  readonly customProjects: readonly CustomProjectViewModel[]
  readonly tabGroups: readonly TabGroupViewModel[]
}

/**
 * presentation 層の Domain モード controller hook。
 *
 * 責務:
 * 1. `useSavedTabsController` の view-model を受け取り、Domain モード用に
 *    category 情報 / 検索クエリ / 表示用 state を加えた
 *    `DomainModeViewModel` へ整形する
 * 2. `url` ベースの open / openAll を `urlRecordId` ベースに詰め替え、
 *    use-case 経由で開く
 * 3. 親カテゴリ state を controller 内に持ち、`DomainModeContainer` からの
 *    カテゴリ更新を repository 書き戻しと分離して受け取る
 *
 * 非責務:
 * - `chrome.storage.local` の直接 set / get
 *   (Undo を含む複雑な副作用は features 側の `savedTabsApp.helpers` を残す)
 * - 単一 URL 削除 / 複数 URL 削除の use-case 化
 *   (application 層未到達の storage 関数を呼ぶため features 側に残す)
 * - DnD / Sortable 状態管理
 *   (`DomainModeContainer` 内の `useSortOrder` / `useCategoryDnD` に残す)
 */
export const useDomainModeController = (
  input: UseDomainModeControllerInput,
): UseDomainModeControllerReturn => {
  const {
    controller,
    initialTabGroups,
    initialParentCategories,
    initialCustomProjects,
  } = input
  const {
    viewModel: parentViewModel,
    openSavedUrl,
    deleteTabGroup,
    refresh: parentRefresh,
  } = controller

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [parentCategoriesState, setParentCategoriesState] = useState<
    readonly ParentCategory[]
  >(initialParentCategories ?? [])

  const setParentCategories = useCallback(
    (
      next:
        | readonly ParentCategory[]
        | ((prev: readonly ParentCategory[]) => readonly ParentCategory[]),
    ) => {
      setParentCategoriesState((prev) =>
        typeof next === 'function' ? next(prev) : next,
      )
    },
    [],
  )

  const tabGroupsForView = useMemo<readonly TabGroupViewModel[]>(() => {
    if (
      parentViewModel.loading &&
      initialTabGroups &&
      initialTabGroups.length > 0 &&
      parentViewModel.tabGroups.length === 0
    ) {
      return initialTabGroups.map((group) => ({
        displayUrlCount: group.urls?.length ?? group.memberships?.length ?? 0,
        domain: group.domain,
        hasUrls: (group.urls?.length ?? group.memberships?.length ?? 0) > 0,
        id: group.id,
        parentCategoryId: group.parentCategoryId,
        subCategoryCount: 0,
        urls: group.urls?.map((url) => ({ ...url })) ?? [],
      }))
    }
    return parentViewModel.tabGroups
  }, [initialTabGroups, parentViewModel.loading, parentViewModel.tabGroups])

  const customProjectsForView = useMemo<
    readonly CustomProjectViewModel[]
  >(() => {
    if (
      parentViewModel.loading &&
      initialCustomProjects &&
      initialCustomProjects.length > 0 &&
      parentViewModel.customProjects.length === 0
    ) {
      return initialCustomProjects.map((project) => ({
        categories: [...project.categories],
        categoryOrder: project.categories,
        createdAt: project.createdAt,
        displayUrlCount:
          project.urls?.length ?? project.memberships?.length ?? 0,
        hasUrls: (project.urls?.length ?? project.memberships?.length ?? 0) > 0,
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        urls: project.urls?.map((url) => ({ ...url })) ?? [],
      }))
    }
    return parentViewModel.customProjects
  }, [
    initialCustomProjects,
    parentViewModel.customProjects,
    parentViewModel.loading,
  ])

  const viewModel = useMemo<DomainModeViewModel>(
    () =>
      createDomainModeViewModel({
        categories: parentCategoriesState,
        customProjects: customProjectsForView,
        error: parentViewModel.error,
        loading: parentViewModel.loading,
        searchQuery,
        // VM 形 (TabGroup のサブセット) を storage 形 TabGroup へ投影する
        // ための disable。`urls` / `subCategories` 等の optional 拡張
        // フィールド差分は mapper (`toTabGroupFromViewModel`) 経由で
        // 吸収する構造的キャスト。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- VM → storage TabGroup 投影
        tabGroups: tabGroupsForView.map((vm) => ({
          domain: vm.domain,
          id: vm.id,
          ...(vm.parentCategoryId !== undefined
            ? { parentCategoryId: vm.parentCategoryId }
            : {}),
          urls: [...vm.urls],
        })),
      }),
    [
      customProjectsForView,
      parentCategoriesState,
      parentViewModel.error,
      parentViewModel.loading,
      searchQuery,
      tabGroupsForView,
    ],
  )

  const openTab = useCallback(
    async (url: string) => {
      const { record } = await controller.useCases.findUrlRecordByUrl({ url })
      if (!record) {
        await controller.deps.browserTabPort.open({ url })
        return
      }
      await openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: record.id,
      })
    },
    [controller.deps.browserTabPort, controller.useCases, openSavedUrl],
  )

  const openAllTabs = useCallback(
    async (
      urls: readonly { readonly url: string; readonly title: string }[],
      options: {
        readonly openAllInNewWindow: boolean
        readonly openUrlInBackground: boolean
      },
    ) => {
      if (urls.length === 0) {
        return
      }
      // controller 内で `chrome.*` を直接呼ばず、`BrowserTabPort` 経由で
      // 1 URL ずつ開く。複数タブを 1 ウィンドウで開く挙動も port の
      // 単一 URL open を並列呼び出しで実現する。
      if (options.openAllInNewWindow) {
        // 1 ウィンドウに複数 URL をまとめて開く用途は port の単一 open では
        // 完全再現できないため、port に `openMany` 相当の API を生やす
        // follow-up が必要。暫定で port の open を並列呼び出しする
        // フォールバックを採る。
        await Promise.all(
          urls.map(async (item) =>
            controller.deps.browserTabPort.open({ url: item.url }),
          ),
        )
        return
      }
      await Promise.all(
        urls.map(async (item) =>
          controller.deps.browserTabPort.open({ url: item.url }),
        ),
      )
    },
    [controller.deps.browserTabPort],
  )

  const deleteGroup = useCallback(
    async (tabGroupId: string) => {
      await deleteTabGroup({ tabGroupId })
    },
    [deleteTabGroup],
  )

  const deleteGroups = useCallback(
    async (tabGroupIds: readonly string[]) => {
      await Promise.all(
        tabGroupIds.map(async (id) => deleteTabGroup({ tabGroupId: id })),
      )
    },
    [deleteTabGroup],
  )

  const categories = useMemo(
    () => parentCategoriesState.map(toParentCategoryViewModel),
    [parentCategoriesState],
  )

  return {
    categories,
    customProjects: customProjectsForView,
    deleteGroup,
    deleteGroups,
    openAllTabs,
    openTab,
    refresh: parentRefresh,
    searchQuery,
    setParentCategories,
    setSearchQuery,
    tabGroups: tabGroupsForView,
    viewModel,
  }
}
