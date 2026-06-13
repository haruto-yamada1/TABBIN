import { useCallback, useMemo, useState } from 'react'

import type { CustomProject } from '../../domain/entities/CustomProject'
import type { CustomModeViewModel } from '../view-models/CustomModeViewModel'
import { createCustomModeViewModel } from '../view-models/CustomModeViewModel'
import type { CustomProjectViewModel } from '../view-models/CustomProjectViewModel'
import type { UseSavedTabsControllerReturn } from './useSavedTabsController'

/**
 * `useCustomModeController` への入力。
 *
 * `useSavedTabsController` の戻り値を必須で受け取り、その上に
 * Custom モード固有の state / handler を組み立てる。
 */
export interface UseCustomModeControllerInput {
  readonly controller: UseSavedTabsControllerReturn
  readonly initialCustomProjects?: readonly CustomProject[]
}

/**
 * `useCustomModeController` の戻り値。
 *
 * - `viewModel` は `CustomModeContainer` がそのまま描画できる形に整形済み
 * - `openUrl` は `url` ベースで `useSavedTabsController` の use-case 呼び出し
 *   へ変換する
 * - `setSearchQuery` は controller がローカルに持つ検索 state の setter
 */
export interface UseCustomModeControllerReturn {
  readonly viewModel: CustomModeViewModel
  readonly projects: readonly CustomProjectViewModel[]
  readonly searchQuery: string
  readonly setSearchQuery: (next: string) => void
  readonly openUrl: (url: string) => Promise<void>
  readonly refresh: () => Promise<void>
}

/**
 * presentation 層の Custom モード controller hook。
 *
 * 責務:
 * 1. `useSavedTabsController` の view-model を受け取り、Custom モード用に
 *    検索クエリ / 表示用 state を加えた `CustomModeViewModel` へ整形する
 * 2. `url` ベースの open を `urlRecordId` ベースに詰め替え、
 *    use-case 経由で開く
 *
 * 非責務:
 * - カスタムプロジェクトの CRUD / URL 追加 / カテゴリ追加など
 *   project 内 mutation は現状 `features/saved-tabs/hooks/useProjectManagement`
 *   内の `chrome.storage` 直操作で成立している。`MoveUrlBetweenProjects` 等
 *   も storage 直操作のため、application use-case 化の follow-up まで
 *   features 側に残す。
 * - `chrome.storage.local` の直接 set / get
 */
export const useCustomModeController = (
  input: UseCustomModeControllerInput,
): UseCustomModeControllerReturn => {
  const { controller, initialCustomProjects } = input
  const {
    viewModel: parentViewModel,
    openSavedUrl,
    refresh: parentRefresh,
  } = controller

  const [searchQuery, setSearchQuery] = useState<string>('')

  const projectsForView = useMemo<readonly CustomProjectViewModel[]>(() => {
    if (
      initialCustomProjects &&
      initialCustomProjects.length > 0 &&
      parentViewModel.customProjects.length === 0
    ) {
      return initialCustomProjects.map((project) => ({
        categories: [...project.categories],
        categoryOrder: project.categories,
        createdAt: project.createdAt,
        displayUrlCount: project.urlIds.length,
        hasUrls: project.urlIds.length > 0,
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        urlIds: [...project.urlIds],
        urls: [],
      }))
    }
    return parentViewModel.customProjects
  }, [initialCustomProjects, parentViewModel.customProjects])

  const viewModel = useMemo<CustomModeViewModel>(
    () =>
      createCustomModeViewModel({
        error: parentViewModel.error,
        loading: parentViewModel.loading,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        projects: projectsForView.map((vm) => ({
          categories: [...vm.categories],
          categoryOrder: [...vm.categoryOrder],
          createdAt: vm.createdAt,
          id: vm.id,
          name: vm.name,
          updatedAt: vm.updatedAt,
          urlIds: [...vm.urlIds],
          urls: [...vm.urls],
        })) as unknown as readonly CustomProject[],
        searchQuery,
      }),
    [
      parentViewModel.error,
      parentViewModel.loading,
      projectsForView,
      searchQuery,
    ],
  )

  const openUrl = useCallback(
    async (url: string) => {
      const urlRecords = await controller.deps.urlRecordRepository.findAll()
      const targetRecord = urlRecords.find((record) => record.url === url)
      if (!targetRecord) {
        await controller.deps.browserTabPort.open({ url })
        return
      }
      await openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: targetRecord.id,
      })
    },
    [controller.deps, openSavedUrl],
  )

  return {
    openUrl,
    projects: projectsForView,
    refresh: parentRefresh,
    searchQuery,
    setSearchQuery,
    viewModel,
  }
}
