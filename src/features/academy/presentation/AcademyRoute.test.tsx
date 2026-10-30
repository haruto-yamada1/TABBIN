// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createSkipLessonUseCase } from '@/features/academy/application/use-cases/SkipLessonUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type { AcademyState } from '@/features/academy/domain/AcademyProgressRepository'

import { AcademyRoute } from './AcademyRoute'
import type { AcademyRouteProps } from './AcademyRoute'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language: 'en', t: (key: string) => key }),
}))
afterEach(cleanup)
const createUseCases = () => {
  let state: AcademyState = emptyAcademyState()
  let timestamp = 100
  const ports = {
    lessons: ACADEMY_LESSONS,
    repository: {
      read: async () => structuredClone(state),
      exportRaw: async () => structuredClone(state),
      update: async (change: (value: AcademyState) => AcademyState) => {
        state = change(structuredClone(state))
        return structuredClone(state)
      },
    },
    now: () => timestamp++,
    newId: () => 'attempt-1',
  }
  return {
    getProgress: createGetAcademyProgressUseCase(ports),
    startLesson: createStartLessonUseCase(ports),
    skipLesson: createSkipLessonUseCase(ports),
  }
}
const show = (props: AcademyRouteProps, route = '/academy') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path='/academy' element={<AcademyRoute {...props} />} />
        <Route
          path='/academy/:lessonId'
          element={<AcademyRoute {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  )

describe('Academy learning screen', () => {
  it('opens a lesson from the course list without granting completion', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases })
    await user.click(
      await screen.findByRole('link', { name: /Install TABBIN/ }),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Install TABBIN' }),
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Learn by video' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      screen.getByRole('tab', { name: 'Practice with samples' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.getByText(
        /Videos, captions and playback controls are being prepared/,
      ),
    ).toBeTruthy()
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('opens isolated practice without granting practice completion', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases }, '/academy/parent-categories')
    await user.click(
      await screen.findByRole('tab', { name: 'Practice with samples' }),
    )
    expect(
      screen
        .getByRole('link', { name: 'Practice with samples' })
        .getAttribute('href'),
    ).toBe('practice.html?lessonId=parent-categories&lang=en')
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it.each(['domain-mode', 'save-tabs'])(
    'keeps %s screen explanations outside the sample adapter',
    async (lessonId) => {
      const useCases = createUseCases()
      const user = userEvent.setup()
      show({ useCases }, `/academy/${lessonId}`)
      await user.click(
        await screen.findByRole('tab', { name: 'Practice with samples' }),
      )
      expect(
        screen.queryByRole('link', { name: 'Practice with samples' }),
      ).toBeNull()
      expect(
        screen
          .getByRole('link', { name: 'Open the real screen' })
          .getAttribute('href'),
      ).toBe('/saved-tabs?mode=domain')
      expect((await useCases.getProgress()).summary.completed).toBe(0)
    },
  )

  it('preserves previous progress when skipping and reviewing a lesson', async () => {
    const useCases = createUseCases()
    await useCases.startLesson('save-tabs')
    const user = userEvent.setup()
    show({ useCases }, '/academy/install-extension')
    await user.click(
      await screen.findByRole('button', { name: 'Skip this lesson' }),
    )
    await waitFor(async () => {
      const data = await useCases.getProgress()
      expect(
        data.lessons.find((item) => item.lessonId === 'install-extension')
          ?.skipped,
      ).toBe(true)
    })
    expect(
      (await useCases.getProgress()).lessons.find(
        (item) => item.lessonId === 'save-tabs',
      )?.inProgress,
    ).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('resumes the latest active lesson while keeping skipped lessons out of resume', async () => {
    const useCases = createUseCases()
    await useCases.startLesson('install-extension')
    await useCases.startLesson('domain-mode')
    await useCases.skipLesson(await useCases.startLesson('pin-extension'))
    const user = userEvent.setup()
    show({ useCases })
    const resume = await screen.findByRole('link', {
      name: 'Continue where you left off',
    })
    expect(resume).toHaveAttribute('href', '/academy/domain-mode')
    await user.click(resume)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Explore Domain mode',
      }),
    ).toBeTruthy()
  })

  it('changes chapters and replays from the beginning without clearing or granting achievements', async () => {
    const useCases = createUseCases()
    await useCases.startLesson('domain-mode')
    const before = await useCases.getProgress()
    const user = userEvent.setup()
    show({ useCases }, '/academy/domain-mode')
    await user.click(
      await screen.findByRole('button', { name: 'Text guide 2' }),
    )
    expect(screen.getByRole('article')).toHaveTextContent('Expand a domain')
    await user.click(
      screen.getByRole('button', { name: 'Review from the beginning' }),
    )
    expect(screen.getByRole('article')).toHaveTextContent(
      'Open Domain mode from the sidebar',
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Review from the beginning' }),
      ).toBeEnabled()
    })
    expect(await useCases.getProgress()).toEqual(before)
  })

  it('keeps previous progress and allows retry after a write failure without exposing the error', async () => {
    const useCases = createUseCases()
    await useCases.startLesson('save-tabs')
    const before = await useCases.getProgress()
    const failing = {
      ...useCases,
      startLesson: vi
        .fn()
        .mockRejectedValueOnce(new Error('private storage detail'))
        .mockImplementation(useCases.startLesson),
    }
    const user = userEvent.setup()
    show({ useCases: failing }, '/academy/domain-mode')
    await user.click(
      await screen.findByRole('button', { name: 'Start this lesson' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save learning progress.',
    )
    expect(screen.queryByText(/private storage detail/)).toBeNull()
    expect(await useCases.getProgress()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Start this lesson' }))
    await screen.findByRole('button', { name: 'Review from the beginning' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      (await useCases.getProgress()).lessons.find(
        (item) => item.lessonId === 'save-tabs',
      )?.inProgress,
    ).toBe(true)
  })

  it('handles direct invalid URLs, empty catalogs and read failures with retry', async () => {
    const useCases = createUseCases()
    const first = show({ useCases }, '/academy/missing')
    expect(
      await screen.findByRole('heading', { name: 'Lesson not found' }),
    ).toBeTruthy()
    first.unmount()
    const empty = show({ useCases, lessons: [], courses: [] })
    expect(
      await screen.findByText('No lessons are available yet.'),
    ).toBeTruthy()
    empty.unmount()
    const failing = {
      ...useCases,
      getProgress: vi
        .fn()
        .mockRejectedValueOnce(new Error('private data'))
        .mockImplementation(useCases.getProgress),
    }
    show({ useCases: failing })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load learning progress.',
    )
    expect(screen.queryByText(/private data/)).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('link', { name: /Install TABBIN/ }),
    ).toBeTruthy()
  })
})
