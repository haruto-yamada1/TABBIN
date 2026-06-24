import { useMemo, useRef } from 'react'

import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { SavedTabsPage } from '@/contexts/saved-tabs/presentation/pages/SavedTabsPage'
import type { ResolveActiveRef } from '@/contexts/saved-tabs/presentation/pages/SavedTabsPage'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import { getSavedTabsModeFromLocation } from '@/features/navigation/lib/pageNavigation'

export type SavedTabsDepsFactory = (options: {
  readonly resolveActive: () => boolean
}) => {
  readonly deps: SavedTabsPresentationPorts
  readonly useCases: SavedTabsUseCases
}

/**
 * `SavedTabsRoute` の props。
 *
 * - `onViewModeNavigate` : view mode 切替時に親 (AppRouter) へ通知
 * - `search` : URL の search string。`SavedTabsPage` 内で
 *   `initialViewMode` の解決に利用する
 */
export interface SavedTabsRouteProps {
  readonly createDeps: SavedTabsDepsFactory
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
  createDeps,
  onViewModeNavigate,
  search,
}: SavedTabsRouteProps) => {
  const resolveActiveRef = useRef<ResolveActiveRef['current']>(() => true)
  const composition = useMemo(
    () => createDeps({ resolveActive: () => resolveActiveRef.current() }),
    [createDeps],
  )
  const initialViewMode: ViewMode = getSavedTabsModeFromLocation(
    search ?? (typeof window !== 'undefined' ? window.location.search : ''),
  )
  return (
    <SavedTabsPage
      deps={composition.deps}
      initialViewMode={initialViewMode}
      onViewModeNavigate={onViewModeNavigate}
      resolveActiveRef={resolveActiveRef}
      search={search}
      useCases={composition.useCases}
    />
  )
}
