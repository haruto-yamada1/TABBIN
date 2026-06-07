'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseCopyStateOptions {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const useCopyState = ({
  onCopy,
  onError,
  timeout = 2000,
}: UseCopyStateOptions) => {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)

  const copyText = useCallback(
// eslint-disable-next-line eslint/complexity
    async (text: string, { skipIfCopied = false } = {}) => {
      if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
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
// eslint-disable-next-line typescript/no-unsafe-type-assertion
        onError?.(error as Error)
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
