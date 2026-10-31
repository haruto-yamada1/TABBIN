import { useReducedMotion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ACTIONS, EVENTS, Joyride } from 'react-joyride'
import type { EventData, Step, TooltipRenderProps } from 'react-joyride'

import { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { useScreenGuideText } from './screenGuideMessages'
import { useScreenGuideController } from './useScreenGuideController'
import type { ScreenGuideUseCases } from './useScreenGuideController'

const SCROLL_DURATION_MS = 200
const productionUseCases = createAcademyUseCases()
const GuideContext = createContext<ReturnType<
  typeof useScreenGuideController
> | null>(null)
const handleTooltipKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
  if (event.key === 'Tab') {
    event.stopPropagation()
  }
}

const GuideTooltip = ({
  tooltipProps,
  step,
  backProps,
  primaryProps,
  skipProps,
  closeProps,
}: TooltipRenderProps) => {
  const { role: _role, ...dialogProps } = tooltipProps
  const state = useContext(GuideContext)
  const text = useScreenGuideText()
  if (!state) {
    return null
  }
  return (
    <dialog
      {...dialogProps}
      open
      onKeyDown={handleTooltipKeyDown}
      data-academy-tour-ui=''
      aria-label={text.title}
      className='static m-0 max-h-[80vh] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl'
    >
      <h2 className='font-semibold'>{text.title}</h2>
      <p className='my-2 text-sm' aria-live='polite'>
        {state.index + 1} / {state.count}
      </p>
      <p className='text-sm leading-6'>{step.content}</p>
      <p className='mt-3 text-xs text-muted-foreground'>{text.safe}</p>
      <div className='mt-4 flex flex-wrap gap-2'>
        {state.index > 0 ? (
          <Button
            {...backProps}
            variant='outline'
            aria-label={text.back}
            title={text.back}
            onClick={state.handleBack}
          >
            {text.back}
          </Button>
        ) : null}
        <Button
          {...primaryProps}
          aria-label={state.index === state.count - 1 ? text.finish : text.next}
          title={state.index === state.count - 1 ? text.finish : text.next}
          onClick={state.handleNext}
        >
          {state.index === state.count - 1 ? text.finish : text.next}
        </Button>
        <Button
          {...skipProps}
          variant='outline'
          aria-label={text.skip}
          title={text.skip}
          onClick={state.handleSkip}
        >
          {text.skip}
        </Button>
        <Button
          {...closeProps}
          variant='ghost'
          aria-label={text.close}
          title={text.close}
          onClick={state.handleStop}
        >
          {text.close}
        </Button>
      </div>
    </dialog>
  )
}

export const AcademyScreenGuide = ({
  lessonId,
  useCases = productionUseCases,
}: {
  lessonId: string
  useCases?: ScreenGuideUseCases
}) => {
  const state = useScreenGuideController(lessonId, useCases)
  const { handleStop, handleBlocked } = state
  const text = useScreenGuideText()
  const reducedMotion = useReducedMotion()
  const steps = useMemo<Step[]>(
    () => [
      {
        target: state.target ?? 'body',
        content: text[state.step.text],
        placement: 'auto',
        floatingOptions: { shiftOptions: { padding: 16, crossAxis: true } },
      },
    ],
    [state.target, state.step.text, text],
  )
  const options = useMemo(
    () => ({
      skipBeacon: true,
      blockTargetInteraction: true,
      overlayClickAction: false as const,
      dismissKeyAction: 'close' as const,
      scrollDuration: reducedMotion ? 0 : SCROLL_DURATION_MS,
      targetWaitTimeout: 1000,
      zIndex: 1000,
    }),
    [reducedMotion],
  )
  const handleEvent = useCallback(
    (event: EventData) => {
      if (event.action === ACTIONS.CLOSE) {
        handleStop()
      } else if (
        event.type === EVENTS.TARGET_NOT_FOUND ||
        event.type === EVENTS.ERROR
      ) {
        handleBlocked()
      }
    },
    [handleStop, handleBlocked],
  )
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleStop()
      }
    },
    [handleStop],
  )
  let statusText: string = text.loading
  if (state.phase === 'complete') {
    statusText = text.saved
  } else if (state.phase === 'blocked') {
    statusText = text.unavailable
  } else if (state.phase === 'error') {
    statusText = text.error
  }
  return (
    <GuideContext value={state}>
      {state.phase === 'showing' && state.target ? (
        <Joyride
          key={`${state.index}-${state.revision}`}
          run
          continuous
          steps={steps}
          options={options}
          tooltipComponent={GuideTooltip}
          onEvent={handleEvent}
          {...(state.portal ? { portalElement: state.portal } : {})}
        />
      ) : (
        <Dialog open onOpenChange={handleOpenChange}>
          <DialogContent
            data-academy-tour-ui=''
            className='max-h-[85vh] overflow-y-auto'
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle>{text.title}</DialogTitle>
            </DialogHeader>
            <output>{statusText}</output>
            <p className='text-sm text-muted-foreground'>{text.safe}</p>
            <div className='flex flex-wrap gap-2'>
              {state.phase === 'complete' ? (
                <Button onClick={state.handleReplay}>{text.replay}</Button>
              ) : null}
              {state.phase === 'blocked' || state.phase === 'error' ? (
                <Button onClick={state.handleRetry}>{text.retry}</Button>
              ) : null}
              {state.phase !== 'saving' ? (
                <Button variant='outline' onClick={state.handleSkip}>
                  {text.skip}
                </Button>
              ) : null}
              <Button variant='outline' onClick={state.handleStop}>
                {text.return}
              </Button>
              <Button variant='ghost' onClick={state.handleStop}>
                {text.close}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </GuideContext>
  )
}
