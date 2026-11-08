// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createRecordVideoProgressUseCase } from '@/features/academy/application/use-cases/RecordVideoProgressUseCase'
import { createSkipLessonUseCase } from '@/features/academy/application/use-cases/SkipLessonUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type { AcademyState } from '@/features/academy/domain/AcademyProgressRepository'

import { AcademyRoute } from './AcademyRoute'
import type { AcademyRouteProps } from './AcademyRoute'

const uiLanguage = vi.hoisted(() => ({ value: 'en' as 'ja' | 'en' }))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language: uiLanguage.value, t: (key: string) => key }),
}))
afterEach(() => {
  cleanup()
  uiLanguage.value = 'en'
})
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
    recordVideoProgress: createRecordVideoProgressUseCase(ports),
  }
}
const renderRoute = (props: AcademyRouteProps, route = '/academy') => (
  <MemoryRouter initialEntries={[route]}>
    <Routes>
      <Route path='/academy' element={<AcademyRoute {...props} />} />
      <Route path='/academy/:lessonId' element={<AcademyRoute {...props} />} />
    </Routes>
  </MemoryRouter>
)
const show = (props: AcademyRouteProps, route = '/academy') =>
  render(renderRoute(props, route))

describe('Academy learning screen', () => {
  it('loads a bilingual video only after requesting playback', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases }, '/academy/pin-extension')
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    expect(
      screen.queryByLabelText<HTMLVideoElement>('Learn by video', {
        selector: 'video',
      }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    const video = screen.getByLabelText<HTMLVideoElement>('Learn by video', {
      selector: 'video',
    })
    expect(video).toHaveAttribute('preload', 'metadata')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute(
      'poster',
      'academy/videos/pin-extension.poster.jpg',
    )
    expect(video).toHaveAttribute('src', 'academy/videos/pin-extension.en.mp4')
    expect(screen.getByLabelText('Playback speed')).toHaveValue('1')
    expect(screen.getByLabelText('Captions')).toHaveValue('en')
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('changes speed and captions without granting viewing and stops media when leaving video', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases }, '/academy/pin-extension')
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    const video = screen.getByLabelText<HTMLVideoElement>('Learn by video', {
      selector: 'video',
    })
    await user.selectOptions(screen.getByLabelText('Playback speed'), '2')
    expect(video?.playbackRate).toBe(2)
    await user.selectOptions(screen.getByLabelText('Captions'), 'ja')
    expect(screen.getByLabelText('Captions')).toHaveValue('ja')
    await user.selectOptions(screen.getByLabelText('Captions'), 'off')
    expect(screen.getByLabelText('Captions')).toHaveValue('off')
    await user.click(screen.getByRole('tab', { name: 'Read the guide' }))
    expect(
      screen.queryByLabelText<HTMLVideoElement>('Learn by video', {
        selector: 'video',
      }),
    ).toBeNull()
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('recovers from a progress write failure on the next playback event', async () => {
    const useCases = createUseCases()
    const recordVideoProgress = vi
      .fn(useCases.recordVideoProgress)
      .mockRejectedValueOnce(new Error('write unavailable'))
    const user = userEvent.setup()
    show(
      { useCases: { ...useCases, recordVideoProgress } },
      '/academy/pin-extension',
    )
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    const video = screen.getByLabelText<HTMLVideoElement>('Learn by video', {
      selector: 'video',
    })
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    fireEvent.play(video)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save learning progress',
    )
    video.currentTime = 1
    fireEvent.timeUpdate(video)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('replays from zero and reports a rejected play operation without claiming completion', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases }, '/academy/pin-extension')
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    const video = screen.getByLabelText<HTMLVideoElement>('Learn by video', {
      selector: 'video',
    })
    vi.spyOn(video, 'pause').mockImplementation(() => undefined)
    const play = vi
      .spyOn(video, 'play')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('play denied'))
    video.currentTime = 8
    await user.click(screen.getByRole('button', { name: 'Replay video' }))
    expect(video.currentTime).toBe(0)
    await waitFor(() => expect(play).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Replay video' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The video could not play',
    )
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('applies the selected caption to actual text tracks after metadata loads', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases }, '/academy/pin-extension')
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    const video = screen.getByLabelText<HTMLVideoElement>('Learn by video', {
      selector: 'video',
    })
    const tracks = [
      { language: 'ja', mode: 'disabled' },
      { language: 'en', mode: 'disabled' },
    ]
    Object.defineProperty(video, 'textTracks', {
      configurable: true,
      value: tracks,
    })
    fireEvent.loadedMetadata(video)
    expect(tracks.map((track) => track.mode)).toEqual(['disabled', 'showing'])
    await user.selectOptions(screen.getByLabelText('Captions'), 'ja')
    expect(tracks.map((track) => track.mode)).toEqual(['showing', 'disabled'])
    await user.selectOptions(screen.getByLabelText('Captions'), 'off')
    expect(tracks.every((track) => track.mode === 'disabled')).toBe(true)
  })

  it('records playback events using the real media state and keeps seeking separate', async () => {
    const useCases = createUseCases()
    const recordVideoProgress = vi.fn(useCases.recordVideoProgress)
    const user = userEvent.setup()
    show(
      { useCases: { ...useCases, recordVideoProgress } },
      '/academy/pin-extension',
    )
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    const video = screen.getByLabelText<HTMLVideoElement>('Learn by video', {
      selector: 'video',
    })
    Object.defineProperties(video, {
      paused: { configurable: true, value: false },
      seeking: { configurable: true, value: false },
    })
    video.currentTime = 1
    fireEvent.play(video)
    await waitFor(() =>
      expect(recordVideoProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonId: 'pin-extension',
          assetId: 'pin-extension-en',
          positionSeconds: 1,
          playing: true,
          seeking: false,
          playbackRate: 1,
        }),
      ),
    )
    Object.defineProperty(video, 'seeking', { configurable: true, value: true })
    video.currentTime = 15
    fireEvent.seeking(video)
    await waitFor(() =>
      expect(recordVideoProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ positionSeconds: 15, seeking: true }),
      ),
    )
    expect((await useCases.getProgress()).summary.completed).toBe(0)
    fireEvent.error(video)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The video could not play',
    )
  })

  it('keeps content and media available after switching language without autoplay', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    const { rerender } = show({ useCases }, '/academy/pin-extension')
    await user.click(await screen.findByRole('tab', { name: 'Learn by video' }))
    await user.click(screen.getByRole('button', { name: 'Load video' }))
    uiLanguage.value = 'ja'
    rerender(renderRoute({ useCases }, '/academy/pin-extension'))
    expect(screen.getByRole('heading', { name: '拡張機能を固定' })).toBeTruthy()
    expect(
      screen.queryByLabelText<HTMLVideoElement>('Learn by video', {
        selector: 'video',
      }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: '動画を読み込む' }))
    const video = screen.getByLabelText<HTMLVideoElement>('動画で学ぶ', {
      selector: 'video',
    })
    expect(video).toHaveAttribute('src', 'academy/videos/pin-extension.ja.mp4')
    expect(video).not.toHaveAttribute('autoplay')
    expect(screen.getByLabelText('字幕')).toHaveValue('ja')
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('offers a read-only guide independently of sample practice', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases }, '/academy/domain-mode')
    await user.click(await screen.findByRole('tab', { name: 'Screen guide' }))
    expect(
      screen
        .getByRole('link', { name: 'Start screen guide' })
        .getAttribute('href'),
    ).toBe('/saved-tabs?mode=domain&guide=domain-mode')
    expect((await useCases.getProgress()).summary.completed).toBe(0)
  })

  it('opens a lesson from the course list without granting completion', async () => {
    const useCases = createUseCases()
    const user = userEvent.setup()
    show({ useCases })
    await user.click(
      await screen.findByRole('link', { name: /Pin the extension/ }),
    )
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Pin the extension',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Learn by video' })).toBeEnabled()
    expect(
      screen.getByRole('tab', { name: 'Practice with samples' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.queryByText(
        /Videos, captions and playback controls are being prepared/,
      ),
    ).toBeNull()
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
    show({ useCases }, '/academy/pin-extension')
    await user.click(
      await screen.findByRole('button', { name: 'Skip this lesson' }),
    )
    await waitFor(async () => {
      const data = await useCases.getProgress()
      expect(
        data.lessons.find((item) => item.lessonId === 'pin-extension')?.skipped,
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
    await useCases.startLesson('pin-extension')
    await useCases.startLesson('domain-mode')
    await useCases.skipLesson(await useCases.startLesson('save-tabs'))
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
      await screen.findByRole('link', { name: /Pin the extension/ }),
    ).toBeTruthy()
  })
})
