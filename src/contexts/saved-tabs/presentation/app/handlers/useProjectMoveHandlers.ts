import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { moveCustomProjectUrlAndSyncState } from '@/contexts/saved-tabs/presentation/lib/custom-project-move'
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
        await moveCustomProjectUrlAndSyncState({
          // application query `getCustomProjects` は
          // domain entity `CustomProject` を返すが、state 同期先で
          // 必要なのは storage 形 (`@/types/storage` の `CustomProject`)
          // のため、mapper 経由で projection する。
          getCustomProjects: async () => {
            const projects = await savedTabsUseCases.getCustomProjects()
            return projects.map((project) => ({
              categories: [...project.categories],
              createdAt: project.createdAt,
              // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion -- domain CustomProjectId と storage 側の string 差 (issue #511 と同系統)
              id: project.id,
              name: project.name,
              updatedAt: project.updatedAt,
              ...((project.urlIds ?? []).length > 0
                ? // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion -- domain UrlRecordId と storage 側の string 差 (issue #511 と同系統)
                  { urlIds: [...(project.urlIds ?? [])] }
                : {}),
            }))
          },
          moveUrlBetweenCustomProjects:
            savedTabsUseCases.moveUrlBetweenCustomProjects,
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
    [savedTabsUseCases, setCustomProjects, t],
  )

  return { handleMoveUrlBetweenProjects }
}
