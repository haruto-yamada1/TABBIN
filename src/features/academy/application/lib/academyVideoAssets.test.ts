import { describe, expect, it, vi } from 'vitest'

import type {
  AcademyPorts,
  LessonAttempt,
} from '@/features/academy/application/ports/AcademyPorts'
import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createRecordVideoProgressUseCase } from '@/features/academy/application/use-cases/RecordVideoProgressUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { createChromeAcademyProgressRepository } from '@/features/academy/infrastructure/ChromeAcademyProgressRepository'

const setup = (japaneseDuration = 60, initial?: unknown) => {
  const base = ACADEMY_LESSONS[0]
  if (!base) {
    throw new Error('Initial catalog must contain a lesson')
  }
  let raw = initial
  let time = 1000
  const storage = {
    get: async (key: string) => ({ [key]: structuredClone(raw) }),
    set: async (values: Record<string, unknown>) => {
      raw = structuredClone(values.academyProgressV1)
    },
  }
  const repository = createChromeAcademyProgressRepository({
    storage,
    runExclusive: async (operation) => operation(),
  })
  const ports: AcademyPorts = {
    lessons: [
      {
        ...base,
        assets: [
          {
            assetId: 'english-video',
            kind: 'video',
            locale: 'en',
            path: 'academy/videos/install-extension.en.mp4',
            status: 'available',
            durationSeconds: 100,
          },
          {
            assetId: 'japanese-video',
            kind: 'video',
            locale: 'ja',
            path: 'academy/videos/install-extension.ja.mp4',
            status: 'available',
            durationSeconds: japaneseDuration,
          },
        ],
      },
    ],
    repository,
    now: () => time,
    newId: () => 'attempt-one',
  }
  return {
    ports,
    storage,
    advance: () => {
      time += 1000
    },
    raw: () => raw,
  }
}
const play = async (
  context: ReturnType<typeof setup>,
  record: ReturnType<typeof createRecordVideoProgressUseCase>,
  attempt: LessonAttempt,
  assetId: string,
  start: number,
  end: number,
) => {
  const sample = {
    ...attempt,
    sessionId: `session-${assetId}-${start}`,
    assetId,
    playing: true,
    seeking: false,
  }
  await record({ ...sample, sequence: 0, positionSeconds: start })
  await Array.from({ length: end - start }, (_, index) => index + 1).reduce(
    async (previous, sequence) => {
      await previous
      context.advance()
      await record({ ...sample, sequence, positionSeconds: start + sequence })
    },
    Promise.resolve(),
  )
}
const legacy = (watched = false) => ({
  schemaVersion: 1,
  intro: { dismissedAt: 7, skippedAt: 8 },
  lessons: {
    'install-extension': {
      lessonId: 'install-extension',
      contentVersion: 1,
      assessmentVersion: 1,
      generation: 'existing-attempt',
      startedAt: 2,
      skippedAt: 3,
      video: {
        durationSeconds: 100,
        ranges: [[0, watched ? 90 : 1]],
        watchedAt: watched ? 4 : null,
      },
      practice: { 'prior-step': 5 },
    },
  },
})

describe('asset-specific Academy video evidence', () => {
  it('finishes a shorter language video after partially watching a longer one, including after reopening storage', async () => {
    const context = setup()
    const attempt = await createStartLessonUseCase(context.ports)(
      'install-extension',
    )
    const record = createRecordVideoProgressUseCase(context.ports)
    await play(context, record, attempt, 'english-video', 0, 1)
    await play(context, record, attempt, 'japanese-video', 0, 54)
    const reopened = createChromeAcademyProgressRepository({
      storage: context.storage,
      runExclusive: async (operation) => operation(),
    })
    const progress = await createGetAcademyProgressUseCase({
      ...context.ports,
      repository: reopened,
    })()
    expect(progress.lessons[0]).toMatchObject({
      videoWatched: true,
      mastered: true,
      generation: attempt.generation,
    })
    expect(progress.lessons[0]?.videoWatchedAt).not.toBeNull()
    expect(await reopened.exportRaw()).toMatchObject({
      schemaVersion: 2,
      lessons: {
        'install-extension': {
          video: {
            assets: {
              'english-video': {
                durationSeconds: 100,
                ranges: [[0, 1]],
                watchedAt: null,
              },
              'japanese-video': { durationSeconds: 60, ranges: [[0, 54]] },
            },
          },
        },
      },
    })
  })

  it('initializes the duration of an empty persisted asset before crediting playback', async () => {
    const context = setup()
    const attempt = await createStartLessonUseCase(context.ports)(
      'install-extension',
    )
    await context.ports.repository.update((state) => {
      const progress = state.lessons['install-extension']
      if (!progress) {
        throw new Error('Expected started lesson')
      }
      progress.video.assets['english-video'] = {
        durationSeconds: null,
        ranges: [],
        watchedAt: null,
      }
      return state
    })
    await play(
      context,
      createRecordVideoProgressUseCase(context.ports),
      attempt,
      'english-video',
      0,
      2,
    )
    expect(context.raw()).toMatchObject({
      lessons: {
        'install-extension': {
          video: {
            assets: {
              'english-video': {
                durationSeconds: 100,
                ranges: [[0, 2]],
                watchedAt: null,
              },
            },
          },
        },
      },
    })
  })

  it('does not combine intervals across language assets even when durations match', async () => {
    const context = setup(100)
    const attempt = await createStartLessonUseCase(context.ports)(
      'install-extension',
    )
    const record = createRecordVideoProgressUseCase(context.ports)
    await play(context, record, attempt, 'english-video', 0, 50)
    await play(context, record, attempt, 'japanese-video', 50, 100)
    expect(
      (await createGetAcademyProgressUseCase(context.ports)()).lessons[0],
    ).toMatchObject({ videoWatched: false, mastered: false })
    await play(context, record, attempt, 'english-video', 50, 90)
    expect(
      (await createGetAcademyProgressUseCase(context.ports)()).lessons[0],
    ).toMatchObject({ videoWatched: true, mastered: true })
  })

  it('preserves v1 achievements as unattributed legacy evidence and writes v2 only with a changed command', async () => {
    const initial = legacy(true)
    const context = setup(60, initial)
    const before = await createGetAcademyProgressUseCase(context.ports)()
    expect(before.lessons[0]).toMatchObject({
      mastered: true,
      generation: 'existing-attempt',
      startedAt: 2,
      skippedAt: 3,
      videoWatchedAt: 4,
      completedPracticeStepIds: ['prior-step'],
    })
    expect(await context.ports.repository.exportRaw()).toEqual(initial)
    await context.ports.repository.update((state) => {
      state.intro.skippedAt = 9
      return state
    })
    expect(context.raw()).toMatchObject({
      schemaVersion: 2,
      intro: { dismissedAt: 7, skippedAt: 9 },
      lessons: {
        'install-extension': {
          generation: 'existing-attempt',
          video: {
            legacy: initial.lessons['install-extension'].video,
            assets: {},
          },
        },
      },
    })
    expect(
      (await createGetAcademyProgressUseCase(context.ports)()).lessons[0]
        ?.mastered,
    ).toBe(true)
  })

  it('does not mix migrated unscoped partial ranges into a new asset', async () => {
    const context = setup(100, legacy())
    const attempt = await createStartLessonUseCase(context.ports)(
      'install-extension',
    )
    await play(
      context,
      createRecordVideoProgressUseCase(context.ports),
      attempt,
      'japanese-video',
      1,
      90,
    )
    expect(
      (await createGetAcademyProgressUseCase(context.ports)()).lessons[0],
    ).toMatchObject({ videoWatched: false, mastered: false })
  })
})

describe('legacy Academy migration failure recovery', () => {
  it('preserves the original v1 record on failed write and safely retries migration', async () => {
    const initial = legacy(true)
    const context = setup(60, initial)
    vi.spyOn(context.storage, 'set').mockRejectedValueOnce(new Error('quota'))
    const update = async () =>
      context.ports.repository.update((state) => {
        state.intro.dismissedAt = 20
        return state
      })
    await expect(update()).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    expect(context.raw()).toEqual(initial)
    expect(
      (await createGetAcademyProgressUseCase(context.ports)()).lessons[0]
        ?.mastered,
    ).toBe(true)
    await update()
    expect(context.raw()).toMatchObject({
      schemaVersion: 2,
      intro: { dismissedAt: 20 },
    })
    expect(
      (await createGetAcademyProgressUseCase(context.ports)()).lessons[0]
        ?.videoWatchedAt,
    ).toBe(4)
  })
})
