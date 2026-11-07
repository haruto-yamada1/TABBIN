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
 * 非表示・検索入力中は追加読み取りと open URL の購読を止める。
 * 取得結果は要求に紐づけ、入力変更直後から古い行を表示しない。
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
  const isActive = enabled && searchQuery.trim().length === 0
  const remoteOpenUrls = useOpenSavedUrls(isActive)
  const request = useMemo(
    () => ({ isActive, getProjectUrlsUseCase, projects }),
    [isActive, getProjectUrlsUseCase, projects],
  )
  const [snapshot, setSnapshot] = useState<{
    request: typeof request
    projectsWithUrls: readonly CustomProject[]
  }>()

  useEffect(() => {
    if (!request.isActive) {
      return () => {}
    }
    let isCancelled = false
    const run = async () => {
      const nextProjects = await Promise.all(
        request.projects.map(async (project) => {
          if (project.urls !== undefined) {
            return project
          }
          try {
            const urls = await request.getProjectUrlsUseCase(
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
        setSnapshot({ request, projectsWithUrls: nextProjects })
      }
    }
    void run()
    return () => {
      isCancelled = true
    }
  }, [request])

  return useMemo((): readonly OpenTabsRow[] => {
    if (!isActive || snapshot?.request !== request) {
      return EMPTY_OPEN_TABS_ROWS
    }
    return buildOpenTabsRows(snapshot.projectsWithUrls, remoteOpenUrls)
  }, [isActive, snapshot, request, remoteOpenUrls])
}
