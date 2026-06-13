import { useCallback, useMemo, useRef, useState } from 'react'

import type { CustomProject } from '../../domain/entities/CustomProject'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { DomainName } from '../../domain/value-objects/DomainName'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { SavedAt } from '../../domain/value-objects/SavedAt'
import type { TabGroupId } from '../../domain/value-objects/TabGroupId'
import type { Url } from '../../domain/value-objects/Url'
import type { UrlRecordId } from '../../domain/value-objects/UrlRecordId'
import type { SavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import type { CustomProjectViewModel } from '../view-models/CustomProjectViewModel'
import { toCustomProjectViewModel } from '../view-models/CustomProjectViewModel'
import type { SavedTabsViewModel } from '../view-models/SavedTabsViewModel'
import {
  createSavedTabsViewModel,
  createEmptySavedTabsViewModel,
} from '../view-models/SavedTabsViewModel'
import type { TabGroupViewModel } from '../view-models/TabGroupViewModel'
import { toTabGroupViewModel } from '../view-models/TabGroupViewModel'

/**
 * `useSavedTabsController` が UI に公開する入力。
 *
 * - `useCases` があれば application use-case 経由で操作する。
 * - テストや SSR 用に `initialTabGroups` / `initialCustomProjects` を渡せる。
 *   省略時は use-case / repository の readAll を初回マウント時に行う。
 */
export interface UseSavedTabsControllerInput {
  readonly deps: SavedTabsUseCasesDeps
  readonly useCases: SavedTabsUseCases
  readonly initialTabGroups?: readonly TabGroup[]
  readonly initialCustomProjects?: readonly CustomProject[]
}

/**
 * `useSavedTabsController` の戻り値。UI は view-model と操作関数だけを受け取る。
 */
export interface UseSavedTabsControllerReturn {
  readonly viewModel: SavedTabsViewModel
  readonly openSavedUrl: (
    input: OpenSavedUrlControllerInput,
  ) => Promise<OpenSavedUrlControllerResult>
  readonly deleteTabGroup: (
    input: DeleteTabGroupControllerInput,
  ) => Promise<DeleteTabGroupControllerResult>
  readonly restoreOpenedUrlsSnapshot: (
    input: RestoreSnapshotControllerInput,
  ) => Promise<RestoreSnapshotControllerResult>
  readonly syncCategoryAssignments: (
    input: SyncCategoryControllerInput,
  ) => Promise<SyncCategoryControllerResult>
  readonly removeUnreferencedUrlRecords: () => Promise<{
    readonly removedCount: number
  }>
  readonly refresh: () => Promise<void>
}

export interface OpenSavedUrlControllerInput {
  readonly urlRecordId: string
  readonly origin: 'click' | 'externalDrop'
  readonly settings: {
    readonly removeTabAfterOpen: boolean
    readonly removeTabAfterExternalDrop: boolean
  }
}

export interface OpenSavedUrlControllerResult {
  readonly openedUrl: string
  readonly removedUrlRecordId: string | null
}

export interface DeleteTabGroupControllerInput {
  readonly tabGroupId: string
}

export interface DeleteTabGroupControllerResult {
  readonly removedTabGroupId: string
  readonly removedUrlRecordIds: readonly string[]
}

export interface RestoreSnapshotControllerInput {
  readonly snapshot: {
    readonly savedTabs?: readonly TabGroup[]
    readonly urlRecords?: readonly {
      readonly id: string
      readonly url: string
      readonly title: string
      readonly savedAt: number
    }[]
    readonly customProjects?: readonly CustomProject[]
    readonly parentCategories?: readonly {
      readonly id: string
      readonly name: string
      readonly domains: readonly string[]
      readonly domainNames: readonly string[]
    }[]
  }
}

export interface RestoreSnapshotControllerResult {
  readonly restoredTabGroupCount: number
  readonly restoredUrlRecordCount: number
}

export interface SyncCategoryControllerInput {
  readonly command?: {
    readonly domain: string
    readonly parentCategoryId: string
  }
}

export interface SyncCategoryControllerResult {
  readonly assignedTabGroupCount: number
  readonly unassignedTabGroupCount: number
  readonly updatedCategoryCount: number
}

interface ControllerState {
  loading: boolean
  error: string | null
  tabGroups: readonly TabGroupViewModel[]
  customProjects: readonly CustomProjectViewModel[]
}

const toCustomProjectViewModelFromEntity = (
  project: CustomProject,
): CustomProjectViewModel =>
  toCustomProjectViewModel({
    categories: [...project.categories],
    createdAt: project.createdAt,
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    urlIds: [...project.urlIds],
  })

const toTabGroupViewModelFromEntity = (group: TabGroup): TabGroupViewModel =>
  toTabGroupViewModel({
    domain: group.domain,
    id: group.id,
    parentCategoryId: group.parentCategoryId,
    urlIds: [...group.urlIds],
  })

type BrandedString =
  | UrlRecordId
  | TabGroupId
  | DomainName
  | ParentCategoryId
  | SavedAt
  | Url

/**
 * branded ドメイン型へ安全側に倒してキャストする。
 *
 * presentation 層で受け取るのは `string` だが、use-case / command 層は
 * branded 値を要求する。presentation はドメイン層と独立した存在で
 * 値の検証は持たないため、`unknown` を経由した構造的キャストで受け渡す。
 * runtime で型チェックが壊れる経路は domain layer の factory で防護する。
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const castToBranded = <T extends BrandedString>(value: string): T =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  value as unknown as T

/**
 * presentation 層の中心 controller hook。
 *
 * 責務:
 * 1. repository から TabGroup / CustomProject を読み込み、view-model へ変換する。
 * 2. application use-case を呼び、結果を view-model へ反映する。
 * 3. loading / error 状態と、Undo 復元用の snapshot 保持を管理する。
 *
 * 非責務:
 * - `chrome.*` の直接呼び出し (composition 層の adapter / repository 経由)
 * - DOM 描画 (page / component 層)
 * - Sonner 等の特定通知 UI への直接依存 (NotificationPort 経由)
 */
export const useSavedTabsController = (
  input: UseSavedTabsControllerInput,
): UseSavedTabsControllerReturn => {
  const { deps, useCases, initialTabGroups, initialCustomProjects } = input
  const {
    openSavedUrl: openSavedUrlUseCase,
    deleteTabGroup: deleteTabGroupUseCase,
    restoreOpenedUrlsSnapshot: restoreOpenedUrlsSnapshotUseCase,
    syncCategoryAssignments: syncCategoryAssignmentsUseCase,
    removeUnreferencedUrlRecords: removeUnreferencedUrlRecordsUseCase,
  } = useCases
  const [state, setState] = useState<ControllerState>({
    customProjects:
      initialCustomProjects?.map(toCustomProjectViewModelFromEntity) ?? [],
    error: null,
    loading:
      initialTabGroups === undefined || initialCustomProjects === undefined,
    tabGroups: initialTabGroups?.map(toTabGroupViewModelFromEntity) ?? [],
  })
  const lastSnapshotRef = useRef<
    RestoreSnapshotControllerInput['snapshot'] | null
  >(null)

  const setError = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, error: message }))
  }, [])

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const [allTabGroups, allCustomProjects] = await Promise.all([
        deps.tabGroupRepository.findAll(),
        deps.customProjectRepository.findAll(),
      ])
      setState({
        customProjects: allCustomProjects.map(
          toCustomProjectViewModelFromEntity,
        ),
        error: null,
        loading: false,
        tabGroups: allTabGroups.map(toTabGroupViewModelFromEntity),
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [deps.customProjectRepository, deps.tabGroupRepository, setError])

  const openSavedUrl = useCallback(
    async (openInput: OpenSavedUrlControllerInput) => {
      try {
        const dto = await openSavedUrlUseCase({
          origin: openInput.origin,
          settings: openInput.settings,
          urlRecordId: castToBranded<UrlRecordId>(openInput.urlRecordId),
        })
        if (dto.snapshot) {
          lastSnapshotRef.current = {
            customProjects: dto.snapshot.customProjects
              ? [...dto.snapshot.customProjects]
              : undefined,
            parentCategories: dto.snapshot.parentCategories
              ? dto.snapshot.parentCategories.map((category) => ({
                  domainNames: [...category.domainNames],
                  domains: [...category.domains],
                  id: category.id,
                  name: category.name,
                }))
              : undefined,
            savedTabs: dto.snapshot.savedTabs
              ? [...dto.snapshot.savedTabs]
              : undefined,
            urlRecords: dto.snapshot.urlRecords
              ? dto.snapshot.urlRecords.map((record) => ({
                  id: record.id,
                  savedAt: record.savedAt,
                  title: record.title,
                  url: record.url,
                }))
              : undefined,
          }
        }
        await refresh()
        return {
          openedUrl: dto.openedUrl,
          removedUrlRecordId: dto.removedUrlRecordId,
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    [refresh, setError, openSavedUrlUseCase],
  )

  const deleteTabGroup = useCallback(
    async (deleteInput: DeleteTabGroupControllerInput) => {
      try {
        const dto = await deleteTabGroupUseCase({
          tabGroupId: castToBranded<TabGroupId>(deleteInput.tabGroupId),
        })
        if (dto.snapshot) {
          lastSnapshotRef.current = {
            customProjects: dto.snapshot.customProjects
              ? [...dto.snapshot.customProjects]
              : undefined,
            parentCategories: dto.snapshot.parentCategories
              ? dto.snapshot.parentCategories.map((category) => ({
                  domainNames: [...category.domainNames],
                  domains: [...category.domains],
                  id: category.id,
                  name: category.name,
                }))
              : undefined,
            savedTabs: dto.snapshot.savedTabs
              ? [...dto.snapshot.savedTabs]
              : undefined,
            urlRecords: dto.snapshot.urlRecords
              ? dto.snapshot.urlRecords.map((record) => ({
                  id: record.id,
                  savedAt: record.savedAt,
                  title: record.title,
                  url: record.url,
                }))
              : undefined,
          }
        }
        await refresh()
        return {
          removedTabGroupId: dto.removedTabGroupId,
          removedUrlRecordIds: [...dto.removedUrlRecordIds],
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    [refresh, setError, deleteTabGroupUseCase],
  )

  const restoreOpenedUrlsSnapshot = useCallback(
    async (restoreInput: RestoreSnapshotControllerInput) => {
      const snapshot = restoreInput.snapshot
      try {
        const dto = await restoreOpenedUrlsSnapshotUseCase({
          snapshot: {
            ...(snapshot.customProjects
              ? { customProjects: snapshot.customProjects }
              : {}),
            ...(snapshot.parentCategories
              ? {
                  parentCategories: snapshot.parentCategories.map(
                    (category) => ({
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                      domainNames: [
                        ...category.domainNames,
                      ] as unknown as readonly DomainName[],
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                      domains: [
                        ...category.domains,
                      ] as unknown as readonly TabGroupId[],
                      id: castToBranded<ParentCategoryId>(category.id),
                      name: castToBranded<never>(category.name),
                    }),
                  ),
                }
              : {}),
            ...(snapshot.savedTabs ? { savedTabs: snapshot.savedTabs } : {}),
            ...(snapshot.urlRecords
              ? {
                  urlRecords: snapshot.urlRecords.map((record) => ({
                    id: castToBranded<UrlRecordId>(record.id),
                    savedAt: castToBranded<SavedAt>(String(record.savedAt)),
                    title: record.title,
                    url: castToBranded<Url>(record.url),
                  })),
                }
              : {}),
          },
        })
        lastSnapshotRef.current = null
        await refresh()
        return {
          restoredTabGroupCount: dto.restoredTabGroups.length,
          restoredUrlRecordCount: dto.restoredUrlRecords.length,
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    [refresh, setError, restoreOpenedUrlsSnapshotUseCase],
  )

  const syncCategoryAssignments = useCallback(
    async (syncInput: SyncCategoryControllerInput) => {
      try {
        const dto = await syncCategoryAssignmentsUseCase(
          syncInput.command
            ? {
                command: {
                  domain: castToBranded<DomainName>(syncInput.command.domain),
                  parentCategoryId: castToBranded<ParentCategoryId>(
                    syncInput.command.parentCategoryId,
                  ),
                },
              }
            : // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              ({} as never),
        )
        await refresh()
        return {
          assignedTabGroupCount: dto.assignedTabGroupIds.length,
          unassignedTabGroupCount: dto.unassignedTabGroupIds.length,
          updatedCategoryCount: dto.updatedCategoryIds.length,
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    [refresh, setError, syncCategoryAssignmentsUseCase],
  )

  const removeUnreferencedUrlRecords = useCallback(async () => {
    try {
      const dto = await removeUnreferencedUrlRecordsUseCase()
      await refresh()
      return { removedCount: dto.removedCount }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }, [refresh, setError, removeUnreferencedUrlRecordsUseCase])

  const viewModel = useMemo<SavedTabsViewModel>(() => {
    if (
      state.loading &&
      state.tabGroups.length === 0 &&
      state.customProjects.length === 0
    ) {
      return createEmptySavedTabsViewModel()
    }
    return createSavedTabsViewModel({
      customProjects: state.customProjects,
      error: state.error,
      loading: state.loading,
      tabGroups: state.tabGroups,
    })
  }, [state.customProjects, state.error, state.loading, state.tabGroups])

  return {
    deleteTabGroup,
    openSavedUrl,
    refresh,
    removeUnreferencedUrlRecords,
    restoreOpenedUrlsSnapshot,
    syncCategoryAssignments,
    viewModel,
  }
}
