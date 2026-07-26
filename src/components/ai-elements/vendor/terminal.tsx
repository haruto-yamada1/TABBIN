'use client'

import Anser from 'anser'
import { escapeCarriageReturn } from 'escape-carriage'
import { CheckIcon, CopyIcon, TerminalIcon, Trash2Icon } from 'lucide-react'
import type { ComponentProps, CSSProperties, HTMLAttributes } from 'react'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { Shimmer } from '../shimmer'
import { useCopyState } from '../use-copy-state'

export type AnsiTextProps = {
  children?: string
  className?: string
}

const fixBackspace = (text: string): string => {
  let previous: string

  do {
    previous = text
    text = previous.replace(/[^\n]\x08/gm, '')
  } while (text.length < previous.length)

  return text
}

const createAnsiStyle = (entry: Anser.AnserJsonEntry): CSSProperties => {
  const style: CSSProperties = {}

  if (entry.bg) {
    style.backgroundColor = `rgb(${entry.bg})`
  }
  if (entry.fg) {
    style.color = `rgb(${entry.fg})`
  }

  switch (entry.decoration) {
    case 'bold':
      style.fontWeight = 'bold'
      break
    case 'dim':
      style.opacity = 0.5
      break
    case 'italic':
      style.fontStyle = 'italic'
      break
    case 'hidden':
      style.visibility = 'hidden'
      break
    case 'strikethrough':
      style.textDecoration = 'line-through'
      break
    case 'underline':
      style.textDecoration = 'underline'
      break
    case 'blink':
      style.textDecoration = 'blink'
      break
    default:
      break
  }

  return style
}

export const AnsiText = ({ children = '', className }: AnsiTextProps) => {
  const normalizedText = escapeCarriageReturn(fixBackspace(children))
  const entries = Anser.ansiToJson(normalizedText, {
    json: true,
    remove_empty: true,
    use_classes: false,
  })

  return (
    <code className={className}>
      {entries.map((entry, index) => (
        <span key={index} style={createAnsiStyle(entry)}>
          {entry.content}
        </span>
      ))}
    </code>
  )
}

type TerminalContextType = {
  output: string
  isStreaming: boolean
  autoScroll: boolean
  onClear?: () => void
}

const TerminalContext = createContext<TerminalContextType>({
  autoScroll: true,
  isStreaming: false,
  output: '',
})

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string
  isStreaming?: boolean
  autoScroll?: boolean
  onClear?: () => void
}

export const Terminal = ({
  output,
  isStreaming = false,
  autoScroll = true,
  onClear,
  className,
  children,
  ...props
}: TerminalProps) => {
  const contextValue = useMemo(
    () => ({ autoScroll, isStreaming, onClear, output }),
    [autoScroll, isStreaming, onClear, output],
  )

  return (
    <TerminalContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <TerminalHeader>
              <TerminalTitle />
              <div className='flex items-center gap-1'>
                <TerminalStatus />
                <TerminalActions>
                  <TerminalCopyButton />
                  {onClear && <TerminalClearButton />}
                </TerminalActions>
              </div>
            </TerminalHeader>
            <TerminalContent />
          </>
        )}
      </div>
    </TerminalContext.Provider>
  )
}

export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>

export const TerminalHeader = ({
  className,
  children,
  ...props
}: TerminalHeaderProps) => (
  <div
    className={cn(
      'flex items-center justify-between border-b border-zinc-800 px-4 py-2',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>

export const TerminalTitle = ({
  className,
  children,
  ...props
}: TerminalTitleProps) => (
  <div
    className={cn('flex items-center gap-2 text-sm text-zinc-400', className)}
    {...props}
  >
    <TerminalIcon className='size-4' />
    {children ?? 'Terminal'}
  </div>
)

export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>

export const TerminalStatus = ({
  className,
  children,
  ...props
}: TerminalStatusProps) => {
  const { isStreaming } = use(TerminalContext)

  if (!isStreaming) {
    return null
  }

  return (
    <div
      className={cn('flex items-center gap-2 text-xs text-zinc-400', className)}
      {...props}
    >
      {children ?? <Shimmer className='w-16' />}
    </div>
  )
}

export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>

export const TerminalActions = ({
  className,
  children,
  ...props
}: TerminalActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
)

export type TerminalCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const TerminalCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: TerminalCopyButtonProps) => {
  const { output } = use(TerminalContext)
  const { copyText, isCopied } = useCopyState({ onCopy, onError, timeout })
  const handleCopy = useCallback(() => {
    void copyText(output)
  }, [copyText, output])

  return (
    <Button
      className={cn(
        'size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/40',
        className,
      )}
      onClick={handleCopy}
      size='icon'
      variant='ghost'
      {...props}
    >
      {children ??
        (isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />)}
    </Button>
  )
}

export type TerminalClearButtonProps = ComponentProps<typeof Button>

export const TerminalClearButton = ({
  children,
  className,
  ...props
}: TerminalClearButtonProps) => {
  const { onClear } = use(TerminalContext)

  if (!onClear) {
    return null
  }

  return (
    <Button
      className={cn(
        'size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        className,
      )}
      onClick={onClear}
      size='icon'
      variant='ghost'
      {...props}
    >
      {children ?? <Trash2Icon size={14} />}
    </Button>
  )
}

export type TerminalContentProps = HTMLAttributes<HTMLDivElement>

export const TerminalContent = ({
  className,
  children,
  ...props
}: TerminalContentProps) => {
  const { output, isStreaming, autoScroll } = use(TerminalContext)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [output, autoScroll])

  return (
    <div
      className={cn(
        'max-h-96 overflow-auto p-4 font-mono text-sm leading-relaxed',
        className,
      )}
      ref={containerRef}
      {...props}
    >
      {children ?? (
        <pre className='break-words whitespace-pre-wrap'>
          <AnsiText>{output}</AnsiText>
          {isStreaming && (
            <span className='ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-100' />
          )}
        </pre>
      )}
    </div>
  )
}
