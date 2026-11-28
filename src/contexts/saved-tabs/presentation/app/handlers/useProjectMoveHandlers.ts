import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import { showUndoToast } from '@/components/ui/undo-toast'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { moveCustomProjectUrlAndSyncState } from '@/contexts/saved-tabs/presentation/lib/custom-project-move'
import { toSavedTabsCustomProjectViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'
import { redactUrlForLog } from '@/lib/logging/redact-url'

type UseProjectMoveHandlersDeps = {
  savedTabsUseCases: SavedTabsUseCases
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  t: TranslateFn
}

export const useProjectMoveHandlers = ({
  savedTabsUseCases,
  setCustomProjects,
  t,
}: UseProjectMoveHandlersDeps) => {
  // カスタムプロジェクト間でURLを移動するハンドラ
  // issue #540: `customProjectRepository` /
  // `customProjectsCommandService` 直叩きを撤去し、
  // `getCustomProjects` query (読み取り) と
  // `moveUrlBetweenCustomProjects` use-case (更新) 経由で
  // 移動と state 同期を行う。`SavedTabsApp` は port / repository
  // モジュールを import しない構成に統一する。
  const handleMoveUrlBetweenProjects = useCallback(
    async (sourceProjectId: string, targetProjectId: string, url: string) => {
      try {
        console.log(
          `URL移動: ${sourceProjectId} → ${targetProjectId}, URL: ${redactUrlForLog(url)}`,
        )
        const getCustomProjects = async () => {
          const projects = await savedTabsUseCases.getCustomProjects()
          return projects.map(toSavedTabsCustomProjectViewModel)
        }
        await moveCustomProjectUrlAndSyncState({
          getCustomProjects,
          moveUrlBetweenCustomProjects:
            savedTabsUseCases.moveUrlBetweenCustomProjects,
          onMoved: (undo) => {
            const message = t('savedTabs.tab.movedBetweenProjects')
            if (!undo) {
              toast.success(message)
              return
            }
            showUndoToast({
              message,
              t,
              undo,
              onUndone: async () => {
                setCustomProjects(await getCustomProjects())
              },
            })
          },
          setCustomProjects,
          sourceProjectId,
          targetProjectId,
          url,
        })
        return null
      } catch (error) {
        console.error('URL移動エラー:', error)
        toast.error(t('savedTabs.tab.moveBetweenProjectsError'))
        return null
      }
    },
    [savedTabsUseCases, setCustomProjects, t],
  )

  return { handleMoveUrlBetweenProjects }
}
