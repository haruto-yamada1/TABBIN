'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type UseCopyStateOptions = {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

type ClipboardWriter = Pick<Clipboard, 'writeText'>

const hasClipboardWrite = (value: unknown): value is ClipboardWriter =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'writeText') === 'function'

export const useCopyState = ({
  onCopy,
  onError,
  timeout = 2000,
}: UseCopyStateOptions) => {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)

  const copyText = useCallback(
    async (text: string, { skipIfCopied = false } = {}) => {
      if (
        typeof window === 'undefined' ||
        !hasClipboardWrite(Reflect.get(navigator, 'clipboard'))
      ) {
        onError?.(new Error('Clipboard API not available'))
        return
      }

      if (skipIfCopied && isCopied) {
        return
      }

      try {
        await navigator.clipboard.writeText(text)
        setIsCopied(true)
        onCopy?.()
        timeoutRef.current = window.setTimeout(() => {
          setIsCopied(false)
        }, timeout)
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    },
    [isCopied, onCopy, onError, timeout],
  )

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  return { copyText, isCopied }
}
