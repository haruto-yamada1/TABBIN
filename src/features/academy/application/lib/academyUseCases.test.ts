import { describe, expect, it } from 'vitest'

import type { AcademyPorts } from '@/features/academy/application/ports/AcademyPorts'
import { createCompletePracticeStepUseCase } from '@/features/academy/application/use-cases/CompletePracticeStepUseCase'
import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createRecordIntroUseCase } from '@/features/academy/application/use-cases/RecordIntroUseCase'
import { createRecordVideoProgressUseCase } from '@/features/academy/application/use-cases/RecordVideoProgressUseCase'
import { createResetProgressUseCase } from '@/features/academy/application/use-cases/ResetProgressUseCase'
import { createSkipLessonUseCase } from '@/features/academy/application/use-cases/SkipLessonUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import type { AcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type { Lesson } from '@/features/academy/domain/academySchemas'

const setup = () => {
  let state: AcademyState = emptyAcademyState()
  let time = 1000
  let ids = 0
  const lesson: Lesson = {
    lessonId: 'test-lesson',
    courseId: 'test-course',
    contentVersion: 1,
    assessmentVersion: 1,
    titleKey: 'academy.test.title',
    descriptionKey: 'academy.test.description',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisiteLessonIds: [],
    steps: [
      {
        stepId: 'test-step',
        instructionKey: 'academy.test.step',
        dataTour: 'test-target',
        practiceRequirement: {
          action: 'created-category',
          environment: 'academy-sandbox',
        },
      },
    ],
    assets: [
      {
        assetId: 'test-video',
        kind: 'video',
        locale: 'en',
        path: 'academy/videos/test.en.mp4',
        durationSeconds: 100,
        status: 'available',
      },
    ],
    mastery: { videoRequired: true, practiceStepIds: ['test-step'] },
  }
  const ports: AcademyPorts = {
    lessons: [lesson],
    now: () => time,
    newId: () => `attempt-${++ids}`,
    repository: {
      read: async () => structuredClone(state),
      update: async (change) => {
        state = change(structuredClone(state))
        return structuredClone(state)
      },
      exportRaw: async () => structuredClone(state),
    },
  }
  return {
    ports,
    lesson,
    read: () => state,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe('Academy application use-cases', () => {
  it('starts once, resumes with same token and preserves independent skip/intro facts', async () => {
    const { ports, read, advance } = setup()
    const start = createStartLessonUseCase(ports)
    const attempt = await start('test-lesson')
    advance(2000)
    await createSkipLessonUseCase(ports)(attempt)
    await createRecordIntroUseCase(ports)('dismiss')
    await createRecordIntroUseCase(ports)('skip')
    expect(await start('test-lesson')).toEqual(attempt)
    expect(read().lessons['test-lesson']?.startedAt).toBe(1000)
    expect(read().lessons['test-lesson']?.skippedAt).toBe(3000)
    expect(read().intro).toEqual({ dismissedAt: 3000, skippedAt: 3000 })
    expect(
      read().lessons['test-lesson']?.video.assets['test-video']?.watchedAt ??
        null,
    ).toBeNull()
  })

  it('records only a validated sandbox achievement; duplicates keep original timestamp', async () => {
    const { ports, read, advance } = setup()
    const attempt = await createStartLessonUseCase(ports)('test-lesson')
    const complete = createCompletePracticeStepUseCase(ports)
    await expect(
      complete({
        ...attempt,
        stepId: 'test-step',
        action: 'deleted-url',
        environment: 'academy-sandbox',
      }),
    ).rejects.toThrow('Academy command rejected:')
    await complete({
      ...attempt,
      stepId: 'test-step',
      action: 'created-category',
      environment: 'academy-sandbox',
    })
    advance(1000)
    await complete({
      ...attempt,
      stepId: 'test-step',
      action: 'created-category',
      environment: 'academy-sandbox',
    })
    expect(read().lessons['test-lesson']?.practice).toEqual({
      'test-step': 1000,
    })
    expect(
      read().lessons['test-lesson']?.video.assets['test-video']?.watchedAt ??
        null,
    ).toBeNull()
  })

  it('counts unique real-time playback and ignores seek, duplicate reports, pause and long gaps', async () => {
    const { ports, read, advance } = setup()
    const attempt = await createStartLessonUseCase(ports)('test-lesson')
    const record = createRecordVideoProgressUseCase(ports)
    const sample = {
      ...attempt,
      sessionId: 'session',
      assetId: 'test-video',
      playing: true,
      seeking: false,
    }
    await record({ ...sample, sequence: 0, positionSeconds: 0 })
    await Array.from({ length: 9 }, (_, index) => index + 1).reduce(
      async (previous, i) => {
        await previous
        advance(10000)
        await record({ ...sample, sequence: i, positionSeconds: i * 10 })
      },
      Promise.resolve(),
    )
    expect(
      read().lessons['test-lesson']?.video.assets['test-video']?.watchedAt ??
        null,
    ).not.toBeNull()
    expect(read().lessons['test-lesson']?.practice).toEqual({})
    const watched = structuredClone(read().lessons['test-lesson']?.video)
    advance(1000)
    await record({ ...sample, sequence: 9, positionSeconds: 100 })
    expect(read().lessons['test-lesson']?.video).toEqual(watched)
  })

  it('does not turn seeking or briefly replaying the same range into watched', async () => {
    const { ports, read, advance } = setup()
    const attempt = await createStartLessonUseCase(ports)('test-lesson')
    const record = createRecordVideoProgressUseCase(ports)
    const sample = {
      ...attempt,
      sessionId: 'seek',
      assetId: 'test-video',
      playing: true,
      seeking: false,
    }
    await record({ ...sample, sequence: 0, positionSeconds: 0 })
    advance(1000)
    await record({ ...sample, sequence: 1, positionSeconds: 95 })
    advance(10000)
    await record({
      ...sample,
      sequence: 2,
      positionSeconds: 100,
      playing: false,
    })
    advance(60000)
    await record({ ...sample, sequence: 3, positionSeconds: 100 })
    expect(
      read().lessons['test-lesson']?.video.assets['test-video']?.watchedAt ??
        null,
    ).toBeNull()
    expect(
      read().lessons['test-lesson']?.video.assets['test-video']?.ranges ?? [],
    ).toEqual([])
    // A fresh controller after leaving the page establishes a new baseline.
    const revisit = createRecordVideoProgressUseCase(ports)
    await revisit({
      ...sample,
      sessionId: 'revisit',
      sequence: 0,
      positionSeconds: 95,
    })
    expect(
      read().lessons['test-lesson']?.video.assets['test-video']?.watchedAt ??
        null,
    ).toBeNull()
  })

  it('explicit reset invalidates old tokens and keeps intro state', async () => {
    const { ports, read } = setup()
    const attempt = await createStartLessonUseCase(ports)('test-lesson')
    await createRecordIntroUseCase(ports)('skip')
    await createResetProgressUseCase(ports)('test-lesson')
    await expect(createSkipLessonUseCase(ports)(attempt)).rejects.toThrow(
      'Academy command rejected:',
    )
    const next = await createStartLessonUseCase(ports)('test-lesson')
    expect(next.generation).not.toBe(attempt.generation)
    expect(read().intro.skippedAt).toBe(1000)
    await expect(
      createCompletePracticeStepUseCase(ports)({
        ...attempt,
        stepId: 'test-step',
        action: 'created-category',
        environment: 'academy-sandbox',
      }),
    ).rejects.toThrow('Academy command rejected:')
  })

  it('rejects unknown lessons and treats prerequisites as a recommended learning order', async () => {
    const { ports, lesson, read } = setup()
    const start = createStartLessonUseCase({
      ...ports,
      lessons: [
        { ...lesson, prerequisiteLessonIds: ['prior'] },
        ...ACADEMY_LESSONS,
      ],
    })
    await expect(start('unknown')).rejects.toThrow('Academy command rejected:')
    expect(read().lessons).toEqual({})
    await expect(start('test-lesson')).resolves.toMatchObject({
      lessonId: 'test-lesson',
    })
    expect(
      (
        await createGetAcademyProgressUseCase({
          ...ports,
          lessons: [{ ...lesson, prerequisiteLessonIds: ['prior'] }],
        })()
      ).lessons[0]?.prerequisitesMet,
    ).toBe(false)
  })

  it('keeps compatible achievements and requires explicit restart on changed criteria', async () => {
    const { ports, lesson, read } = setup()
    const attempt = await createStartLessonUseCase(ports)('test-lesson')
    await createCompletePracticeStepUseCase(ports)({
      ...attempt,
      stepId: 'test-step',
      action: 'created-category',
      environment: 'academy-sandbox',
    })
    const compatible = { ...ports, lessons: [{ ...lesson, contentVersion: 2 }] }
    expect(await createStartLessonUseCase(compatible)('test-lesson')).toEqual(
      attempt,
    )
    expect(read().lessons['test-lesson']?.practice['test-step']).toBe(1000)
    const changed = {
      ...ports,
      lessons: [{ ...lesson, contentVersion: 3, assessmentVersion: 2 }],
    }
    await expect(
      createStartLessonUseCase(changed)('test-lesson'),
    ).rejects.toThrow('Academy command rejected:')
    expect(read().lessons['test-lesson']?.practice['test-step']).toBe(1000)
    await createResetProgressUseCase(changed)('test-lesson')
    await createStartLessonUseCase(changed)('test-lesson')
    expect(read().lessons['test-lesson']?.assessmentVersion).toBe(2)
  })

  it('returns independent facts through a DTO and resets all lessons explicitly', async () => {
    const { ports } = setup()
    await createStartLessonUseCase(ports)('test-lesson')
    await createRecordIntroUseCase(ports)('dismiss')
    const get = createGetAcademyProgressUseCase(ports)
    const before = await get()
    expect(before.summary.total).toBe(1)
    expect(before.lessons[0]).toMatchObject({
      inProgress: true,
      mastered: false,
      prerequisitesMet: true,
    })
    before.intro.dismissedAt = null
    expect((await get()).intro.dismissedAt).toBe(1000)
    await createResetProgressUseCase(ports)()
    expect((await get()).lessons[0]).toMatchObject({
      notStarted: true,
      generation: null,
    })
    expect((await get()).intro.dismissedAt).toBe(1000)
  })

  it('refuses unavailable videos and malformed playback reports', async () => {
    const { ports, lesson } = setup()
    const attempt = await createStartLessonUseCase(ports)('test-lesson')
    const command = {
      ...attempt,
      sessionId: 'session',
      sequence: 0,
      assetId: 'test-video',
      positionSeconds: 0,
      playing: true,
      seeking: false,
    }
    await expect(
      createRecordVideoProgressUseCase({
        ...ports,
        lessons: [
          {
            ...lesson,
            assets: lesson.assets.map((asset) => ({
              ...asset,
              status: 'planned',
            })),
          },
        ],
      })(command),
    ).rejects.toThrow('Academy command rejected:')
    await expect(
      createRecordVideoProgressUseCase(ports)({
        ...command,
        positionSeconds: Number.NaN,
      }),
    ).rejects.toThrow('Academy command rejected:')
    await expect(
      createRecordVideoProgressUseCase(ports)({ ...command, sequence: -1 }),
    ).rejects.toThrow('Academy command rejected:')
  })
})
