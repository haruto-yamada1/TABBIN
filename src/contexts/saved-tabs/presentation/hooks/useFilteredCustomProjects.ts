import { useEffect, useMemo, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createCustomProjectSearch } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import { toCustomProjectFromViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { logger } from '@/lib/logging/logger'

const SEARCH_DEBOUNCE_MS = 32

export const useFilteredCustomProjects = (
  savedTabsUseCases: Pick<SavedTabsUseCases, 'getProjectSearchUrls'>,
  customProjects: CustomProject[],
  searchQuery: string,
  storageRevision = 0,
): CustomProject[] => {
  const query = searchQuery.trim()
  const isSearching = query !== ''
  // Storage sync and local writes replace the displayed project array. Keep
  // just one index for that projection while searching in Custom mode.
  const { search, source } = useMemo(
    () => ({
      search: isSearching
        ? createCustomProjectSearch(customProjects, async (projects) =>
            savedTabsUseCases.getProjectSearchUrls(
              projects.map(toCustomProjectFromViewModel),
            ),
          )
        : null,
      source: { storageRevision },
    }),
    [customProjects, isSearching, savedTabsUseCases, storageRevision],
  )
  // A → B → A gets a new request. This token cannot retain a retired index.
  const request = useMemo(() => ({ source, query }), [source, query])
  const [filtered, setFiltered] = useState<{
    request: typeof request
    projects: CustomProject[]
  } | null>(null)

  useEffect(() => {
    if (!search) {
      return undefined
    }
    const controller = new AbortController()
    const runSearch = async () => {
      try {
        const projects = await search(query, controller.signal)
        if (!controller.signal.aborted) {
          setFiltered({ request, projects })
        }
      } catch {
        if (!controller.signal.aborted) {
          logger.error('saved_tabs_custom_search_failed', {})
        }
      }
    }
    const timer = setTimeout(() => {
      void runSearch()
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, query, request])

  if (!isSearching) {
    return customProjects
  }
  return filtered?.request === request ? filtered.projects : []
}
