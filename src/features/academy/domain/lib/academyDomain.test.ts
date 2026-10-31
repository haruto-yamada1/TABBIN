import { describe, expect, it } from 'vitest'

import {
  ACADEMY_COURSES,
  ACADEMY_LESSONS,
  ACADEMY_MESSAGES,
  validateCatalog,
} from '@/features/academy/domain/academyCatalog'
import {
  aggregateProgress,
  createLessonProgress,
  deriveLessonState,
} from '@/features/academy/domain/academyProgress'
import {
  lessonAssetSchema,
  lessonProgressSchema,
  lessonSchema,
} from '@/features/academy/domain/academySchemas'
import type {
  Course,
  Lesson,
  VideoEvidence,
} from '@/features/academy/domain/academySchemas'

const practiceStep = {
  stepId: 'save-tabs-success',
  instructionKey: 'academy.save.step',
  dataTour: 'save-tabs',
  practiceRequirement: {
    action: 'save-tabs',
    environment: 'academy-sandbox' as const,
  },
}
const videoAsset = {
  assetId: 'save-tabs-en',
  kind: 'video' as const,
  locale: 'en' as const,
  path: 'academy/videos/save-tabs.en.mp4',
  durationSeconds: 60,
  status: 'available' as const,
}
const lesson: Lesson = {
  lessonId: 'save-tabs',
  courseId: 'basics',
  contentVersion: 1,
  assessmentVersion: 1,
  titleKey: 'academy.save.title',
  descriptionKey: 'academy.save.description',
  difficulty: 'beginner',
  estimatedMinutes: 2,
  prerequisiteLessonIds: [],
  steps: [
    {
      stepId: 'save-tabs-success',
      instructionKey: 'academy.save.step',
      dataTour: 'save-tabs',
      practiceRequirement: {
        action: 'save-tabs',
        environment: 'academy-sandbox',
      },
    },
  ],
  assets: [
    {
      assetId: 'save-tabs-en',
      kind: 'video',
      locale: 'en',
      path: 'academy/videos/save-tabs.en.mp4',
      durationSeconds: 60,
      status: 'available',
    },
  ],
  mastery: { videoRequired: false, practiceStepIds: ['save-tabs-success'] },
}
const course: Course = {
  courseId: 'basics',
  titleKey: 'academy.basics.title',
  lessonIds: ['save-tabs'],
}
const fresh = () => createLessonProgress(lesson, 'generation-1')

const scopedVideo = (evidence: VideoEvidence) => ({
  assets: { [videoAsset.assetId]: evidence },
  legacy: null,
})

describe('Academy catalog contract', () => {
  it('publishes eight stable bilingual chapter scenarios with valid references', () => {
    expect(ACADEMY_LESSONS.length).toBeGreaterThanOrEqual(8)
    expect(() =>
      validateCatalog(ACADEMY_COURSES, ACADEMY_LESSONS),
    ).not.toThrow()
    for (const item of ACADEMY_LESSONS) {
      expect(lessonSchema.safeParse(item).success).toBe(true)
      for (const locale of ['ja', 'en'] as const) {
        const messages: Record<string, string> = ACADEMY_MESSAGES[locale]
        for (const key of [
          item.titleKey,
          item.descriptionKey,
          ...item.steps.map((step) => step.instructionKey),
        ]) {
          expect(messages[key]).toBeTruthy()
        }
      }
    }
  })

  it('rejects duplicate lesson/step IDs and broken or cyclic prerequisites', () => {
    expect(() => validateCatalog([course], [lesson, lesson])).toThrow(/Academy/)
    expect(() =>
      validateCatalog(
        [course],
        [{ ...lesson, steps: [...lesson.steps, ...lesson.steps] }],
      ),
    ).toThrow(/Academy/)
    expect(() =>
      validateCatalog(
        [course],
        [{ ...lesson, prerequisiteLessonIds: ['missing'] }],
      ),
    ).toThrow(/Academy/)
    expect(() =>
      validateCatalog(
        [course],
        [{ ...lesson, prerequisiteLessonIds: ['save-tabs'] }],
      ),
    ).toThrow(/Academy/)
    const second: Lesson = {
      ...lesson,
      lessonId: 'restore-tabs',
      steps: [{ ...practiceStep, stepId: 'restore-success' }],
      prerequisiteLessonIds: ['save-tabs'],
      mastery: { videoRequired: false, practiceStepIds: ['restore-success'] },
    }
    expect(() =>
      validateCatalog(
        [{ ...course, lessonIds: ['save-tabs', 'restore-tabs'] }],
        [{ ...lesson, prerequisiteLessonIds: ['restore-tabs'] }, second],
      ),
    ).toThrow(/Academy/)
  })

  it('rejects invalid course membership, practice requirements and incomplete mastery', () => {
    expect(() => validateCatalog([], [lesson])).toThrow(/Academy/)
    expect(() =>
      validateCatalog([{ ...course, lessonIds: ['missing'] }], [lesson]),
    ).toThrow(/Academy/)
    expect(() =>
      validateCatalog(
        [course],
        [
          {
            ...lesson,
            mastery: { videoRequired: false, practiceStepIds: ['missing'] },
          },
        ],
      ),
    ).toThrow(/Academy/)
    expect(() =>
      validateCatalog(
        [course],
        [{ ...lesson, mastery: { videoRequired: false, practiceStepIds: [] } }],
      ),
    ).toThrow(/Academy/)
    expect(() =>
      validateCatalog(
        [course],
        [{ ...lesson, steps: [{ ...practiceStep, dataTour: null }] }],
      ),
    ).toThrow(/Academy/)
  })

  it('admits only local video paths and valid bounded progress records', () => {
    expect(
      lessonAssetSchema.safeParse({
        ...lesson.assets[0],
        path: 'https://example.com/video.mp4',
      }).success,
    ).toBe(false)
    expect(
      lessonAssetSchema.safeParse({
        ...lesson.assets[0],
        path: 'academy/videos/../save-tabs.en.mp4',
      }).success,
    ).toBe(false)
    expect(
      lessonSchema.safeParse({ ...lesson, contentVersion: 0 }).success,
    ).toBe(false)
    expect(lessonProgressSchema.safeParse(fresh()).success).toBe(true)
    expect(
      lessonProgressSchema.safeParse({
        ...fresh(),
        video: scopedVideo({
          durationSeconds: 60,
          ranges: [[20, 10]],
          watchedAt: null,
        }),
      }).success,
    ).toBe(false)
    expect(
      lessonProgressSchema.safeParse({
        ...fresh(),
        video: scopedVideo({
          durationSeconds: 60,
          ranges: [[0, 61]],
          watchedAt: null,
        }),
      }).success,
    ).toBe(false)
    expect(
      lessonProgressSchema.safeParse({
        ...fresh(),
        practice: { 'save-tabs-success': -1 },
      }).success,
    ).toBe(false)
  })
})

describe('Academy independent achievement facts', () => {
  it('counts screen-guide viewing as activity without granting video or practice mastery', () => {
    const progress = { ...fresh(), guideViewedAt: 20 }
    expect(deriveLessonState(lesson, progress)).toMatchObject({
      notStarted: false,
      inProgress: true,
      videoWatched: false,
      practiceCompleted: false,
      mastered: false,
    })
  })

  it('separates skip, start, video viewing, practice and derived mastery', () => {
    const progress = fresh()
    expect(deriveLessonState(lesson, progress).notStarted).toBe(true)
    progress.skippedAt = 10
    expect(deriveLessonState(lesson, progress)).toMatchObject({
      skipped: true,
      notStarted: true,
      mastered: false,
    })
    progress.startedAt = 20
    progress.video = scopedVideo({
      durationSeconds: 60,
      ranges: [[0, 55]],
      watchedAt: 30,
    })
    expect(deriveLessonState(lesson, progress)).toMatchObject({
      inProgress: true,
      videoWatched: true,
      practiceCompleted: false,
      mastered: false,
      skipped: true,
    })
    progress.practice['save-tabs-success'] = 40
    expect(deriveLessonState(lesson, progress)).toMatchObject({
      practiceCompleted: true,
      mastered: true,
      inProgress: false,
      skipped: true,
    })
  })

  it('requires video-only lessons to meet viewing facts and does not auto-complete missing media', () => {
    const videoOnly = {
      ...lesson,
      mastery: { videoRequired: true, practiceStepIds: [] },
    }
    expect(deriveLessonState(videoOnly, fresh()).mastered).toBe(false)
    const watched = {
      ...fresh(),
      video: scopedVideo({
        durationSeconds: 60,
        ranges: [[0, 54] as [number, number]],
        watchedAt: 30,
      }),
    }
    expect(deriveLessonState(videoOnly, watched)).toMatchObject({
      mastered: true,
      practiceCompleted: false,
    })
    expect(
      deriveLessonState({ ...videoOnly, assets: [] }, watched).mastered,
    ).toBe(false)
    expect(
      deriveLessonState(
        { ...videoOnly, assets: [{ ...videoAsset, status: 'planned' }] },
        watched,
      ).mastered,
    ).toBe(false)
  })

  it('preserves compatible content updates and requires re-learning for changed criteria without clearing facts', () => {
    const progress = fresh()
    progress.startedAt = 1
    progress.practice['save-tabs-success'] = 2
    expect(
      deriveLessonState({ ...lesson, contentVersion: 2 }, progress),
    ).toMatchObject({ mastered: true, relearning: false })
    expect(
      deriveLessonState({ ...lesson, assessmentVersion: 2 }, progress),
    ).toMatchObject({
      mastered: false,
      practiceCompleted: true,
      relearning: true,
    })
    expect(progress.practice['save-tabs-success']).toBe(2)
    expect(
      deriveLessonState(lesson, { ...progress, lessonId: 'unknown' }),
    ).toMatchObject({ notStarted: true, mastered: false })
  })

  it('computes current catalog denominators despite addition/removal/reordering and ignores unknown IDs', () => {
    const progress = fresh()
    progress.practice['save-tabs-success'] = 1
    const unknown = { ...progress, lessonId: 'unknown' }
    const added = { ...lesson, lessonId: 'restore-tabs' }
    expect(
      aggregateProgress([lesson], { 'save-tabs': progress, unknown }),
    ).toEqual({
      total: 1,
      denominator: 1,
      completed: 1,
      reviewable: 1,
      inProgress: 0,
      relearning: 0,
    })
    expect(
      aggregateProgress([added, lesson], { 'save-tabs': progress, unknown }),
    ).toMatchObject({ denominator: 2, completed: 1 })
    expect(aggregateProgress([], { 'save-tabs': progress })).toMatchObject({
      denominator: 0,
      completed: 0,
    })
    expect(
      aggregateProgress([{ ...lesson, assessmentVersion: 2 }], {
        'save-tabs': progress,
      }),
    ).toMatchObject({
      completed: 0,
      reviewable: 1,
      relearning: 1,
      inProgress: 1,
    })
  })
})

describe('Academy viewing coverage and combined requirements', () => {
  it('counts a viewed interval only once and never treats a seek position as watched', () => {
    const progress = fresh()
    progress.video = scopedVideo({
      durationSeconds: 60,
      ranges: [
        [0, 20],
        [0, 20],
        [10, 30],
      ],
      watchedAt: 2,
    })
    expect(deriveLessonState(lesson, progress).videoWatched).toBe(false)
    const evidence = progress.video.assets[videoAsset.assetId]
    if (!evidence) {
      throw new Error('Expected per-asset evidence')
    }
    evidence.ranges = [[50, 60]]
    expect(deriveLessonState(lesson, progress).videoWatched).toBe(false)
    evidence.ranges = [[0, 60]]
    evidence.watchedAt = null
    expect(deriveLessonState(lesson, progress).videoWatched).toBe(false)
  })

  it('requires both video and practice when the scenario defines both', () => {
    const combined = {
      ...lesson,
      mastery: { ...lesson.mastery, videoRequired: true },
    }
    const progress = fresh()
    progress.practice['save-tabs-success'] = 1
    expect(deriveLessonState(combined, progress).mastered).toBe(false)
    progress.video = scopedVideo({
      durationSeconds: 60,
      ranges: [[0, 54]],
      watchedAt: 2,
    })
    expect(deriveLessonState(combined, progress).mastered).toBe(true)
    expect(
      deriveLessonState(
        { ...combined, assets: [{ ...videoAsset, durationSeconds: 120 }] },
        progress,
      ).mastered,
    ).toBe(false)
  })

  it('treats an unknown progress record and an empty catalog as unstarted', () => {
    expect(deriveLessonState(lesson, null)).toMatchObject({
      notStarted: true,
      skipped: false,
      mastered: false,
    })
    expect(aggregateProgress([lesson, lesson], {})).toMatchObject({
      total: 1,
      denominator: 1,
      completed: 0,
    })
  })

  it('rejects duplicate courses, duplicate asset IDs and repeated course membership', () => {
    expect(() => validateCatalog([course, course], [lesson])).toThrow(
      /duplicate/,
    )
    expect(() =>
      validateCatalog(
        [{ ...course, lessonIds: ['save-tabs', 'save-tabs'] }],
        [lesson],
      ),
    ).toThrow(/duplicate/)
    expect(() =>
      validateCatalog(
        [course],
        [{ ...lesson, assets: [...lesson.assets, ...lesson.assets] }],
      ),
    ).toThrow(/duplicate/)
    expect(() =>
      validateCatalog(
        [course],
        [
          {
            ...lesson,
            mastery: { videoRequired: true, practiceStepIds: [] },
            assets: [],
          },
        ],
      ),
    ).toThrow(/invalid achievement/)
  })
})

describe('Academy course membership validation', () => {
  it('rejects omitted lessons and references to another owning course', () => {
    const otherLesson: Lesson = {
      ...lesson,
      lessonId: 'restore-tabs',
      steps: [{ ...practiceStep, stepId: 'restore-success' }],
      mastery: { videoRequired: false, practiceStepIds: ['restore-success'] },
    }
    expect(() => validateCatalog([course], [lesson, otherLesson])).toThrow(
      'Academy lesson has no owning course',
    )
    expect(() =>
      validateCatalog([{ ...course, courseId: 'recovery' }], [lesson]),
    ).toThrow('Academy course contains an invalid lesson reference')
  })
})
