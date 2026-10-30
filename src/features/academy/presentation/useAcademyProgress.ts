import { useCallback, useEffect, useState } from 'react'

import type { AcademyProgressDto } from '@/features/academy/application/dto/AcademyProgressDto'

import type { AcademyUiUseCases } from './AcademyRoute.types'

export const useAcademyProgress = (useCases: AcademyUiUseCases) => {
  const [progress, setProgress] = useState<AcademyProgressDto | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  )
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(false)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadState('loading')
      try {
        const next = await useCases.getProgress()
        if (!cancelled) {
          setProgress(next)
          setLoadState('loaded')
        }
      } catch {
        if (!cancelled) {
          setLoadState('error')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [useCases, revision])
  const handleRetry = useCallback(() => {
    setRevision((value) => value + 1)
  }, [])
  const record = useCallback(
    async (lessonId: string, skip: boolean) => {
      setBusy(true)
      setActionError(false)
      try {
        const attempt = await useCases.startLesson(lessonId)
        if (skip) {
          await useCases.skipLesson(attempt)
        }
        setProgress(await useCases.getProgress())
      } catch {
        setActionError(true)
      } finally {
        setBusy(false)
      }
    },
    [useCases],
  )
  return { progress, loadState, handleRetry, busy, actionError, record }
}
