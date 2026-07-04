import type { Dispatch, SetStateAction } from 'react'

import type { MoveUrlBetweenCustomProjectsCommand } from '@/contexts/saved-tabs/application/commands/MoveUrlBetweenCustomProjectsCommand'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { MoveUrlBetweenCustomProjectsUseCase } from '@/contexts/saved-tabs/application/use-cases/MoveUrlBetweenCustomProjectsUseCase'

interface MoveCustomProjectUrlAndSyncStateParams {
  sourceProjectId: string
  targetProjectId: string
  url: string
  moveUrlBetweenCustomProjects: MoveUrlBetweenCustomProjectsUseCase
  getCustomProjects: () => Promise<readonly CustomProject[]>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
}

const buildMoveCommand = (
  sourceProjectId: string,
  targetProjectId: string,
  url: string,
): MoveUrlBetweenCustomProjectsCommand => ({
  sourceProjectId,
  targetProjectId,
  url,
})

export const moveCustomProjectUrlAndSyncState = async ({
  sourceProjectId,
  targetProjectId,
  url,
  moveUrlBetweenCustomProjects,
  getCustomProjects,
  setCustomProjects,
}: MoveCustomProjectUrlAndSyncStateParams): Promise<void> => {
  if (sourceProjectId === targetProjectId) {
    return
  }

  await moveUrlBetweenCustomProjects(
    buildMoveCommand(sourceProjectId, targetProjectId, url),
  )
  // application query `getCustomProjects` は
  // `readonly CustomProject[]` を返す。`setCustomProjects` 側の
  // シグネチャは `CustomProject[]` だが、`Dispatch<SetStateAction<T>>` は
  // 構造的部分型により `readonly` 要素を許容するためそのまま渡せる。
  const updatedProjects = await getCustomProjects()
  setCustomProjects([...updatedProjects])
}
