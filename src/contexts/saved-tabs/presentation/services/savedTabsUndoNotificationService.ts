import type { Dispatch } from 'react'
import { toast } from 'sonner'

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type {
  RestoredSnapshotViewDto,
  RestoreOpenedUrlsSnapshotViewUseCase,
} from '@/contexts/saved-tabs/application/use-cases/RestoreOpenedUrlsSnapshotViewUseCase'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'
import type { CustomProject, ParentCategory, TabGroup } from '@/types/storage'

/**
 * `SavedTabsUndoNotificationService` 群が共通で必要とする presenter 依存。
 *
 * presentation helper (`savedTabsApp.helpers.ts`) から undo 通知
 * ロジックを service へ切り出した (issue #512)。
 * UI state 反映 (`setCategories` / `setCustomProjects`) と
 * `refreshTabGroupsWithUrls` への委譲は呼び出し元から注入する。
 */
interface UndoNotificationContext {
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
interface ShowOpenedUrlsUndoToastParams extends UndoNotificationContext {
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
  toast.info(t(messageKey, undefined, { count: String(count) }), {
    action: {
      label: t('common.undo'),
      // eslint-disable-next-line typescript/no-misused-promises
      onClick: async () => {
        try {
          const restored: RestoredSnapshotViewDto = await restoreView({
            snapshot,
          })
          if (restored.customProjects) {
            setCustomProjects([...restored.customProjects])
          }
          if (restored.parentCategories && setCategories) {
            setCategories([...restored.parentCategories])
          }
          await refreshTabGroupsWithUrls([...restored.savedTabs])
          toast.success(t('savedTabs.undo.restored'))
        } catch (error) {
          console.error('開いた後に削除したURLの復元に失敗しました:', error)
          toast.error(t('savedTabs.undo.restoreError'))
        }
      },
    },
  })
}

interface NotifyDeleteFailureParams extends UndoNotificationContext {
  readonly snapshot?: OpenedUrlsRestoreSnapshot
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
        setCustomProjects([...restored.customProjects])
      }
      if (restored.parentCategories && setCategories) {
        setCategories([...restored.parentCategories])
      }
      await refreshTabGroupsWithUrls([...restored.savedTabs])
    } catch (restoreError) {
      console.error('削除失敗後の保存データ復元に失敗しました:', restoreError)
    }
  }

  toast.error(t('savedTabs.deleteError'))
}

export {
  notifyDeleteFailure,
  showOpenedUrlsUndoToast,
  type NotifyDeleteFailureParams,
  type ShowOpenedUrlsUndoToastParams,
}
