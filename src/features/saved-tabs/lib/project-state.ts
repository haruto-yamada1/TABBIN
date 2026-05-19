import { produce } from 'immer'

import type { CustomProject } from '@/types/storage'

type ProjectUrl = NonNullable<CustomProject['urls']>[number]

interface MoveUrlBetweenProjectsStateParams {
  projects: CustomProject[]
  sourceProjectId: string
  targetProjectId: string
  url: Omit<ProjectUrl, 'savedAt'> & { savedAt?: number }
  movedAt?: number
}

/**
 * プロジェクト間URL移動のローカル状態更新を不変に行う
 */
export const moveUrlBetweenProjectsState = ({
  projects,
  sourceProjectId,
  targetProjectId,
  url,
  movedAt = Date.now(),
}: MoveUrlBetweenProjectsStateParams): CustomProject[] =>
  produce(projects, (draft) => {
    for (const project of draft) {
      if (project.id === sourceProjectId) {
        project.urls = (project.urls || []).filter(
          (item) => item.url !== url.url,
        )
        project.updatedAt = movedAt
        continue
      }

      if (project.id === targetProjectId) {
        if (!project.urls) {
          project.urls = []
        }
        project.urls.push({
          ...url,
          savedAt: movedAt,
        })
        project.updatedAt = movedAt
      }
    }
  })
