import { useMemo } from 'react'

import { getSavedTabsModeFromLocation } from '@/features/navigation/lib/pageNavigation'
import type { ViewMode } from '@/types/storage'

import { createSavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import { SavedTabsPage } from '../pages/SavedTabsPage'

/**
 * `SavedTabsRoute` の props。
 *
 * - `onViewModeNavigate` : view mode 切替時に親 (AppRouter) へ通知
 * - `search` : URL の search string。`SavedTabsPage` 内で
 *   `initialViewMode` の解決に利用する
 */
export interface SavedTabsRouteProps {
  readonly onViewModeNavigate?: (mode: ViewMode) => void
  readonly search?: string
}

/**
 * contexts 側 `SavedTabsRoute` (production 実行経路)。
 *
 * 旧 `features/saved-tabs/routes/SavedTabsRoute` の再 export を解消
 * (#485) し、contexts 配下の `SavedTabsPage` を直接描画する
 * 実装に置き換えた版。
 *
 * - chrome 実環境では `createSavedTabsUseCasesDeps()` を組み立てて
 *   `SavedTabsPage` へ渡し、SSR / Storybook / テスト時は
 *   `getSavedTabsModeFromLocation` 相当の URL 解決を page 側に任せる
 * - route レベルの Provider / layout 状態 (ResizeObserver による
 *   compact 判定、AI サイドバー state) は `SavedTabsPage` 側に集約
 * - UI の見た目・操作感は旧 `features/saved-tabs/routes/SavedTabsRoute`
 *   と等価
 */
export const SavedTabsRoute = ({
  onViewModeNavigate,
  search,
}: SavedTabsRouteProps) => {
  const deps = useMemo(() => createSavedTabsUseCasesDeps(), [])
  const initialViewMode: ViewMode = getSavedTabsModeFromLocation(
    search ?? (typeof window !== 'undefined' ? window.location.search : ''),
  )
  return (
    <SavedTabsPage
      deps={deps}
      initialViewMode={initialViewMode}
      onViewModeNavigate={onViewModeNavigate}
      search={search}
    />
  )
}
