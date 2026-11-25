import type {
  AcademyPorts,
  LessonAttempt,
} from '@/features/academy/application/ports/AcademyPorts'
import {
  currentAttempt,
  findLesson,
} from '@/features/academy/application/services/AcademyProgressService'

export const createSkipLessonUseCase =
  (ports: AcademyPorts) =>
  async (attempt: LessonAttempt): Promise<void> => {
    const lesson = findLesson(ports, attempt.lessonId)
    await ports.repository.update((state) => {
      currentAttempt(state, lesson, attempt).skippedAt ??= ports.now()
      return state
    })
  }
