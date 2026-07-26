'use client'

// ──────────────────────────────────────────────────────────────────────
// JSXPreview is a Storybook / dev-only component (issue #658).
//
// react-jsx-parser is a devDependency and this component must NEVER be
// imported from production code.  A dependency-cruiser rule
// (no-jsx-preview-outside-storybook) enforces that only files under
// src/lib/storybook/ may import this module.
//
// NEVER pass AI output, user input, or any other untrusted string to
// JSXPreview.  Only trusted Storybook fixtures and dev-only data are
// permitted.  If structured rendering of AI output is needed in the
// future, use Markdown / plain text / a constrained schema renderer
// instead of a JSX parser.
// ──────────────────────────────────────────────────────────────────────

import { AlertCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { TProps as JsxParserProps } from 'react-jsx-parser'
import JsxParser from 'react-jsx-parser'

import { cn } from '@/lib/utils'

type JSXPreviewContextValue = {
  jsx: string
  processedJsx: string
  error: Error | null
  setError: (error: Error | null) => void
  components: JsxParserProps['components']
  bindings: JsxParserProps['bindings']
  onErrorProp?: (error: Error) => void
}

const JSXPreviewContext = createContext<JSXPreviewContextValue | null>(null)

type JSXPreviewErrorState = {
  processedJsx: string
  error: Error
}

const TAG_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)(\/)?>/

const useJSXPreview = () => {
  const context = use(JSXPreviewContext)
  if (!context) {
    throw new Error('JSXPreview components must be used within JSXPreview')
  }
  return context
}

const matchJsxTag = (code: string) => {
  if (code.trim() === '') {
    return null
  }

  const match = TAG_REGEX.exec(code)

  if (match?.index === undefined) {
    return null
  }

  const [fullMatch, tagName, attributes, selfClosing] = match

  let type: 'self-closing' | 'closing' | 'opening'
  if (selfClosing) {
    type = 'self-closing'
  } else if (fullMatch.startsWith('</')) {
    type = 'closing'
  } else {
    type = 'opening'
  }

  return {
    attributes: attributes.trim(),
    endIndex: match.index + fullMatch.length,
    startIndex: match.index,
    tag: fullMatch,
    tagName,
    type,
  }
}

const completeJsxTag = (code: string) => {
  const stack: string[] = []
  let result = ''
  let currentPosition = 0

  while (currentPosition < code.length) {
    const match = matchJsxTag(code.slice(currentPosition))
    if (!match) {
      // No more tags found, append remaining content
      result += code.slice(currentPosition)
      break
    }
    const { tagName, type, endIndex } = match

    // Include any text content before this tag
    result += code.slice(currentPosition, currentPosition + endIndex)

    if (type === 'opening') {
      stack.push(tagName)
    } else if (type === 'closing') {
      stack.pop()
    }

    currentPosition += endIndex
  }

  return (
    result +
    stack
      .toReversed()
      .map((tag) => `</${tag}>`)
      .join('')
  )
}

export type JSXPreviewProps = ComponentProps<'div'> & {
  jsx: string
  isStreaming?: boolean
  components?: JsxParserProps['components']
  bindings?: JsxParserProps['bindings']
  onError?: (error: Error) => void
}

export const JSXPreview = memo(
  ({
    jsx,
    isStreaming = false,
    components,
    bindings,
    onError,
    className,
    children,
    ...props
  }: JSXPreviewProps) => {
    const [errorState, setErrorState] = useState<JSXPreviewErrorState | null>(
      null,
    )

    const processedJsx = useMemo(
      () => (isStreaming ? completeJsxTag(jsx) : jsx),
      [jsx, isStreaming],
    )
    const error =
      errorState?.processedJsx === processedJsx ? errorState.error : null
    const setError = useCallback(
      (nextError: Error | null) => {
        setErrorState(
          nextError
            ? {
                error: nextError,
                processedJsx,
              }
            : null,
        )
      },
      [processedJsx],
    )

    const contextValue = useMemo(
      () => ({
        bindings,
        components,
        error,
        jsx,
        onErrorProp: onError,
        processedJsx,
        setError,
      }),
      [bindings, components, error, jsx, onError, processedJsx, setError],
    )

    return (
      <JSXPreviewContext.Provider value={contextValue}>
        <div className={cn('relative', className)} {...props}>
          {children}
        </div>
      </JSXPreviewContext.Provider>
    )
  },
)

JSXPreview.displayName = 'JSXPreview'

export type JSXPreviewContentProps = Omit<ComponentProps<'div'>, 'children'>
export const JSXPreviewContent = memo(
  ({ className, ...props }: JSXPreviewContentProps) => {
    const { processedJsx, components, bindings, setError, onErrorProp } =
      useJSXPreview()
    const errorReportedRef = useRef<string | null>(null)

    useEffect(() => {
      errorReportedRef.current = null
    }, [processedJsx])

    const handleError = useCallback(
      (err: Error) => {
        // Prevent duplicate error reports for the same jsx
        if (errorReportedRef.current === processedJsx) {
          return
        }
        errorReportedRef.current = processedJsx
        setError(err)
        onErrorProp?.(err)
      },
      [processedJsx, onErrorProp, setError],
    )

    return (
      <div className={cn('jsx-preview-content', className)} {...props}>
        <JsxParser
          bindings={bindings}
          components={components}
          jsx={processedJsx}
          onError={handleError}
          renderInWrapper={false}
        />
      </div>
    )
  },
)

JSXPreviewContent.displayName = 'JSXPreviewContent'

export type JSXPreviewErrorProps = ComponentProps<'div'> & {
  children?: ReactNode | ((error: Error) => ReactNode)
}

const renderChildren = (
  children: ReactNode | ((error: Error) => ReactNode),
  error: Error,
): ReactNode => {
  if (typeof children === 'function') {
    return children(error)
  }
  return children
}
export const JSXPreviewError = memo(
  ({ className, children, ...props }: JSXPreviewErrorProps) => {
    const { error } = useJSXPreview()

    if (!error) {
      return null
    }

    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive',
          className,
        )}
        {...props}
      >
        {children ? (
          renderChildren(children, error)
        ) : (
          <>
            <AlertCircle className='size-4 shrink-0' />
            <span>{error.message}</span>
          </>
        )}
      </div>
    )
  },
)

JSXPreviewError.displayName = 'JSXPreviewError'
