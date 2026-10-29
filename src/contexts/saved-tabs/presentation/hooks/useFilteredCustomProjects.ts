import { useCallback, useEffect, useMemo, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { filterCustomProjectsByQuery } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import { toCustomProjectFromViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

/**
 * 現在の検索語・プロジェクト・URL reader に対応する完了済み結果だけを公開する。
 * 空検索は元の配列を即座に返し、URL の読み取りを行わない。
 */
export const useFilteredCustomProjects = (
  savedTabsUseCases: Pick<SavedTabsUseCases, 'getProjectUrls'>,
  customProjects: CustomProject[],
  searchQuery: string,
): CustomProject[] => {
  const loadProjectUrls = useCallback(
    async (project: CustomProject) =>
      savedTabsUseCases.getProjectUrls(toCustomProjectFromViewModel(project)),
    [savedTabsUseCases],
  )

  // A new token also distinguishes A → empty → A, so switching modes never
  // exposes a previous generation while fresh URL reads are pending.
  const input = useMemo(
    () => ({ customProjects, loadProjectUrls, searchQuery }),
    [customProjects, loadProjectUrls, searchQuery],
  )
  const [filtered, setFiltered] = useState<{
    input: typeof input
    projects: CustomProject[]
  } | null>(null)

  useEffect(() => {
    let isCancelled = false

    const syncFilteredCustomProjects = async () => {
      const nextProjects = await filterCustomProjectsByQuery(input)

      if (!isCancelled) {
        setFiltered({ input, projects: nextProjects })
      }
    }

    void syncFilteredCustomProjects()

    return () => {
      isCancelled = true
    }
  }, [input])

  if (!searchQuery.trim()) {
    return customProjects
  }
  return filtered?.input === input ? filtered.projects : []
}
