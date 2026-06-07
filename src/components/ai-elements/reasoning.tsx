'use client'

import { useControllableState } from '@radix-ui/react-use-controllable-state'
import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { cn } from '@/lib/utils'

import { Shimmer } from './shimmer'
import { StreamdownMarkdown } from './streamdown-renderer'

interface ReasoningContextValue {
  isStreaming: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  duration: number | undefined
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null)

export const useReasoning = () => {
  const context = use(ReasoningContext)
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning')
  }
  return context
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  duration?: number
}

const AUTO_CLOSE_DELAY = 1000
const MS_IN_S = 1000

const updateReasoningStreamTiming = ({
  hasEverStreamedRef,
  isStreaming,
  setDuration,
  startTimeRef,
}: {
  hasEverStreamedRef: { current: boolean }
  isStreaming: boolean
  setDuration: (duration: number | undefined) => void
  startTimeRef: { current: number | null }
}) => {
  if (isStreaming) {
    hasEverStreamedRef.current = true
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
    return
  }
  if (startTimeRef.current !== null) {
    setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S))
    startTimeRef.current = null
  }
}

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
// eslint-disable-next-line typescript/unbound-method
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    })
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    })

    const hasEverStreamedRef = useRef(isStreaming)
    const hasAutoClosedRef = useRef(false)
    const startTimeRef = useRef<number | null>(null)

    // Track when streaming starts and compute duration
    useEffect(() => {
      updateReasoningStreamTiming({
        hasEverStreamedRef,
        isStreaming,
        setDuration,
        startTimeRef,
      })
    }, [isStreaming, setDuration])

    // Auto-open when streaming starts (unless explicitly closed)
    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true)
      }
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed])

    // Auto-close when streaming ends (once only, and only if it ever streamed)
// eslint-disable-next-line typescript/consistent-return
    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosedRef.current
      ) {
        const timer = setTimeout(() => {
          setIsOpen(false)
          hasAutoClosedRef.current = true
        }, AUTO_CLOSE_DELAY)

        return () => {
          clearTimeout(timer)
        }
      }
    }, [isStreaming, isOpen, setIsOpen])

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen)
      },
      [setIsOpen],
    )

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen],
    )

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn('not-prose mb-4', className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    )
  },
)

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
}

const renderDefaultThinkingMessage = (
  t: (
    key: string,
    fallback?: string,
    values?: Record<string, string>,
  ) => string,
  isStreaming: boolean,
  duration?: number,
) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>{t('common.thinking')}</Shimmer>
  }
  if (duration === undefined) {
    return <p>{t('common.thoughtForFewSeconds')}</p>
  }
  return (
    <p>
      {t('common.thoughtForSeconds', undefined, { count: String(duration) })}
    </p>
  )
}

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning()
    const t = useI18nText()

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon className='size-4' />
            {getThinkingMessage
              ? getThinkingMessage(isStreaming, duration)
              : renderDefaultThinkingMessage(t, isStreaming, duration)}
            <ChevronDownIcon
              className={cn(
                'size-4 transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    )
  },
)

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string
}

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn(
        'mt-4 text-sm',
        'text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
        className,
      )}
      {...props}
    >
      <StreamdownMarkdown>{children}</StreamdownMarkdown>
    </CollapsibleContent>
  ),
)

Reasoning.displayName = 'Reasoning'
ReasoningTrigger.displayName = 'ReasoningTrigger'
ReasoningContent.displayName = 'ReasoningContent'
