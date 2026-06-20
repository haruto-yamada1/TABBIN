import { useCallback, useEffect, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { filterCustomProjectsByQuery } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import type { CustomProject } from '@/types/storage'

/**
 * `customProjects` / `searchQuery` 変更時に `savedTabsUseCases.getProjectUrls` を
 * 参照しつつ filter する副作用を、effect のクロージャから外側の custom hook に
 * 切り出した版。
 *
 * 元の effect は `savedTabsUseCases.getProjectUrls` を deps 配列に入れずに
 * `// react-doctor/exhaustive-deps` の disable で握りつぶしていたが、
 * `useCallback` で `getProjectUrls` を stable な reference として束ね、
 * effect の deps には callback だけを置けば disable 不要になる。
 */
export const useFilteredCustomProjects = (
  savedTabsUseCases: SavedTabsUseCases,
  customProjects: CustomProject[],
  searchQuery: string,
): CustomProject[] => {
  const [filteredCustomProjects, setFilteredCustomProjects] = useState<
    CustomProject[]
  >([])

  const loadProjectUrls = useCallback(
    async (project: CustomProject) => savedTabsUseCases.getProjectUrls(project),
    [savedTabsUseCases],
  )

  useEffect(() => {
    let isCancelled = false

    const syncFilteredCustomProjects = async () => {
      const nextProjects = await filterCustomProjectsByQuery({
        customProjects,
        loadProjectUrls,
        searchQuery,
      })

      if (!isCancelled) {
        setFilteredCustomProjects(nextProjects)
      }
    }

    void syncFilteredCustomProjects()

    return () => {
      isCancelled = true
    }
  }, [customProjects, searchQuery, loadProjectUrls])

  return filteredCustomProjects
}
