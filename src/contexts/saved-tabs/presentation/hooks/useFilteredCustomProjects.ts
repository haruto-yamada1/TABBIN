import { useCallback, useEffect, useMemo, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { filterCustomProjectsByQuery } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import { toCustomProjectFromViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

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
 * 現在の検索語・プロジェクト・URL reader に対応する完了済み結果だけを公開する。
 * 空検索は元の配列を即座に返し、URL の読み取りを行わない。
 * 絞り込みが未確定の間は `isSettled: false` を返し、呼び出し側が
 * 一時的な空配列を確定した 0 件と誤認しないようにする。
 */
export const useFilteredCustomProjects = (
  savedTabsUseCases: Pick<SavedTabsUseCases, 'getProjectUrls'>,
  customProjects: CustomProject[],
  searchQuery: string,
): FilteredCustomProjects => {
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
    return { projects: customProjects, isSettled: true }
  }
  return filtered?.input === input
    ? { projects: filtered.projects, isSettled: true }
    : UNSETTLED_PROJECTS
}
