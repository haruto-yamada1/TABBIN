import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ACTIONS, EVENTS, Joyride } from 'react-joyride'
import type { EventData, TooltipRenderProps } from 'react-joyride'

import type { PracticeComposition } from '@/app/composition/createPracticeComposition'
import { usePracticeLesson } from '@/app/composition/usePracticeLesson'
import type { PracticeProgressUseCases } from '@/app/composition/usePracticeLesson'
import { Button } from '@/components/ui/button'
import type { DomainPracticeStep } from '@/features/academy/domain/domainPracticeLessons'
import { useI18n } from '@/features/i18n/context/I18nContext'

import { findVisibleGuideTarget } from './screenGuideTarget'

const TARGET_POLL_MS = 100
const SCROLL_DURATION_MS = 200

const messages = {
  en: {
    title: 'Practice steps',
    back: 'Previous step',
    retry: 'Retry step',
    skip: 'Skip practice',
    hint: 'Show hint',
    hide: 'Hide hint',
    complete: 'Practice complete',
    stopped: 'Practice skipped. Reset practice to start again.',
    pending:
      'Perform the operation in the sample UI. Only a successful change completes a step.',
    error:
      'Progress could not be saved. Your successful operations remain available to retry.',
    rewindError:
      'Practice state could not be restored. Retry the previous action or reset practice.',
    save: 'Retry saving progress',
    saving: 'Saving progress…',
    restart: 'Restart this lesson’s progress',
    obsolete:
      'This lesson’s progress or requirements have changed. Restart its progress and practice from the beginning. Other lessons are kept.',
    missing:
      'Open the controls described below to show the hint. You can always follow the text instructions.',
  },
  ja: {
    title: '練習の手順',
    back: '前の手順',
    retry: 'この手順をやり直す',
    skip: '練習をスキップ',
    hint: 'ヒントを表示',
    hide: 'ヒントを閉じる',
    complete: '練習を達成しました',
    stopped: '練習をスキップしました。リセットすると最初から練習できます。',
    pending:
      'サンプル画面で操作してください。成功した状態の変化だけで手順を達成します。',
    error: '進捗を保存できませんでした。成功した操作は、保存を再試行できます。',
    rewindError:
      '練習状態を戻せませんでした。直前の操作を再試行するか、練習をリセットしてください。',
    save: '進捗の保存を再試行',
    saving: '進捗を保存中…',
    restart: 'このレッスンの進捗をリセット',
    obsolete:
      'このレッスンの進捗または達成条件が変わっています。進捗をリセットして最初から練習してください。他のレッスンの進捗は保持されます。',
    missing:
      '下の手順で操作画面を開くとヒントを表示します。テキストだけでも進められます。',
  },
}

const HintTooltip = ({
  tooltipProps,
  step,
  closeProps,
}: TooltipRenderProps) => {
  const { language } = useI18n()
  const { role: _role, ...props } = tooltipProps
  return (
    <dialog
      {...props}
      open
      aria-label={messages[language].hint}
      data-academy-tour-ui=''
      className='static m-0 max-h-[70vh] w-[min(320px,calc(100vw-32px))] overflow-auto rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg'
    >
      <p className='text-sm'>{step.content}</p>
      <Button {...closeProps} className='mt-3'>
        {messages[language].hide}
      </Button>
    </dialog>
  )
}

const PracticeHint = ({ step }: { step: DomainPracticeStep }) => {
  const { language } = useI18n()
  const text = messages[language]
  const [hint, setHint] = useState(false)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (!hint) {
      return undefined
    }
    const check = () => {
      const next = findVisibleGuideTarget(`[data-tour="${step.dataTour}"]`)
      setTarget((current) => (current === next ? current : next))
    }
    check()
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
  }, [hint, step])
  const steps = useMemo(
    () => [
      {
        target: target ?? 'body',
        content: step.instruction[language],
        placement: 'auto' as const,
        floatingOptions: { shiftOptions: { padding: 16, crossAxis: true } },
      },
    ],
    [target, step, language],
  )
  const options = useMemo(
    () => ({
      skipBeacon: true,
      hideOverlay: true,
      blockTargetInteraction: false,
      scrollDuration: reducedMotion ? 0 : SCROLL_DURATION_MS,
      overlayClickAction: false as const,
      targetWaitTimeout: 1000,
      zIndex: 1000,
    }),
    [reducedMotion],
  )
  const handleEvent = useCallback((event: EventData) => {
    if (
      event.action === ACTIONS.CLOSE ||
      event.type === EVENTS.ERROR ||
      event.type === EVENTS.TARGET_NOT_FOUND
    ) {
      setHint(false)
    }
  }, [])
  const handleToggleHint = useCallback(() => {
    setHint((value) => !value)
  }, [])
  const portal = target?.closest<HTMLElement>('[role="dialog"]') ?? undefined
  return (
    <>
      <Button variant='ghost' onClick={handleToggleHint}>
        {hint ? text.hide : text.hint}
      </Button>
      {hint && !target ? <p className='text-sm'>{text.missing}</p> : null}
      {hint && target?.isConnected ? (
        <Joyride
          run
          steps={steps}
          options={options}
          tooltipComponent={HintTooltip}
          onEvent={handleEvent}
          {...(portal ? { portalElement: portal } : {})}
        />
      ) : null}
    </>
  )
}

type LessonState = ReturnType<typeof usePracticeLesson>
const PracticeFeedback = ({ state }: { state: LessonState }) => {
  const { language } = useI18n()
  const text = messages[language]
  const { retrySave: handleRetrySave, restartProgress: handleRestartProgress } =
    state
  return (
    <>
      {state.rewindFailed ? <p role='alert'>{text.rewindError}</p> : null}
      {state.error ? (
        <div role='alert'>
          <p>{state.requiresRestart ? text.obsolete : text.error}</p>
          {state.requiresRestart ? (
            <Button onClick={handleRestartProgress} disabled={state.saving}>
              {text.restart}
            </Button>
          ) : (
            <Button onClick={handleRetrySave} disabled={state.saving}>
              {text.save}
            </Button>
          )}
        </div>
      ) : null}
      {state.saving ? <output>{text.saving}</output> : null}
    </>
  )
}

export const PracticeLessonGuide = ({
  lessonId,
  composition,
  progress,
  onRewind,
}: {
  lessonId: string
  composition: PracticeComposition
  progress?: PracticeProgressUseCases | undefined
  onRewind: () => void
}) => {
  const { language } = useI18n()
  const text = messages[language]
  const state = usePracticeLesson(lessonId, composition, progress, onRewind)
  const step = state.steps[state.index]
  const { back: handleBack, retry: handleRetry, skip: handleSkip } = state
  let instruction = text.complete
  if (step) {
    instruction = step.instruction[language]
  }
  if (state.stopped) {
    instruction = text.stopped
  }
  if (!state.steps.length) {
    return null
  }
  return (
    <section
      data-tour='academy-practice-lesson'
      aria-label={text.title}
      className='space-y-3 border-b bg-background px-4 py-4 text-foreground'
    >
      <h2 className='font-semibold'>{text.title}</h2>
      <output
        data-tour='academy-practice-status'
        data-step={step?.stepId ?? 'complete'}
        className='block'
        aria-live='polite'
      >
        {state.index} / {state.steps.length}
      </output>
      <p className='max-w-4xl text-sm leading-6'>{instruction}</p>
      {step && !state.stopped ? (
        <p className='text-sm text-muted-foreground'>{text.pending}</p>
      ) : null}
      <PracticeFeedback state={state} />
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          onClick={handleBack}
          disabled={state.index === 0 || state.stopped}
        >
          {text.back}
        </Button>
        <Button
          variant='outline'
          onClick={handleRetry}
          disabled={state.stopped}
        >
          {text.retry}
        </Button>
        <Button variant='outline' onClick={handleSkip} disabled={state.stopped}>
          {text.skip}
        </Button>
        {step && !state.stopped ? (
          <PracticeHint key={step.stepId} step={step} />
        ) : null}
      </div>
    </section>
  )
}
