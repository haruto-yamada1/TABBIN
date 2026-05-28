import { Profiler, useEffect, useRef, useState } from 'react'

import { LazySavedTabsChatWidget } from '@/features/ai-chat/components/LazySavedTabsChatWidget'
import { getSavedTabsModeFromLocation } from '@/features/navigation/lib/pageNavigation'
import {
  SavedTabsApp,
  handleSavedTabsRender,
  isDevProfileEnabled,
} from '@/features/saved-tabs/app/SavedTabsApp'
import { SavedTabsScrollControls } from '@/features/saved-tabs/components/SavedTabsScrollControls'
import { SavedTabsResponsiveLayoutProvider } from '@/features/saved-tabs/contexts/SavedTabsResponsiveLayoutContext'
import type { ViewMode } from '@/types/storage'

const LEFT_PANE_COMPACT_BREAKPOINT = 1024

interface SavedTabsRouteProps {
  onViewModeNavigate?: (mode: ViewMode) => void
  search?: string
}

export const SavedTabsRoute = ({
  onViewModeNavigate,
  search,
}: SavedTabsRouteProps) => {
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => window.innerWidth)
  const leftPaneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = leftPaneRef.current as HTMLDivElement

    const updateLeftPaneWidth = (width: number) => {
      const roundedWidth = Math.round(width)
      if (!Number.isFinite(roundedWidth) || roundedWidth <= 0) {
        return
      }

      setLeftPaneWidth((currentWidth) =>
        currentWidth === roundedWidth ? currentWidth : roundedWidth,
      )
    }

    updateLeftPaneWidth(element.getBoundingClientRect().width)

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => {
        updateLeftPaneWidth(element.getBoundingClientRect().width)
      }

      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }

    const observer = new ResizeObserver((entries) => {
      updateLeftPaneWidth(entries[0]?.contentRect.width ?? Number.NaN)
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

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
          ref={leftPaneRef}
          className='h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain'
          data-saved-tabs-layout={isCompactLeftPaneLayout ? 'compact' : 'full'}
          data-testid='saved-tabs-left-pane'
        >
          <SavedTabsResponsiveLayoutProvider
            isCompactLayout={isCompactLeftPaneLayout}
          >
            {isDevProfileEnabled ? (
              /* v8 ignore next -- coverage-only defensive branch. */
              /* v8 ignore start -- coverage-only defensive branch. */
              <Profiler id='SavedTabs' onRender={handleSavedTabsRender}>
                <SavedTabsApp
                  initialViewMode={initialViewMode}
                  isAiSidebarOpen={isAiSidebarOpen}
                  onViewModeNavigate={onViewModeNavigate}
                />
              </Profiler>
            ) : (
              <SavedTabsApp
                /* v8 ignore stop */
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
