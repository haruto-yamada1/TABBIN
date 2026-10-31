// @vitest-environment jsdom
import {
  act,
  cleanup,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRecordGuideViewedUseCase } from '@/features/academy/application/use-cases/RecordGuideViewedUseCase'
import { createSkipLessonUseCase } from '@/features/academy/application/use-cases/SkipLessonUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type { AcademyState } from '@/features/academy/domain/AcademyProgressRepository'

import { useScreenGuideController } from './useScreenGuideController'
import type { ScreenGuideUseCases } from './useScreenGuideController'

const rect = new DOMRect(0, 0, 80, 40)
const visibleRects = Object.assign([rect], {
  item: (index: number) => (index === 0 ? rect : null),
})
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(
    visibleRects,
  )
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const makeUseCases = () => {
  let state = emptyAcademyState()
  const ports = {
    lessons: ACADEMY_LESSONS,
    now: () => 100,
    newId: () => 'attempt',
    repository: {
      read: async () => structuredClone(state),
      exportRaw: async () => structuredClone(state),
      update: async (change: (previous: AcademyState) => AcademyState) => {
        state = change(structuredClone(state))
        return structuredClone(state)
      },
    },
  }
  return {
    useCases: {
      startLesson: vi.fn(createStartLessonUseCase(ports)),
      recordGuideViewed: vi.fn(createRecordGuideViewedUseCase(ports)),
      skipLesson: vi.fn(createSkipLessonUseCase(ports)),
    },
    read: () => state,
  }
}
const mount = (tour: string, mode?: string) => {
  const element = document.createElement('button')
  element.dataset.tour = tour
  if (mode) {
    element.dataset.mode = mode
  }
  document.body.append(element)
  return element
}
const mountDomain = () => {
  const url = mount('academy-saved-url')
  const domain = mount('academy-view-mode', 'domain')
  const custom = mount('academy-view-mode', 'custom')
  return { url, domain, custom }
}
const LocationMarker = () => {
  const location = useLocation()
  return (
    <output data-testid='guide-location'>
      {location.pathname}
      {location.search}
    </output>
  )
}
const LessonDestination = () => <p>Lesson</p>
const Wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/saved-tabs?mode=domain&guide=domain-mode']}>
    <LocationMarker />
    <Routes>
      <Route path='/saved-tabs' element={children} />
      <Route path='/academy/:lessonId' Component={LessonDestination} />
    </Routes>
  </MemoryRouter>
)
const renderController = (
  useCases: ScreenGuideUseCases,
  lessonId = 'domain-mode',
) =>
  renderHook(
    () => ({
      ...useScreenGuideController(lessonId, useCases),
      location: useLocation(),
    }),
    { wrapper: Wrapper },
  )

describe('screen-guide controller', () => {
  it('shows actual targets and navigates modes, then records guide viewing separately from mastery', async () => {
    const targets = mountDomain()
    const { useCases, read } = makeUseCases()
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    expect(result.current.target).toBe(targets.url)
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.domain))
    act(() => result.current.handleBack())
    await waitFor(() => expect(result.current.target).toBe(targets.url))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.domain))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.custom))
    expect(result.current.location.search).toBe(
      '?mode=custom&guide=domain-mode',
    )
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.phase).toBe('complete'))
    expect(read().lessons['domain-mode']).toMatchObject({
      guideViewedAt: 100,
      practice: {},
      video: { assets: {}, legacy: null },
    })
    act(() => result.current.handleReplay())
    await waitFor(() => expect(result.current.target).toBe(targets.url))
    await act(async () => result.current.handleSkip())
    expect(screen.getByTestId('guide-location').textContent).toBe(
      '/academy/domain-mode',
    )
    expect(read().lessons['domain-mode']).toMatchObject({
      guideViewedAt: 100,
      skippedAt: 100,
    })
  })

  it('retries a failed skip without granting guide completion', async () => {
    mountDomain()
    const { useCases, read } = makeUseCases()
    useCases.skipLesson.mockRejectedValueOnce(new Error('write unavailable'))
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    await act(async () => result.current.handleSkip())
    expect(result.current.phase).toBe('error')
    await act(async () => result.current.handleRetry())
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
    expect(read().lessons['domain-mode']?.guideViewedAt).toBeUndefined()
    expect(screen.getByTestId('guide-location').textContent).toBe(
      '/academy/domain-mode',
    )
  })

  it('keeps navigation locked while a skip is being persisted', async () => {
    const targets = mountDomain()
    const { useCases } = makeUseCases()
    let settleSkip: () => void = () => {}
    const pendingSkip = new Promise<void>((resolve) => {
      settleSkip = resolve
    })
    useCases.skipLesson.mockImplementationOnce(async () => pendingSkip)
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.domain))
    act(() => result.current.handleSkip())
    const revision = result.current.revision
    act(() => {
      result.current.handleNext()
      result.current.handleBack()
      result.current.handleReplay()
    })
    expect(result.current.phase).toBe('saving')
    expect(result.current.index).toBe(1)
    expect(result.current.revision).toBe(revision)
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
    await act(async () => settleSkip())
    expect(screen.getByTestId('guide-location').textContent).toBe(
      '/academy/domain-mode',
    )
  })

  it.each(['mounted', 'unavailable'] as const)(
    'keeps a pending skip visible when its delayed target becomes %s',
    async (targetState) => {
      vi.useFakeTimers()
      const { useCases } = makeUseCases()
      let settleSkip: () => void = () => {}
      const pendingSkip = new Promise<void>((resolve) => {
        settleSkip = resolve
      })
      useCases.skipLesson.mockImplementationOnce(async () => pendingSkip)
      const { result } = renderController(useCases)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.phase).toBe('loading')
      act(() => result.current.handleSkip())
      if (targetState === 'mounted') {
        mountDomain()
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000)
      })
      const revision = result.current.revision
      act(() => {
        result.current.handleRetry()
        result.current.handleBlocked()
      })
      expect(result.current.phase).toBe('saving')
      expect(result.current.revision).toBe(revision)
      expect(result.current.index).toBe(0)
      expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
      await act(async () => settleSkip())
      expect(screen.getByTestId('guide-location').textContent).toBe(
        '/academy/domain-mode',
      )
    },
  )

  it('keeps a failed skip visible when a target arrives after the failure', async () => {
    vi.useFakeTimers()
    const { useCases } = makeUseCases()
    useCases.skipLesson.mockRejectedValueOnce(new Error('write unavailable'))
    const { result } = renderController(useCases)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => result.current.handleSkip())
    expect(result.current.phase).toBe('error')
    mountDomain()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.phase).toBe('error')
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
  })

  it('lets Escape close the guide while focus is outside its not-yet-mounted tooltip', async () => {
    const user = userEvent.setup()
    const { useCases } = makeUseCases()
    const { result } = renderController(useCases)
    expect(result.current.phase).toBe('loading')
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('guide-location').textContent).toBe(
      '/academy/domain-mode',
    )
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
  })

  it('does not advance or record viewing when a target disappears, and can recover after remount', async () => {
    const targets = mountDomain()
    const { useCases } = makeUseCases()
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.domain))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.custom))
    targets.custom.remove()
    act(() => result.current.handleNext())
    expect(result.current.phase).toBe('blocked')
    act(() => result.current.handleNext())
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
    document.body.append(targets.custom)
    act(() => result.current.handleRetry())
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.phase).toBe('complete'))
    expect(useCases.recordGuideViewed).toHaveBeenCalledTimes(1)
  })

  it('observes hidden targets after display and makes unavailable steps skippable', async () => {
    const targets = mountDomain()
    const { useCases, read } = makeUseCases()
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    act(() => {
      targets.url.hidden = true
    })
    await waitFor(() => expect(result.current.phase).toBe('blocked'))
    await act(async () => result.current.handleSkip())
    expect(read().lessons['domain-mode']?.skippedAt).toBe(100)
    expect(read().lessons['domain-mode']?.guideViewedAt).toBeUndefined()
  })

  it('bounds missing targets and clears an interrupted wait on unmount', async () => {
    vi.useFakeTimers()
    const { useCases } = makeUseCases()
    const first = renderController(useCases)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(first.result.current.phase).toBe('loading')
    act(() => first.result.current.handleNext())
    expect(first.result.current.index).toBe(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(first.result.current.phase).toBe('blocked')
    act(() => first.result.current.handleRetry())
    first.unmount()
    expect(vi.getTimerCount()).toBe(0)
    mountDomain()
    const second = renderController(useCases)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(second.result.current.phase).toBe('showing')
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
  })

  it('retries starting progress after a persistence error without crediting viewing', async () => {
    mountDomain()
    const { useCases } = makeUseCases()
    useCases.startLesson.mockRejectedValueOnce(new Error('storage unavailable'))
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('error'))
    act(() => result.current.handleRetry())
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    expect(useCases.startLesson).toHaveBeenCalledTimes(2)
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
  })

  it('retries saving completed viewing and prevents duplicate completion while saving', async () => {
    const targets = mountDomain()
    const { useCases } = makeUseCases()
    useCases.recordGuideViewed.mockRejectedValueOnce(
      new Error('storage unavailable'),
    )
    const { result } = renderController(useCases)
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.domain))
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.target).toBe(targets.custom))
    act(() => {
      result.current.handleNext()
      result.current.handleNext()
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(useCases.recordGuideViewed).toHaveBeenCalledTimes(1)
    await act(async () => result.current.handleRetry())
    expect(result.current.phase).toBe('complete')
    expect(useCases.recordGuideViewed).toHaveBeenCalledTimes(2)
  })

  it('opens the real parent dialog, blocks mutations, and closes it before going back', async () => {
    const user = userEvent.setup()
    const parent = mount('academy-parent-categories')
    const edited = vi.fn()
    const edit = mount('edit-category')
    edit.addEventListener('click', edited)
    edit.addEventListener('keydown', edited)
    parent.addEventListener('click', () => {
      const dialog = document.createElement('section')
      dialog.dataset.tour = 'academy-parent-dialog'
      dialog.setAttribute('role', 'dialog')
      const close = document.createElement('button')
      close.dataset.slot = 'dialog-close'
      close.addEventListener('click', () => dialog.remove())
      dialog.append(close)
      document.body.append(dialog)
    })
    const { useCases } = makeUseCases()
    const { result, unmount } = renderController(useCases, 'parent-categories')
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    await user.click(edit)
    edit.focus()
    await user.keyboard('{Enter}')
    expect(edited).not.toHaveBeenCalled()
    const tourButton = mount('tour-ui')
    tourButton.dataset.academyTourUi = ''
    const tourAction = vi.fn()
    tourButton.addEventListener('click', tourAction)
    await user.click(tourButton)
    expect(tourAction).toHaveBeenCalledTimes(1)
    act(() => result.current.handleNext())
    await waitFor(() => expect(result.current.step.text).toBe('dialog'))
    await waitFor(() => expect(result.current.phase).toBe('showing'))
    expect(result.current.portal).toBe(screen.getByRole('dialog'))
    act(() => result.current.handleBack())
    await waitFor(() => expect(result.current.target).toBe(parent))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => result.current.handleBlocked())
    expect(result.current.phase).toBe('blocked')
    unmount()
    await user.click(edit)
    expect(edited).toHaveBeenCalledTimes(1)
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
  })

  it('can close before lesson initialization finishes without creating viewing evidence', async () => {
    const { useCases } = makeUseCases()
    useCases.startLesson.mockImplementationOnce(
      async () => new Promise(() => {}),
    )
    const { result } = renderController(useCases)
    act(() => result.current.handleStop())
    expect(screen.getByTestId('guide-location').textContent).toBe(
      '/academy/domain-mode',
    )
    expect(useCases.recordGuideViewed).not.toHaveBeenCalled()
  })
})
