import { useEffect, useMemo, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createCustomProjectSearch } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import { toCustomProjectFromViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { logger } from '@/lib/logging/logger'

const SEARCH_DEBOUNCE_MS = 32

export type FilteredCustomProjects = {
  /** 現在の入力に対応する絞り込み結果。未確定の間は空配列。 */
  projects: CustomProject[]
  /**
   * 現在の検索語に対する絞り込みが確定しているか。
   * 未確定の間は結果が 0 件でも「該当なし」と判断してはならない。
   */
  isSettled: boolean
}

const UNSETTLED_PROJECTS: FilteredCustomProjects = {
  projects: [],
  isSettled: false,
}

/**
 * 現在の検索語・プロジェクト・storage revision に対応する完了済み結果だけを公開する。
 * 空検索は元の配列を即座に返し、索引の読み取りを行わない。
 * 絞り込みが未確定の間は `isSettled: false` を返し、呼び出し側が
 * 一時的な空配列を確定した 0 件と誤認しないようにする。
 */
export const useFilteredCustomProjects = (
  savedTabsUseCases: Pick<SavedTabsUseCases, 'getProjectSearchUrls'>,
  customProjects: CustomProject[],
  searchQuery: string,
  storageRevision = 0,
): FilteredCustomProjects => {
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
    return { projects: customProjects, isSettled: true }
  }
  return filtered?.request === request
    ? { projects: filtered.projects, isSettled: true }
    : UNSETTLED_PROJECTS
}
