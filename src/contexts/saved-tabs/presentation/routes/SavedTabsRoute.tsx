import { useEffect, useState } from 'react'

import type { ViewMode } from '@/types/storage'

import { SavedTabsPage } from '../pages/SavedTabsPage'

/**
 * `SavedTabsRoute` の props。
 *
 * WXT の `src/entrypoints/saved-tabs/` から渡される初期表示モードと、
 * ナビゲート時のコールバックを受ける。`onViewModeNavigate` は未指定でも
 * URL を `window.history.replaceState` で更新する（既存仕様と同じ）。
 */
export interface SavedTabsRouteProps {
  readonly initialViewMode?: ViewMode
  readonly isAiSidebarOpen?: boolean
  readonly onViewModeNavigate?: (mode: ViewMode) => void
}

/**
 * `SavedTabsRoute` の内部 hook: `ViewMode` を URL と state で同期する。
 *
 * 旧 `SavedTabsRoute` の `syncSavedTabsViewModeLocation` を
 * presentation 層へ移譲する形。ナビゲートコールバックが指定されていれば
 * それを使う（React Router などへの対応）。
 */
const useViewModeSync = (
  initialViewMode: ViewMode | undefined,
  onViewModeNavigate: ((mode: ViewMode) => void) | undefined,
) => {
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialViewMode ?? 'domain',
  )
  useEffect(() => {
    if (onViewModeNavigate) {
      onViewModeNavigate(viewMode)
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    const nextHref =
      viewMode === 'custom' ? '/saved-tabs-custom' : '/saved-tabs-domain'
    const currentUrl = new URL(window.location.href)
    if (currentUrl.pathname === nextHref) {
      return
    }
    window.history.replaceState({}, '', nextHref)
  }, [onViewModeNavigate, viewMode])
  return { setViewMode, viewMode }
}

/**
 * `SavedTabsRoute` presentation 版。
 *
 * 旧 `src/features/saved-tabs/routes/SavedTabsRoute.tsx` の代替。
 * ページ (`SavedTabsPage`) をマウントし、URL / state 同期を担う。
 *
 * 実機 UI に出す要素は本ファイルではなく、`SavedTabsPage` 配下の
 * `SavedTabsPresentationLayout`（別 issue で導入）側に集約する。
 */
export const SavedTabsRoute = ({
  initialViewMode,
  isAiSidebarOpen,
  onViewModeNavigate,
}: SavedTabsRouteProps) => {
  const { viewMode } = useViewModeSync(initialViewMode, onViewModeNavigate)
  return (
    <SavedTabsRouteShell
      viewMode={viewMode}
      isAiSidebarOpen={isAiSidebarOpen ?? false}
    />
  )
}

/**
 * 表示確認用のシェルコンポーネント。`SavedTabsPage` の状態と
 * 現在の viewMode を data 属性で公開する。
 */
const SavedTabsRouteShell = ({
  viewMode,
  isAiSidebarOpen,
}: {
  viewMode: ViewMode
  isAiSidebarOpen: boolean
}) => {
  return (
    <div
      data-testid='saved-tabs-route-presentation'
      data-view-mode={viewMode}
      data-ai-sidebar-open={isAiSidebarOpen ? 'true' : 'false'}
    >
      <SavedTabsPage />
    </div>
  )
}
