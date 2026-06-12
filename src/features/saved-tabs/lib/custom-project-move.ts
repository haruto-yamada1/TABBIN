import type { Dispatch, SetStateAction } from 'react'

import type { CustomProject } from '@/types/storage'

interface MoveCustomProjectUrlAndSyncStateParams {
  sourceProjectId: string
  targetProjectId: string
  url: string
  moveUrlBetweenCustomProjects: (
    sourceProjectId: string,
    targetProjectId: string,
    url: string,
  ) => Promise<void>
  getCustomProjects: () => Promise<CustomProject[]>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
}

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

  await moveUrlBetweenCustomProjects(sourceProjectId, targetProjectId, url)
  const updatedProjects = await getCustomProjects()
  setCustomProjects(updatedProjects)
}
