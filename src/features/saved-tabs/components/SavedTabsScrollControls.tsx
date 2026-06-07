import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18nText } from '@/features/i18n/context/I18nProvider'
import {
  getRelativeScrollTarget,
  getScrollControlAvailability,
  scrollContainerToTarget,
} from '@/features/saved-tabs/lib/scroll-controls'
import type {
  ScrollControlAvailability,
  ScrollDirection,
  ScrollTargetType,
} from '@/features/saved-tabs/lib/scroll-controls'
import type { ViewMode } from '@/types/storage'

const HIGHLIGHT_CLASS_NAME = 'saved-tabs-scroll-highlight'
const HIGHLIGHT_DURATION_MS = 1200
const REPEAT_SCROLL_DELAY_MS = 450
const REPEAT_SCROLL_INTERVAL_MS = 220

const initialAvailability: ScrollControlAvailability = {
  bottom: false,
  nextChild: false,
  nextDomain: false,
  nextParent: false,
  nextProject: false,
  previousChild: false,
  previousDomain: false,
  previousParent: false,
  previousProject: false,
  top: false,
}

interface SavedTabsScrollControlsProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  viewMode: ViewMode
}

interface ScrollControlButtonProps {
  ariaLabel: string
  children: React.ReactNode
  disabled: boolean
  onActivate: () => void
  tooltip: string
}

type KeyboardScrollAction =
  | 'nextChild'
  | 'nextDomain'
  | 'nextParent'
  | 'nextProject'
  | 'previousChild'
  | 'previousDomain'
  | 'previousParent'
  | 'previousProject'

const getKeyboardScrollAction = (
  event: KeyboardEvent,
): KeyboardScrollAction | null => {
  if (!event.altKey || event.metaKey || event.ctrlKey) {
    return null
  }
  if (event.key === 'ArrowUp') {
    return event.shiftKey ? 'previousChild' : 'previousParent'
  }
  if (event.key === 'ArrowDown') {
    return event.shiftKey ? 'nextChild' : 'nextParent'
  }
  if (event.key === 'PageUp') {
    return 'previousDomain'
  }
  if (event.key === 'PageDown') {
    return 'nextDomain'
  }
  return null
}

const SavedTabsScrollControlButton = ({
  ariaLabel,
  children,
  disabled,
  onActivate,
  tooltip,
}: ScrollControlButtonProps) => {
  const repeatDelayRef = useRef<number | null>(null)
  const repeatIntervalRef = useRef<number | null>(null)

  const stopRepeating = useCallback(() => {
    if (repeatDelayRef.current !== null) {
      window.clearTimeout(repeatDelayRef.current)
      repeatDelayRef.current = null
    }
    if (repeatIntervalRef.current !== null) {
      window.clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }, [])

  useEffect(() => stopRepeating, [stopRepeating])

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const startRepeating = () => {
    if (disabled) {
      return
    }
    stopRepeating()
    repeatDelayRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(
        onActivate,
        REPEAT_SCROLL_INTERVAL_MS,
      )
    }, REPEAT_SCROLL_DELAY_MS)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='secondary'
          size='icon-sm'
          aria-disabled={disabled}
          aria-label={ariaLabel}
          disabled={disabled}
          onBlur={stopRepeating}
          onClick={onActivate}
          onMouseDown={startRepeating}
          onMouseLeave={stopRepeating}
          onMouseUp={stopRepeating}
          className='shadow-sm'
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='left'>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

const useSavedTabsScrollControlsView = ({
  scrollContainerRef,
  viewMode,
}: SavedTabsScrollControlsProps) => {
  const t = useI18nText()
  const [availability, setAvailability] =
    useState<ScrollControlAvailability>(initialAvailability)
  const [announcement, setAnnouncement] = useState('')
  const highlightedTargetRef = useRef<HTMLElement | null>(null)
  const highlightTimeoutRef = useRef<number | null>(null)
  const scrollToTopLabel = t('savedTabs.scrollControls.top', 'Scroll to top')
  const scrollToPreviousParentLabel = t(
    'savedTabs.scrollControls.previousParent',
    'Scroll to previous parent category',
  )
  const scrollToPreviousChildLabel = t(
    'savedTabs.scrollControls.previousChild',
    'Scroll to previous child category',
  )
  const scrollToPreviousDomainLabel = t(
    'savedTabs.scrollControls.previousDomain',
    'Scroll to previous domain',
  )
  const scrollToPreviousProjectLabel = t(
    'savedTabs.scrollControls.previousProject',
    'Scroll to previous project',
  )
  const scrollToNextParentLabel = t(
    'savedTabs.scrollControls.nextParent',
    'Scroll to next parent category',
  )
  const scrollToNextChildLabel = t(
    'savedTabs.scrollControls.nextChild',
    'Scroll to next child category',
  )
  const scrollToNextDomainLabel = t(
    'savedTabs.scrollControls.nextDomain',
    'Scroll to next domain',
  )
  const scrollToNextProjectLabel = t(
    'savedTabs.scrollControls.nextProject',
    'Scroll to next project',
  )
  const scrollToBottomLabel = t(
    'savedTabs.scrollControls.bottom',
    'Scroll to bottom',
  )

  const updateAvailability = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      setAvailability(initialAvailability)
      return
    }
    setAvailability(getScrollControlAvailability(container))
  }, [scrollContainerRef])

  const clearHighlight = useCallback(() => {
    highlightedTargetRef.current?.classList.remove(HIGHLIGHT_CLASS_NAME)
    highlightedTargetRef.current = null
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = null
    }
  }, [])

  const highlightTarget = useCallback(
    (target: HTMLElement) => {
      clearHighlight()
      target.classList.add(HIGHLIGHT_CLASS_NAME)
      highlightedTargetRef.current = target
      highlightTimeoutRef.current = window.setTimeout(
        clearHighlight,
        HIGHLIGHT_DURATION_MS,
      )
    },
    [clearHighlight],
  )

  const announce = useCallback((label: string) => {
    setAnnouncement(label)
  }, [])

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({
      behavior: 'smooth',
      top: 0,
    })
    announce(scrollToTopLabel)
  }, [announce, scrollContainerRef, scrollToTopLabel])

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }
    container.scrollTo({
      behavior: 'smooth',
      top: container.scrollHeight,
    })
    announce(scrollToBottomLabel)
  }, [announce, scrollContainerRef, scrollToBottomLabel])

  const scrollToRelativeTarget = useCallback(
    (
      targetType: ScrollTargetType,
      direction: ScrollDirection,
      label: string,
    ) => {
      const container = scrollContainerRef.current
      if (!container) {
        return
      }
      const target = getRelativeScrollTarget(container, targetType, direction)
      if (!target) {
        updateAvailability()
        return
      }
      highlightTarget(target)
      scrollContainerToTarget(container, target)
      announce(label)
      updateAvailability()
    },
    [announce, highlightTarget, scrollContainerRef, updateAvailability],
  )

  const scrollToPreviousParent = useCallback(() => {
    scrollToRelativeTarget('parent', 'previous', scrollToPreviousParentLabel)
  }, [scrollToPreviousParentLabel, scrollToRelativeTarget])
  const scrollToPreviousChild = useCallback(() => {
    scrollToRelativeTarget('child', 'previous', scrollToPreviousChildLabel)
  }, [scrollToPreviousChildLabel, scrollToRelativeTarget])
  const scrollToPreviousDomain = useCallback(() => {
    scrollToRelativeTarget('domain', 'previous', scrollToPreviousDomainLabel)
  }, [scrollToPreviousDomainLabel, scrollToRelativeTarget])
  const scrollToPreviousProject = useCallback(() => {
    scrollToRelativeTarget('project', 'previous', scrollToPreviousProjectLabel)
  }, [scrollToPreviousProjectLabel, scrollToRelativeTarget])
  const scrollToNextParent = useCallback(() => {
    scrollToRelativeTarget('parent', 'next', scrollToNextParentLabel)
  }, [scrollToNextParentLabel, scrollToRelativeTarget])
  const scrollToNextChild = useCallback(() => {
    scrollToRelativeTarget('child', 'next', scrollToNextChildLabel)
  }, [scrollToNextChildLabel, scrollToRelativeTarget])
  const scrollToNextDomain = useCallback(() => {
    scrollToRelativeTarget('domain', 'next', scrollToNextDomainLabel)
  }, [scrollToNextDomainLabel, scrollToRelativeTarget])
  const scrollToNextProject = useCallback(() => {
    scrollToRelativeTarget('project', 'next', scrollToNextProjectLabel)
  }, [scrollToNextProjectLabel, scrollToRelativeTarget])

  const keyboardScrollHandlers = useMemo<
    Record<KeyboardScrollAction, () => void>
  >(
    () => ({
      nextChild: scrollToNextChild,
      nextDomain: scrollToNextDomain,
      nextParent: scrollToNextParent,
      nextProject: scrollToNextProject,
      previousChild: scrollToPreviousChild,
      previousDomain: scrollToPreviousDomain,
      previousParent: scrollToPreviousParent,
      previousProject: scrollToPreviousProject,
    }),
    [
      scrollToNextChild,
      scrollToNextDomain,
      scrollToNextParent,
      scrollToNextProject,
      scrollToPreviousChild,
      scrollToPreviousDomain,
      scrollToPreviousParent,
      scrollToPreviousProject,
    ],
  )

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const handleScroll = () => {
      updateAvailability()
    }

    updateAvailability()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateAvailability)
    resizeObserver?.observe(container)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
    }
  }, [scrollContainerRef, updateAvailability])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getKeyboardScrollAction(event)
      if (!action) {
        return
      }

      event.preventDefault()
      keyboardScrollHandlers[action]()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [keyboardScrollHandlers])

  useEffect(
    () => () => {
      clearHighlight()
    },
    [clearHighlight],
  )

  const isCustomMode = viewMode === 'custom'

  return (
    <TooltipProvider delayDuration={0}>
      <div className='flex h-full w-12 shrink-0 items-center justify-center border-l border-border bg-background/80'>
        <div className='flex flex-col gap-2 opacity-100'>
          <SavedTabsScrollControlButton
            ariaLabel={scrollToTopLabel}
            disabled={!availability.top}
            onActivate={scrollToTop}
            tooltip={scrollToTopLabel}
          >
            <ArrowUpToLine size={16} />
          </SavedTabsScrollControlButton>
          {isCustomMode ? (
            <>
              <SavedTabsScrollControlButton
                ariaLabel={scrollToPreviousProjectLabel}
                disabled={!availability.previousProject}
                onActivate={scrollToPreviousProject}
                tooltip={scrollToPreviousProjectLabel}
              >
                <ChevronsUp size={16} />
              </SavedTabsScrollControlButton>
              <div className='my-1 h-px bg-border' />
              <SavedTabsScrollControlButton
                ariaLabel={scrollToNextProjectLabel}
                disabled={!availability.nextProject}
                onActivate={scrollToNextProject}
                tooltip={scrollToNextProjectLabel}
              >
                <ChevronsDown size={16} />
              </SavedTabsScrollControlButton>
            </>
          ) : (
            <>
              <SavedTabsScrollControlButton
                ariaLabel={scrollToPreviousParentLabel}
                disabled={!availability.previousParent}
                onActivate={scrollToPreviousParent}
                tooltip={scrollToPreviousParentLabel}
              >
                <ChevronsUp size={16} />
              </SavedTabsScrollControlButton>
              <SavedTabsScrollControlButton
                ariaLabel={scrollToPreviousDomainLabel}
                disabled={!availability.previousDomain}
                onActivate={scrollToPreviousDomain}
                tooltip={scrollToPreviousDomainLabel}
              >
                <ArrowUp size={16} />
              </SavedTabsScrollControlButton>
              <SavedTabsScrollControlButton
                ariaLabel={scrollToPreviousChildLabel}
                disabled={!availability.previousChild}
                onActivate={scrollToPreviousChild}
                tooltip={scrollToPreviousChildLabel}
              >
                <ChevronUp size={16} />
              </SavedTabsScrollControlButton>
              <div className='my-1 h-px bg-border' />
              <SavedTabsScrollControlButton
                ariaLabel={scrollToNextChildLabel}
                disabled={!availability.nextChild}
                onActivate={scrollToNextChild}
                tooltip={scrollToNextChildLabel}
              >
                <ChevronDown size={16} />
              </SavedTabsScrollControlButton>
              <SavedTabsScrollControlButton
                ariaLabel={scrollToNextDomainLabel}
                disabled={!availability.nextDomain}
                onActivate={scrollToNextDomain}
                tooltip={scrollToNextDomainLabel}
              >
                <ArrowDown size={16} />
              </SavedTabsScrollControlButton>
              <SavedTabsScrollControlButton
                ariaLabel={scrollToNextParentLabel}
                disabled={!availability.nextParent}
                onActivate={scrollToNextParent}
                tooltip={scrollToNextParentLabel}
              >
                <ChevronsDown size={16} />
              </SavedTabsScrollControlButton>
            </>
          )}
          <SavedTabsScrollControlButton
            ariaLabel={scrollToBottomLabel}
            disabled={!availability.bottom}
            onActivate={scrollToBottom}
            tooltip={scrollToBottomLabel}
          >
            <ArrowDownToLine size={16} />
          </SavedTabsScrollControlButton>
        </div>
        <output aria-live='polite' className='sr-only'>
          {announcement}
        </output>
      </div>
    </TooltipProvider>
  )
}

const SavedTabsScrollControls = (props: SavedTabsScrollControlsProps) =>
  useSavedTabsScrollControlsView(props)

export { SavedTabsScrollControls }
