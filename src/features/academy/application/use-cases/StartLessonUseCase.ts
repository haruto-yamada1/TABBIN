import type {
  AcademyPorts,
  LessonAttempt,
} from '@/features/academy/application/ports/AcademyPorts'
import {
  AcademyCommandError,
  findLesson,
} from '@/features/academy/application/services/AcademyProgressService'
import { createLessonProgress } from '@/features/academy/domain/academyProgress'

export const createStartLessonUseCase =
  (ports: AcademyPorts) =>
  async (lessonId: string): Promise<LessonAttempt> => {
    const lesson = findLesson(ports, lessonId)
    const state = await ports.repository.update((state) => {
      const previous = state.lessons[lessonId]
      if (previous && previous.assessmentVersion !== lesson.assessmentVersion) {
        throw new AcademyCommandError('RELEARNING_REQUIRED')
      }
      const progress = previous ?? createLessonProgress(lesson, ports.newId())
      state.lessons[lessonId] = {
        ...progress,
        contentVersion: lesson.contentVersion,
        startedAt: progress.startedAt ?? ports.now(),
      }
      return state
    })
    const progress = state.lessons[lessonId]
    if (!progress) {
      throw new AcademyCommandError('STALE_ATTEMPT')
    }
    return { lessonId, generation: progress.generation }
  }
