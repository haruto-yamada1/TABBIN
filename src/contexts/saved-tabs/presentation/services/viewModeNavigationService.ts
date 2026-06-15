import { getPageHref } from '@/features/navigation/lib/pageNavigation'
import type { ViewMode } from '@/types/storage'

/**
 * view mode に対応する href を解決する。
 *
 * 旧 `savedTabsApp.helpers.ts` の `resolveSavedTabsViewModeHref` を
 * presentation service へ移設 (issue #512)。
 */
const resolveSavedTabsViewModeHref = (viewMode: ViewMode): string =>
  getPageHref(viewMode === 'custom' ? 'saved-tabs-custom' : 'saved-tabs-domain')

/**
 * 初期 view mode の解決待ち状態を判定する。
 *
 * 旧 `savedTabsApp.helpers.ts` の `shouldWaitForInitialViewMode` を
 * presentation service へ移設 (issue #512)。
 */
const shouldWaitForInitialViewMode = ({
  hasResolvedInitialViewMode,
  initialViewMode,
  viewMode,
}: {
  hasResolvedInitialViewMode: boolean
  initialViewMode?: ViewMode
  viewMode: ViewMode
}): boolean => {
  if (!initialViewMode || hasResolvedInitialViewMode) {
    return false
  }

  return viewMode !== initialViewMode
}

/**
 * 現在の view mode を URL に同期する。
 * ナビゲートコールバックが指定されていればそれを使う。
 *
 * 旧 `savedTabsApp.helpers.ts` の `syncSavedTabsViewModeLocation` を
 * presentation service へ移設 (issue #512)。
 */
const syncSavedTabsViewModeLocation = ({
  onViewModeNavigate,
  viewMode,
}: {
  onViewModeNavigate?: (mode: ViewMode) => void
  viewMode: ViewMode
}): void => {
  if (onViewModeNavigate) {
    onViewModeNavigate(viewMode)
    return
  }

  const nextHref = resolveSavedTabsViewModeHref(viewMode)
  const currentUrl = new URL(window.location.href)
  const nextUrl = new URL(nextHref, window.location.href)

  if (
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search
  ) {
    return
  }

  window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`)
}

export {
  resolveSavedTabsViewModeHref,
  shouldWaitForInitialViewMode,
  syncSavedTabsViewModeLocation,
}
