import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  clampSidebarWidth,
  loadSidebarWidth,
  persistSidebarWidth,
} from '@/features/ai-chat/components/savedTabsChat/storage'

const TABLET_BREAKPOINT = 768
const SIDEBAR_COMPACT_BREAKPOINT = 360

type ChatSidebarMode = 'floating' | 'page'

type ResizeStartEvent = {
  preventDefault: () => void
}

const useChatSidebarResize = ({ mode }: { mode: ChatSidebarMode }) => {
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [resizeSession, setResizeSession] = useState<object | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const sidebarWidthRef = useRef(sidebarWidth)

  const stopResize = useCallback(() => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }, [])

  useEffect(() => stopResize, [stopResize])

  useEffect(() => {
    if (mode === 'page') {
      stopResize()
    }
  }, [mode, stopResize])

  useEffect(() => {
    const handleWindowResize = () => {
      setViewportWidth(window.innerWidth)
      if (mode === 'floating') {
        setSidebarWidth((currentWidth) => {
          const nextWidth = clampSidebarWidth(currentWidth)
          sidebarWidthRef.current = nextWidth
          return nextWidth
        })
      }
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [mode])

  const handleResizeStart = useCallback(
    (event: ResizeStartEvent) => {
      if (mode === 'page') {
        return
      }

      event.preventDefault()
      stopResize()
      setResizeSession({})

      const previousBodyStyle = document.body.style.cssText
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clampSidebarWidth(
          window.innerWidth - moveEvent.clientX,
        )
        sidebarWidthRef.current = nextWidth
        setSidebarWidth(nextWidth)
      }
      const handlePointerUp = () => {
        persistSidebarWidth(sidebarWidthRef.current)
        setResizeSession(null)
        stopResize()
      }

      document.body.style.cssText = `${previousBodyStyle}; cursor: col-resize; user-select: none;`
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)

      resizeCleanupRef.current = () => {
        document.body.style.cssText = previousBodyStyle
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }
    },
    [mode, stopResize],
  )

  const isCompactLayout =
    mode === 'page'
      ? viewportWidth < TABLET_BREAKPOINT
      : sidebarWidth <= SIDEBAR_COMPACT_BREAKPOINT
  const isResizing =
    mode === 'floating' &&
    resizeSession !== null &&
    resizeCleanupRef.current !== null
  const cardStyle = useMemo(
    () => (mode === 'page' ? undefined : { width: `${sidebarWidth}px` }),
    [mode, sidebarWidth],
  )

  return {
    cardStyle,
    handleResizeStart,
    isCompactLayout,
    isResizing,
    sidebarWidth,
  }
}

export { useChatSidebarResize }
