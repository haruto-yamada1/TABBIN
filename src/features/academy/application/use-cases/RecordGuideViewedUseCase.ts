import type {
  AcademyPorts,
  LessonAttempt,
} from '@/features/academy/application/ports/AcademyPorts'
import {
  AcademyCommandError,
  currentAttempt,
  findLesson,
} from '@/features/academy/application/services/AcademyProgressService'

export const hasAcademyScreenGuide = (lessonId: string): boolean =>
  lessonId === 'domain-mode' || lessonId === 'parent-categories'

/** Called after every screen in a read-only guide was displayed successfully. */
export const createRecordGuideViewedUseCase =
  (ports: AcademyPorts) =>
  async (attempt: LessonAttempt): Promise<void> => {
    const lesson = findLesson(ports, attempt.lessonId)
    if (!hasAcademyScreenGuide(lesson.lessonId)) {
      throw new AcademyCommandError('INVALID_EVENT')
    }
    await ports.repository.update((state) => {
      const progress = currentAttempt(state, lesson, attempt)
      progress.guideViewedAt ??= ports.now()
      return state
    })
  }
