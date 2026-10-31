import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'
import type { LessonAttempt } from '@/features/academy/application/ports/AcademyPorts'

import { findVisibleGuideTarget, waitForGuideTarget } from './screenGuideTarget'

export type ScreenGuideUseCases = Pick<
  ReturnType<typeof createAcademyUseCases>,
  'startLesson' | 'recordGuideViewed' | 'skipLesson'
>
export type ScreenGuidePhase =
  | 'loading'
  | 'showing'
  | 'blocked'
  | 'saving'
  | 'complete'
  | 'error'
export type ScreenGuideStep = {
  selector: string
  mode: 'domain' | 'custom'
  text: 'url' | 'domain' | 'custom' | 'parents' | 'dialog'
}
const TARGET_POLL_MS = 100
const domainSteps: [ScreenGuideStep, ...ScreenGuideStep[]] = [
  { selector: '[data-tour="academy-saved-url"]', mode: 'domain', text: 'url' },
  {
    selector: '[data-tour="academy-view-mode"][data-mode="domain"]',
    mode: 'domain',
    text: 'domain',
  },
  {
    selector: '[data-tour="academy-view-mode"][data-mode="custom"]',
    mode: 'custom',
    text: 'custom',
  },
]
const parentSteps: [ScreenGuideStep, ...ScreenGuideStep[]] = [
  {
    selector: '[data-tour="academy-parent-categories"]',
    mode: 'domain',
    text: 'parents',
  },
  {
    selector: '[data-tour="academy-parent-dialog"]',
    mode: 'domain',
    text: 'dialog',
  },
]

export const useScreenGuideController = (
  lessonId: string,
  useCases: ScreenGuideUseCases,
) => {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [revision, setRevision] = useState(0)
  const [attempt, setAttempt] = useState<LessonAttempt | null>(null)
  const [phase, setPhase] = useState<ScreenGuidePhase>('loading')
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [portal, setPortal] = useState<HTMLElement | undefined>()
  const targetPreparation = useRef<AbortController | null>(null)
  const actionInFlight = useRef(false)
  const failedAction = useRef<'finish' | 'skip' | 'start'>('start')
  const safeClick = useRef(false)
  const mounted = useRef(true)
  const steps = lessonId === 'domain-mode' ? domainSteps : parentSteps
  const step = steps[index] ?? domainSteps[0]
  const returnToLesson = useCallback(() => {
    void navigate(`/academy/${lessonId}`)
  }, [navigate, lessonId])
  const closeOwnedDialog = useCallback(() => {
    const close = document.querySelector<HTMLButtonElement>(
      '[data-tour="academy-parent-dialog"] [data-slot="dialog-close"]',
    )
    safeClick.current = true
    close?.click()
    safeClick.current = false
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      closeOwnedDialog()
    }
  }, [closeOwnedDialog])
  useEffect(() => {
    if (attempt) {
      return undefined
    }
    let cancelled = false
    void useCases
      .startLesson(lessonId)
      .then((value) => {
        if (!cancelled) {
          setAttempt(value)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt, lessonId, useCases, revision])
  useEffect(() => {
    if (!attempt) {
      return undefined
    }
    const abort = new AbortController()
    targetPreparation.current = abort
    const prepare = async () => {
      if (step.text !== 'dialog') {
        closeOwnedDialog()
      }
      void navigate(`/saved-tabs?mode=${step.mode}&guide=${lessonId}`, {
        replace: true,
      })
      if (step.text === 'dialog') {
        const button = await waitForGuideTarget(
          '[data-tour="academy-parent-categories"]',
          abort.signal,
        )
        if (!findVisibleGuideTarget(step.selector)) {
          safeClick.current = true
          button.click()
          safeClick.current = false
        }
      }
      const element = await waitForGuideTarget(step.selector, abort.signal)
      if (abort.signal.aborted) {
        return
      }
      const modal = element.closest<HTMLElement>(
        '[data-tour="academy-parent-dialog"]',
      )
      setPortal(modal ?? undefined)
      setTarget(element)
      if (!actionInFlight.current) {
        setPhase('showing')
      }
    }
    void prepare().catch(() => {
      if (!abort.signal.aborted && !actionInFlight.current) {
        setPhase('blocked')
      }
    })
    return () => {
      abort.abort()
      if (targetPreparation.current === abort) {
        targetPreparation.current = null
      }
    }
  }, [attempt, index, revision, step, lessonId, navigate, closeOwnedDialog])
  useEffect(() => {
    if (phase !== 'showing' || !target) {
      return undefined
    }
    const check = () => {
      if (!actionInFlight.current && !findVisibleGuideTarget(step.selector)) {
        setPhase('blocked')
      }
    }
    const observer = new MutationObserver(check)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    })
    const interval = setInterval(check, TARGET_POLL_MS)
    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [phase, target, step.selector])
  // The live screen remains visible, but all user mutations are blocked throughout the guide.
  useEffect(() => {
    const guard = (event: Event) => {
      if (
        safeClick.current ||
        (event.target instanceof Element &&
          event.target.closest('[data-academy-tour-ui]'))
      ) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        returnToLesson()
      }
    }
    const events = [
      'click',
      'auxclick',
      'dblclick',
      'pointerdown',
      'keydown',
      'contextmenu',
    ]
    events.forEach((name) => {
      document.addEventListener(name, guard, true)
    })
    return () => {
      events.forEach((name) => {
        document.removeEventListener(name, guard, true)
      })
    }
  }, [returnToLesson])
  const finish = useCallback(async () => {
    if (!attempt || actionInFlight.current) {
      return
    }
    actionInFlight.current = true
    failedAction.current = 'finish'
    setPhase('saving')
    try {
      await useCases.recordGuideViewed(attempt)
      if (mounted.current) {
        closeOwnedDialog()
        setPhase('complete')
      }
    } catch {
      if (mounted.current) {
        setPhase('error')
      }
    } finally {
      actionInFlight.current = false
    }
  }, [attempt, useCases, closeOwnedDialog])
  const handleNext = useCallback(() => {
    if (phase !== 'showing' || actionInFlight.current) {
      return
    }
    if (!findVisibleGuideTarget(step.selector)) {
      setPhase('blocked')
      return
    }
    if (index === steps.length - 1) {
      void finish()
    } else {
      setPhase('loading')
      setIndex((value) => value + 1)
    }
  }, [phase, step.selector, index, steps.length, finish])
  const handleBack = useCallback(() => {
    if (actionInFlight.current) {
      return
    }
    setPhase('loading')
    setIndex((value) => Math.max(0, value - 1))
  }, [])
  const handleReplay = useCallback(() => {
    if (actionInFlight.current) {
      return
    }
    setPhase('loading')
    setIndex(0)
    setRevision((value) => value + 1)
  }, [])
  const skip = useCallback(async () => {
    if (actionInFlight.current) {
      return
    }
    actionInFlight.current = true
    failedAction.current = 'skip'
    targetPreparation.current?.abort()
    setPhase('saving')
    try {
      if (attempt) {
        await useCases.skipLesson(attempt)
      }
      if (mounted.current) {
        returnToLesson()
      }
    } catch {
      if (mounted.current) {
        setPhase('error')
      }
    } finally {
      actionInFlight.current = false
    }
  }, [attempt, useCases, returnToLesson])
  const handleRetry = useCallback(() => {
    if (actionInFlight.current) {
      return
    }
    if (phase === 'error' && failedAction.current === 'skip') {
      void skip()
    } else if (
      phase === 'error' &&
      failedAction.current === 'finish' &&
      attempt
    ) {
      void finish()
    } else {
      setPhase('loading')
      setRevision((value) => value + 1)
    }
  }, [phase, attempt, finish, skip])
  const handleSkip = useCallback(() => {
    void skip()
  }, [skip])
  const handleBlocked = useCallback(() => {
    if (!actionInFlight.current) {
      setPhase('blocked')
    }
  }, [])
  return {
    phase,
    index,
    count: steps.length,
    step,
    target,
    portal,
    revision,
    handleNext,
    handleBack,
    handleRetry,
    handleReplay,
    handleSkip,
    handleBlocked,
    handleStop: returnToLesson,
  }
}
