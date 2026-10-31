// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType, ReactNode } from 'react'
import { ACTIONS, EVENTS } from 'react-joyride'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AcademyScreenGuide } from './AcademyScreenGuide'
import type { useScreenGuideController } from './useScreenGuideController'

type Controller = ReturnType<typeof useScreenGuideController>
type TooltipViewProps = {
  tooltipProps: { role: string; 'aria-modal': boolean }
  step: { content: ReactNode }
  primaryProps: { 'data-action': string; 'aria-label': string }
}
type JoyrideViewProps = {
  tooltipComponent: ComponentType<TooltipViewProps>
  steps: { content: ReactNode }[]
  options: { scrollDuration: number; blockTargetInteraction: boolean }
  portalElement?: HTMLElement
  onEvent: (event: { action: string; type: string }) => void
}
let controller: Controller
let joyride: JoyrideViewProps | null
let reducedMotion = false
let language: 'ja' | 'en' = 'en'

vi.mock('./useScreenGuideController', () => ({
  useScreenGuideController: () => controller,
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language, t: (key: string) => key }),
}))
vi.mock('motion/react', () => ({ useReducedMotion: () => reducedMotion }))
// The real Joyride portal/focus integration is exercised in the browser suite.
// This adapter renders the product tooltip and lets tests deliver library lifecycle events.
vi.mock('react-joyride', async () => {
  const actual = await vi.importActual<{
    ACTIONS: typeof ACTIONS
    EVENTS: typeof EVENTS
  }>('react-joyride')
  return {
    ...actual,
    Joyride: (props: JoyrideViewProps) => {
      joyride = props
      const Tooltip = props.tooltipComponent
      return (
        <Tooltip
          tooltipProps={{ role: 'alertdialog', 'aria-modal': true }}
          primaryProps={{ 'data-action': 'primary', 'aria-label': 'Last' }}
          step={{ content: props.steps[0]?.content }}
        />
      )
    },
  }
})

beforeEach(() => {
  language = 'en'
  reducedMotion = false
  joyride = null
  controller = {
    phase: 'blocked',
    index: 0,
    count: 3,
    step: {
      selector: '[data-tour="academy-saved-url"]',
      mode: 'domain',
      text: 'url',
    },
    target: null,
    portal: undefined,
    revision: 0,
    handleNext: vi.fn(),
    handleBack: vi.fn(),
    handleRetry: vi.fn(),
    handleReplay: vi.fn(),
    handleSkip: vi.fn(),
    handleBlocked: vi.fn(),
    handleStop: vi.fn(),
  }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Academy screen-guide presentation', () => {
  it.each([
    ['loading', 'Waiting for the real screen…'],
    ['blocked', /This part of the screen is not available/],
    ['error', /Progress could not be saved/],
    ['complete', 'Screen guide viewed'],
    ['saving', 'Waiting for the real screen…'],
  ] as const)(
    'shows a clear %s state with an escape route',
    (phase, status) => {
      controller.phase = phase
      render(<AcademyScreenGuide lessonId='domain-mode' />)
      expect(screen.getByRole('dialog', { name: 'Screen guide' })).toBeTruthy()
      expect(screen.getByText(status)).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Back to lesson' }),
      ).toBeTruthy()
      expect(Boolean(screen.queryByRole('button', { name: 'Skip' }))).toBe(
        phase !== 'saving',
      )
      expect(Boolean(screen.queryByRole('button', { name: 'Retry' }))).toBe(
        phase === 'blocked' || phase === 'error',
      )
      expect(Boolean(screen.queryByRole('button', { name: 'Replay' }))).toBe(
        phase === 'complete',
      )
    },
  )

  it('offers retry, skip and close for an unavailable target without claiming completion', async () => {
    const user = userEvent.setup()
    render(<AcademyScreenGuide lessonId='domain-mode' />)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Back to lesson' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(controller.handleRetry).toHaveBeenCalledTimes(1)
    expect(controller.handleSkip).toHaveBeenCalledTimes(1)
    expect(controller.handleStop).toHaveBeenCalledTimes(2)
    expect(controller.handleNext).not.toHaveBeenCalled()
  })

  it('closes the fallback dialog with Escape and permits replay after completion', async () => {
    const user = userEvent.setup()
    controller.phase = 'complete'
    render(<AcademyScreenGuide lessonId='domain-mode' />)
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    expect(controller.handleReplay).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(controller.handleStop).toHaveBeenCalledTimes(1)
  })

  it('provides accessible step progress, navigation and a close button in the live-screen tooltip', async () => {
    const user = userEvent.setup()
    controller.phase = 'showing'
    controller.target = document.body
    const { rerender } = render(<AcademyScreenGuide lessonId='domain-mode' />)
    expect(screen.getByRole('dialog', { name: 'Screen guide' })).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Next' }).getAttribute('data-action'),
    ).toBe('primary')
    expect(screen.queryByRole('button', { name: 'Last' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(controller.handleNext).toHaveBeenCalledTimes(1)
    controller = {
      ...controller,
      index: 2,
      step: { ...controller.step, text: 'custom' },
    }
    rerender(<AcademyScreenGuide lessonId='domain-mode' />)
    expect(screen.getByText('3 / 3')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(controller.handleBack).toHaveBeenCalledTimes(1)
    expect(controller.handleNext).toHaveBeenCalledTimes(2)
    expect(controller.handleSkip).toHaveBeenCalledTimes(1)
    expect(controller.handleStop).toHaveBeenCalledTimes(1)
  })

  it('handles library close and lost-target events and minimizes scrolling for reduced motion', () => {
    controller.phase = 'showing'
    controller.target = document.body
    controller.portal = document.body
    reducedMotion = true
    render(<AcademyScreenGuide lessonId='parent-categories' />)
    expect(joyride?.options.scrollDuration).toBe(0)
    expect(joyride?.options.blockTargetInteraction).toBe(true)
    expect(joyride?.portalElement).toBe(document.body)
    act(() => {
      joyride?.onEvent({ action: ACTIONS.CLOSE, type: EVENTS.STEP_AFTER })
      joyride?.onEvent({ action: ACTIONS.START, type: EVENTS.TARGET_NOT_FOUND })
      joyride?.onEvent({ action: ACTIONS.START, type: EVENTS.ERROR })
      joyride?.onEvent({ action: ACTIONS.START, type: EVENTS.STEP_AFTER })
    })
    expect(controller.handleStop).toHaveBeenCalledTimes(1)
    expect(controller.handleBlocked).toHaveBeenCalledTimes(2)
  })

  it('uses Japanese guidance and keeps the unavailable-data explanation readable', () => {
    language = 'ja'
    render(<AcademyScreenGuide lessonId='domain-mode' />)
    expect(screen.getByRole('dialog', { name: '画面案内' })).toBeTruthy()
    expect(screen.getByText(/サンプルは追加しません/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
  })
})
