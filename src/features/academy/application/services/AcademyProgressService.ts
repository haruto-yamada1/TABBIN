import type {
  AcademyPorts,
  LessonAttempt,
} from '@/features/academy/application/ports/AcademyPorts'
import { deriveLessonState } from '@/features/academy/domain/academyProgress'
import type { AcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type {
  Lesson,
  LessonProgress,
} from '@/features/academy/domain/academySchemas'

export class AcademyCommandError extends Error {
  readonly code: string
  constructor(
    code:
      | 'UNKNOWN_LESSON'
      | 'STALE_ATTEMPT'
      | 'RELEARNING_REQUIRED'
      | 'INVALID_EVENT'
      | 'VIDEO_UNAVAILABLE',
  ) {
    super(`Academy command rejected: ${code}`)
    this.name = 'AcademyCommandError'
    this.code = code
  }
}
export const findLesson = (ports: AcademyPorts, lessonId: string): Lesson => {
  const lesson = ports.lessons.find((item) => item.lessonId === lessonId)
  if (!lesson) {
    throw new AcademyCommandError('UNKNOWN_LESSON')
  }
  return lesson
}
export const currentAttempt = (
  state: AcademyState,
  lesson: Lesson,
  attempt: LessonAttempt,
): LessonProgress => {
  const progress = Object.hasOwn(state.lessons, lesson.lessonId)
    ? state.lessons[lesson.lessonId]
    : undefined
  if (!progress || progress.generation !== attempt.generation) {
    throw new AcademyCommandError('STALE_ATTEMPT')
  }
  if (progress.assessmentVersion !== lesson.assessmentVersion) {
    throw new AcademyCommandError('RELEARNING_REQUIRED')
  }
  return progress
}
export const prerequisitesMet = (
  ports: AcademyPorts,
  state: AcademyState,
  lesson: Lesson,
): boolean =>
  lesson.prerequisiteLessonIds.every((prerequisite) => {
    const prior = ports.lessons.find((item) => item.lessonId === prerequisite)
    return (
      prior !== undefined &&
      deriveLessonState(prior, state.lessons[prerequisite] ?? null).mastered
    )
  })
