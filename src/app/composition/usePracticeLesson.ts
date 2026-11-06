import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  PracticeBrowserAction,
  PracticeSnapshotDto,
} from '@/features/academy/application/dto/PracticeSessionDto'
import type { LessonAttempt } from '@/features/academy/application/ports/AcademyPorts'
import { AcademyCommandError } from '@/features/academy/application/services/AcademyProgressService'
import { isDomainPracticeStepComplete } from '@/features/academy/application/services/DomainPracticeAssessmentService'
import { getDomainPracticeSteps } from '@/features/academy/domain/domainPracticeLessons'

import type { createAcademyUseCases } from './createAcademyUseCases'
import type { PracticeComposition } from './createPracticeComposition'

export type PracticeProgressUseCases = Pick<
  ReturnType<typeof createAcademyUseCases>,
  'startLesson' | 'completePracticeStep' | 'skipLesson' | 'resetProgress'
>
type PracticeLessonSession = {
  index: number
  stopped: boolean
  rewinding: boolean
  previous: PracticeSnapshotDto
  actions: readonly PracticeBrowserAction[]
  checkpoints: (() => Promise<void>)[]
  pendingSkip: boolean
  pending: string[]
  attempt: LessonAttempt | null
  saving: boolean
}

/** Only committed memory changes enter the assessment and persistence queue. */
export const usePracticeLesson = (
  lessonId: string,
  composition: PracticeComposition,
  progress: PracticeProgressUseCases | undefined,
  onRewind: () => void,
) => {
  const steps = getDomainPracticeSteps(lessonId)
  const [index, setIndex] = useState(0)
  const [stopped, setStopped] = useState(false)
  const [error, setError] = useState(false)
  const [requiresRestart, setRequiresRestart] = useState(false)
  const [saving, setSaving] = useState(false)
  const sessionRef = useRef<PracticeLessonSession | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    // Only a committed mount owns an assessment session and its checkpoints.
    sessionRef.current = {
      index: 0,
      stopped: false,
      rewinding: false,
      previous: composition.getSnapshot(),
      actions: composition.getBrowserActions(),
      checkpoints: [composition.captureCheckpoint()],
      pendingSkip: false,
      pending: [],
      attempt: null,
      saving: false,
    }
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [composition])
  const save = useCallback(
    async function persist(): Promise<void> {
      const session = sessionRef.current
      if (!progress || !session || session.saving) {
        return
      }
      session.saving = true
      if (mounted.current) {
        setSaving(true)
        setError(false)
      }
      let succeeded = false
      try {
        session.attempt ??= await progress.startLesson(lessonId)
        const attempt = session.attempt
        const saveNext = async (): Promise<void> => {
          const id = session.pending[0]
          if (!id) {
            return
          }
          const step = steps.find(({ stepId }) => stepId === id)
          if (!step) {
            throw new Error('Unknown practice achievement')
          }
          await progress.completePracticeStep({
            ...attempt,
            stepId: step.stepId,
            action: step.action,
            environment: 'academy-sandbox',
          })
          session.pending.shift()
          await saveNext()
        }
        await saveNext()
        if (session.pendingSkip) {
          await progress.skipLesson(attempt)
          session.pendingSkip = false
        }
        succeeded = true
      } catch (error_) {
        if (mounted.current) {
          setRequiresRestart(
            error_ instanceof AcademyCommandError &&
              (error_.code === 'RELEARNING_REQUIRED' ||
                error_.code === 'STALE_ATTEMPT'),
          )
          setError(true)
        }
      } finally {
        session.saving = false
        // A committed operation can arrive between the last queue read and this
        // finalizer. Restart only a successful drain; failures require user retry.
        setSaving(false)
        if (succeeded && (session.pending.length > 0 || session.pendingSkip)) {
          void persist()
        }
      }
    },
    [lessonId, progress, steps],
  )

  useEffect(
    () =>
      composition.subscribe(() => {
        const session = sessionRef.current
        if (!session) {
          return
        }
        const after = composition.getSnapshot()
        const actions = composition.getBrowserActions()
        const step = steps[session.index]
        if (
          !session.stopped &&
          !session.rewinding &&
          step &&
          isDomainPracticeStepComplete({
            stepId: step.stepId,
            before: session.previous,
            after,
            beforeActions: session.actions,
            afterActions: actions,
          })
        ) {
          session.index += 1
          session.checkpoints[session.index] = composition.captureCheckpoint()
          setIndex(session.index)
          if (progress) {
            session.pending.push(step.stepId)
            void save()
          }
        }
        session.previous = after
        session.actions = actions
      }),
    [composition, progress, save, steps],
  )

  const rewind = useCallback(
    async (next: number) => {
      const session = sessionRef.current
      const restore = session?.checkpoints[next]
      if (!session || !restore || session.rewinding) {
        return
      }
      session.rewinding = true
      try {
        await restore()
        session.index = next
        session.checkpoints.length = next + 1
        session.previous = composition.getSnapshot()
        session.actions = composition.getBrowserActions()
        setIndex(next)
        onRewind()
      } catch {
        setError(true)
      } finally {
        session.rewinding = false
      }
    },
    [composition, onRewind],
  )
  const skip = useCallback(async () => {
    const session = sessionRef.current
    if (!session) {
      return
    }
    session.stopped = true
    setStopped(true)
    session.pendingSkip = true
    await rewind(0)
    await save()
  }, [rewind, save])
  const restartProgress = useCallback(async () => {
    const session = sessionRef.current
    if (!session || !progress || session.saving) {
      return
    }
    const wasStopped = session.stopped
    session.stopped = true
    session.saving = true
    setSaving(true)
    try {
      await progress.resetProgress(lessonId)
      // An explicit new attempt must not replay an obsolete generation's facts.
      session.attempt = null
      session.pending = []
      session.pendingSkip = false
      await rewind(0)
      session.stopped = false
      setStopped(false)
      setRequiresRestart(false)
      setError(false)
    } catch {
      session.stopped = wasStopped
      setError(true)
    } finally {
      session.saving = false
      setSaving(false)
    }
  }, [lessonId, progress, rewind])

  return {
    steps,
    index,
    stopped,
    error,
    requiresRestart,
    saving,
    back: () => {
      void rewind(Math.max(0, index - 1))
    },
    retry: () => {
      void rewind(Math.min(index, steps.length - 1))
    },
    retrySave: () => {
      void save()
    },
    restartProgress: () => {
      void restartProgress()
    },
    skip: () => {
      void skip()
    },
  }
}
