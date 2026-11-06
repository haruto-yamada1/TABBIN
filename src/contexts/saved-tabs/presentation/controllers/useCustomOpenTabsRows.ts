import { useEffect, useMemo, useState } from 'react'

import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { useOpenSavedUrls } from '@/contexts/saved-tabs/presentation/controllers/useOpenSavedUrls'
import type { OpenTabsRow } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import { buildOpenTabsRows } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import { toCustomProjectFromViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const EMPTY_OPEN_TABS_ROWS: readonly OpenTabsRow[] = []

/**
 * custom モードの「今開いているタブ」行。
 *
 * custom モードの初期ロード経路 (`getCustomProjects` entity 経由) では
 * `urls` が保持されないため、domain モードと同じ `buildOpenTabsRows` を
 * 併用するには各プロジェクトの URL を都度読む必要がある。カード
 * (`useCustomProjectCard`) と同じ `getProjectUrlsUseCase` を使い、
 * `projects` 参照変更時に併せて読み直す。
 *
 * 検索入力中は domain モードと同様に行の部分的なすり抜けを避けるため
 * 空配列を返す。
 */
export const useCustomOpenTabsRows = ({
  enabled = true,
  getProjectUrlsUseCase,
  projects,
  searchQuery,
}: {
  enabled?: boolean
  getProjectUrlsUseCase: GetProjectUrlsUseCase
  projects: readonly CustomProject[]
  searchQuery: string
}): readonly OpenTabsRow[] => {
  const remoteOpenUrls = useOpenSavedUrls()
  const [projectsWithUrls, setProjectsWithUrls] = useState<
    readonly CustomProject[]
  >([])

  useEffect(() => {
    if (!enabled) {
      return () => {}
    }
    let isCancelled = false
    const run = async () => {
      const nextProjects = await Promise.all(
        projects.map(async (project) => {
          if (project.urls !== undefined) {
            return project
          }
          try {
            const urls = await getProjectUrlsUseCase(
              toCustomProjectFromViewModel(project),
            )
            return { ...project, urls }
          } catch (error) {
            console.error('プロジェクトURLの取得エラー:', error)
            return project
          }
        }),
      )
      if (!isCancelled) {
        setProjectsWithUrls(nextProjects)
      }
    }
    void run()
    return () => {
      isCancelled = true
    }
  }, [enabled, getProjectUrlsUseCase, projects])

  return useMemo((): readonly OpenTabsRow[] => {
    if (!enabled || searchQuery.trim().length > 0) {
      return EMPTY_OPEN_TABS_ROWS
    }
    return buildOpenTabsRows(projectsWithUrls, remoteOpenUrls)
  }, [enabled, searchQuery, projectsWithUrls, remoteOpenUrls])
}
