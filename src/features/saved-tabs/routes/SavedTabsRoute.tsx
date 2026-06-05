import {
  Profiler,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { LazySavedTabsChatWidget } from '@/features/ai-chat/components/LazySavedTabsChatWidget'
import { getSavedTabsModeFromLocation } from '@/features/navigation/lib/pageNavigation'
import { SavedTabsApp } from '@/features/saved-tabs/app/SavedTabsApp'
import {
  handleSavedTabsRender,
  isDevProfileEnabled,
} from '@/features/saved-tabs/app/savedTabsProfiler'
import { SavedTabsScrollControls } from '@/features/saved-tabs/components/SavedTabsScrollControls'
import { SavedTabsResponsiveLayoutProvider } from '@/features/saved-tabs/contexts/SavedTabsResponsiveLayoutContext'
import type { ViewMode } from '@/types/storage'

const LEFT_PANE_COMPACT_BREAKPOINT = 1024

const getViewportWidthSnapshot = () => window.innerWidth

const getElementWidthSnapshot = (element: HTMLDivElement | null) => {
  if (!element) {
    return getViewportWidthSnapshot()
  }

  const width = Math.round(element.getBoundingClientRect().width)
  if (!Number.isFinite(width) || width <= 0) {
    return getViewportWidthSnapshot()
  }

  return width
}

const getLeftPaneWidthStoreSnapshot = (width: number | null) =>
  width ?? getViewportWidthSnapshot()

const subscribeToElementWidth = (
  element: HTMLDivElement | null,
  widthRef: { current: number | null },
  onStoreChange: () => void,
) => {
  if (!element) {
    return () => {}
  }

  if (typeof ResizeObserver === 'undefined') {
    const handleResize = () => {
      widthRef.current = getElementWidthSnapshot(element)
      onStoreChange()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }

  const observer = new ResizeObserver((entries) => {
    const nextWidth = entries[0]?.contentRect.width
    const width = Math.round(nextWidth ?? Number.NaN)
    if (Number.isFinite(width) && width > 0) {
      widthRef.current = width
    }
    onStoreChange()
  })
  observer.observe(element)

  return () => {
    observer.disconnect()
  }
}

const useLeftPaneWidth = () => {
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef<number | null>(null)
  if (widthRef.current === null) {
    widthRef.current = getViewportWidthSnapshot()
  }
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const attachLeftPaneRef = useCallback((node: HTMLDivElement | null) => {
    leftPaneRef.current = node
    widthRef.current = getElementWidthSnapshot(node)
    setElement(node)
  }, [])
  const leftPaneWidth = useSyncExternalStore(
    (onStoreChange) =>
      subscribeToElementWidth(element, widthRef, onStoreChange),
    () => getLeftPaneWidthStoreSnapshot(widthRef.current),
    getViewportWidthSnapshot,
  )

  return {
    attachLeftPaneRef,
    leftPaneRef,
    leftPaneWidth,
  }
}

export { getLeftPaneWidthStoreSnapshot }

interface SavedTabsRouteProps {
  onViewModeNavigate?: (mode: ViewMode) => void
  search?: string
}

export const SavedTabsRoute = ({
  onViewModeNavigate,
  search,
}: SavedTabsRouteProps) => {
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const { attachLeftPaneRef, leftPaneRef, leftPaneWidth } = useLeftPaneWidth()

  const isCompactLeftPaneLayout = leftPaneWidth < LEFT_PANE_COMPACT_BREAKPOINT
  const initialViewMode: ViewMode = getSavedTabsModeFromLocation(
    search ?? window.location.search,
  )

  return (
    <div
      className='flex h-screen items-stretch overflow-hidden'
      data-testid='saved-tabs-page-layout'
    >
      <div className='flex min-w-0 flex-1'>
        <div
          ref={attachLeftPaneRef}
          className='h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain'
          data-saved-tabs-layout={isCompactLeftPaneLayout ? 'compact' : 'full'}
          data-testid='saved-tabs-left-pane'
        >
          <SavedTabsResponsiveLayoutProvider
            isCompactLayout={isCompactLeftPaneLayout}
          >
            {isDevProfileEnabled ? (
              <Profiler id='SavedTabs' onRender={handleSavedTabsRender}>
                <SavedTabsApp
                  initialViewMode={initialViewMode}
                  isAiSidebarOpen={isAiSidebarOpen}
                  onViewModeNavigate={onViewModeNavigate}
                />
              </Profiler>
            ) : (
              <SavedTabsApp
                initialViewMode={initialViewMode}
                isAiSidebarOpen={isAiSidebarOpen}
                onViewModeNavigate={onViewModeNavigate}
              />
            )}
          </SavedTabsResponsiveLayoutProvider>
        </div>
        <SavedTabsScrollControls
          scrollContainerRef={leftPaneRef}
          viewMode={initialViewMode}
        />
      </div>
      <LazySavedTabsChatWidget
        historyVariant='dropdown'
        onOpenChange={setIsAiSidebarOpen}
      />
    </div>
  )
}
