import { useEffect, useState } from 'react'

import { recordLinkCaptureShortcut } from '@/lib/link-capture/shortcut'
import type {
  LinkCaptureShortcut,
  ShortcutError,
} from '@/lib/link-capture/shortcut'

const RECORDING_TIMEOUT_MS = 10000
export const useLinkCaptureRecorder = () => {
  const [recording, setRecording] = useState(false)
  const [candidate, setCandidate] = useState<LinkCaptureShortcut | null>(null)
  const [error, setError] = useState<ShortcutError | null>(null)
  useEffect(() => {
    if (!recording) {
      return undefined
    }
    let modifier: KeyboardEvent | null = null
    const capture = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') {
        setRecording(false)
        return
      }
      if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(event.code)) {
        modifier = event
        return
      }
      const result = recordLinkCaptureShortcut(event)
      if ('error' in result) {
        setError(result.error)
      } else {
        setCandidate(result.shortcut)
      }
      setRecording(false)
    }
    const release = (event: KeyboardEvent) => {
      if (modifier?.code !== event.code) {
        return
      }
      const result = recordLinkCaptureShortcut(modifier)
      if ('error' in result) {
        setError(result.error)
      } else {
        setCandidate(result.shortcut)
      }
      setRecording(false)
    }
    const cancel = () => {
      setRecording(false)
    }
    const visibility = () => {
      if (document.hidden) {
        cancel()
      }
    }
    const timer = window.setTimeout(() => {
      setRecording(false)
      setError('unavailable')
    }, RECORDING_TIMEOUT_MS)
    window.addEventListener('keydown', capture, true)
    window.addEventListener('keyup', release, true)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', capture, true)
      window.removeEventListener('keyup', release, true)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [recording])
  return {
    recording,
    candidate,
    error,
    start: () => {
      setCandidate(null)
      setError(null)
      setRecording(true)
    },
    cancel: () => {
      setRecording(false)
      setCandidate(null)
      setError(null)
    },
    clear: () => {
      setCandidate(null)
    },
  }
}
