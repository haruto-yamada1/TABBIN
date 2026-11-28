import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { UNDO_TOAST_DURATION_MS } from '@/components/ui/undo-toast'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { GetCustomProjectRawsQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectRawsQuery'
import type { CustomProjectUndoSnapshot } from '@/contexts/saved-tabs/application/queries/GetCustomProjectUndoSnapshotQuery'
import type {
  RestoreCustomProjectsSnapshotPayload,
  RestoreCustomProjectsSnapshotUseCase,
} from '@/contexts/saved-tabs/application/use-cases/RestoreCustomProjectsSnapshotUseCase'
import type {
  RestoredSnapshotViewDto,
  RestoreOpenedUrlsSnapshotViewUseCase,
} from '@/contexts/saved-tabs/application/use-cases/RestoreOpenedUrlsSnapshotViewUseCase'
import { resolveUndoMessageKey } from '@/contexts/saved-tabs/presentation/lib/undo-message'
import {
  toSavedTabsCustomProjectViewModel,
  toSavedTabsTabGroupViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import { toStorageCustomProjectFromRaw } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsSnapshotViewMapper'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

/**
 * `SavedTabsUndoNotificationService` 群が共通で必要とする presenter 依存。
 *
 * presentation helper (`savedTabsApp.helpers.ts`) から undo 通知
 * ロジックを service へ切り出した (issue #512)。
 * UI state 反映 (`setCategories` / `setCustomProjects`) と
 * `refreshTabGroupsWithUrls` への委譲は呼び出し元から注入する。
 */
type UndoNotificationContext = {
  readonly refreshTabGroupsWithUrls: (
    nextGroups?: TabGroup[],
  ) => Promise<TabGroup[] | undefined> | TabGroup[] | undefined
  readonly savedTabsUseCases: SavedTabsUseCases
  readonly setCategories?: Dispatch<ParentCategory[]>
  readonly setCustomProjects: Dispatch<CustomProject[]>
}

/**
 * `showOpenedUrlsUndoToast` 用のオプション。
 *
 * Undo クリック時に復元する snapshot を受け取り、復元が成功したら
 * 復元後の payload (storage 形配列) を `setCustomProjects` /
 * `setCategories` / `refreshTabGroupsWithUrls` へ反映する。
 */
type ShowOpenedUrlsUndoToastParams = UndoNotificationContext & {
  readonly count: number
  readonly messageKey?: string
  readonly snapshot: OpenedUrlsRestoreSnapshot
  readonly t: (
    key: string,
    fallback?: string,
    values?: Record<string, string>,
  ) => string
}

/**
 * Undo トーストを表示する。
 *
 * 旧 `savedTabsApp.helpers.ts` の `showOpenedUrlsUndoToast` を
 * presentation service へ移設 (issue #512)。
 *
 * - 復元本体は `RestoreOpenedUrlsSnapshotViewUseCase` (mapper 経由 view use-case) に
 *   委譲し、presentation 層は `chrome.storage.local.set` を直接呼ばない。
 * - 復元後の storage 形 payload は view use-case の戻り値として受け取り、
 *   `setCustomProjects` / `setCategories` / `refreshTabGroupsWithUrls` へ
 *   そのまま反映する。
 */
const showOpenedUrlsUndoToast = ({
  count,
  messageKey = 'savedTabs.undo.removedAfterOpen',
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  setCategories,
  setCustomProjects,
  snapshot,
  t,
}: ShowOpenedUrlsUndoToastParams): void => {
  const restoreView: RestoreOpenedUrlsSnapshotViewUseCase =
    savedTabsUseCases.restoreOpenedUrlsSnapshotView
  let restoring = false
  let restored = false
  toast.info(
    t(resolveUndoMessageKey(messageKey, count), undefined, {
      count: String(count),
    }),
    {
      description: t('savedTabs.undo.availabilityNote'),
      action: {
        label: t('common.undo'),
        // eslint-disable-next-line typescript/no-misused-promises
        onClick: async () => {
          if (restoring || restored) {
            return
          }
          restoring = true
          try {
            const view: RestoredSnapshotViewDto = await restoreView({
              snapshot,
            })
            restored = true
            if (view.customProjects) {
              setCustomProjects(
                view.customProjects.map(toSavedTabsCustomProjectViewModel),
              )
            }
            if (view.parentCategories && setCategories) {
              setCategories([...view.parentCategories])
            }
            await refreshTabGroupsWithUrls(
              view.savedTabs.map(toSavedTabsTabGroupViewModel),
            )
            toast.success(t('savedTabs.undo.restored'))
          } catch (error) {
            console.error('開いた後に削除したURLの復元に失敗しました:', error)
            toast.error(t('savedTabs.undo.restoreError'))
          } finally {
            restoring = false
          }
        },
      },
    },
  )
}

type NotifyDeleteFailureParams = UndoNotificationContext & {
  readonly snapshot: OpenedUrlsRestoreSnapshot | undefined
  readonly t: (key: string, fallback?: string) => string
}

/**
 * 削除失敗時の Undo 復元とエラー通知を行う。
 *
 * 旧 `savedTabsApp.helpers.ts` の `notifyDeleteFailure` を
 * presentation service へ移設 (issue #512)。
 *
 * 1. `snapshot` があれば `RestoreOpenedUrlsSnapshotViewUseCase` 経由で復元。
 * 2. 復元後 payload を `setCustomProjects` / `setCategories` /
 *    `refreshTabGroupsWithUrls` へ反映。
 * 3. 復元で例外が出てもトースト通知は必ず行う。
 */
const notifyDeleteFailure = async ({
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  setCategories,
  setCustomProjects,
  snapshot,
  t,
}: NotifyDeleteFailureParams): Promise<void> => {
  if (snapshot) {
    try {
      const restored: RestoredSnapshotViewDto =
        await savedTabsUseCases.restoreOpenedUrlsSnapshotView({ snapshot })
      if (restored.customProjects) {
        setCustomProjects(
          restored.customProjects.map(toSavedTabsCustomProjectViewModel),
        )
      }
      if (restored.parentCategories && setCategories) {
        setCategories([...restored.parentCategories])
      }
      await refreshTabGroupsWithUrls(
        restored.savedTabs.map(toSavedTabsTabGroupViewModel),
      )
    } catch (restoreError) {
      console.error('削除失敗後の保存データ復元に失敗しました:', restoreError)
    }
  }

  toast.error(t('savedTabs.deleteError'))
}

const getArraySnapshot = <T>(
  value: readonly T[] | undefined,
): readonly T[] | undefined => (Array.isArray(value) ? value : undefined)

/**
 * `getCustomProjectRawsQuery` 戻り値の要素 shape (issue #538)。
 *
 * `CustomProjectRepository.findAllRaw()` 由来の `CustomProjectRawSnapshot`
 * を domain repository モジュールから直接 import するのを避け、
 * `GetCustomProjectRawsQuery` 戻り値から派生させたローカル alias を
 * 使う。presentation 層が `CustomProjectRepository` 型を import しない
 * ことを保証する目的 (issue 受け入れ条件)。
 */
type RawCustomProjectEntry = Awaited<
  ReturnType<GetCustomProjectRawsQuery>
>[number]

/** rich フィールド込みの `CustomProject` へ raw snapshot を投影する */
const toRawStorageCustomProject = (raw: RawCustomProjectEntry): CustomProject =>
  toStorageCustomProjectFromRaw(raw)

const createCustomProjectUndoPayload = (
  snapshot: CustomProjectUndoSnapshot,
): RestoreCustomProjectsSnapshotPayload | null => {
  const customProjects = getArraySnapshot(snapshot.customProjects)
  if (!customProjects) {
    return null
  }

  const customProjectOrder = getArraySnapshot(snapshot.customProjectOrder)
  const customProjectsRaw = getArraySnapshot(snapshot.customProjectsRaw)
  return {
    ...(customProjectOrder ? { customProjectOrder } : {}),
    customProjects,
    ...(customProjectsRaw ? { customProjectsRaw } : {}),
    ...(snapshot.openedUrlsSnapshot
      ? { openedUrlsSnapshot: snapshot.openedUrlsSnapshot }
      : {}),
    ...(snapshot.urlRecordsRaw
      ? { urlRecordsRaw: snapshot.urlRecordsRaw }
      : {}),
  }
}

const showCustomProjectDeleteUndoToast = ({
  count,
  getCustomProjectRawsQuery,
  restoreCustomProjectsSnapshotUseCase,
  setCustomProjects,
  snapshot,
  t,
}: {
  count: number
  getCustomProjectRawsQuery: GetCustomProjectRawsQuery
  restoreCustomProjectsSnapshotUseCase: RestoreCustomProjectsSnapshotUseCase
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  snapshot: CustomProjectUndoSnapshot
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  toast.info(
    t(resolveUndoMessageKey('savedTabs.undo.deletedTabs', count), undefined, {
      count: String(count),
    }),
    {
      description: t('savedTabs.undo.availabilityNote'),
      duration: UNDO_TOAST_DURATION_MS,
      action: {
        label: t('common.undo'),
        // eslint-disable-next-line typescript/no-misused-promises
        onClick: async () => {
          try {
            const payload = createCustomProjectUndoPayload(snapshot)
            if (!payload) {
              return
            }

            // 削除した URL の `urls` / `urlMetadata` / `projectKeywords` のような
            // domain entity 化されない rich フィールドを保持するため、payload に
            // raw snapshot があれば `restoreCustomProjectsSnapshotUseCase` 内で
            // `restoreAllRaw` 経路 (rich 保持) が走り、無ければ entity 経由
            // `saveAll` へフォールバックする (issue #535 P1 / PR #506 review
            // P2 対応の責務を application 層へ移設)。
            await restoreCustomProjectsSnapshotUseCase({ payload })
            if (payload.openedUrlsSnapshot) {
              const currentProjects = await getCustomProjectRawsQuery()
              setCustomProjects(currentProjects.map(toRawStorageCustomProject))
            } else {
              setCustomProjects(
                payload.customProjectsRaw
                  ? payload.customProjectsRaw.map(toRawStorageCustomProject)
                  : payload.customProjects.map(
                      toSavedTabsCustomProjectViewModel,
                    ),
              )
            }
            toast.success(t('savedTabs.undo.restored'))
          } catch (error) {
            console.error(
              'カスタムプロジェクトURL削除の復元に失敗しました:',
              error,
            )
            toast.error(t('savedTabs.undo.restoreError'))
          }
        },
      },
    },
  )
}

export {
  notifyDeleteFailure,
  showOpenedUrlsUndoToast,
  showCustomProjectDeleteUndoToast,
  toRawStorageCustomProject,
  type NotifyDeleteFailureParams,
  type ShowOpenedUrlsUndoToastParams,
}
