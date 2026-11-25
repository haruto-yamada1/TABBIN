import type { AcademyPorts } from '@/features/academy/application/ports/AcademyPorts'
import { findLesson } from '@/features/academy/application/services/AcademyProgressService'

/** Explicit user action; in-flight events retain an obsolete generation and are rejected. */
export const createResetProgressUseCase =
  (ports: AcademyPorts) =>
  async (lessonId?: string): Promise<void> => {
    if (lessonId !== undefined) {
      findLesson(ports, lessonId)
    }
    await ports.repository.update((state) => {
      if (lessonId === undefined) {
        state.lessons = {}
      } else {
        state.lessons = Object.fromEntries(
          Object.entries(state.lessons).filter(([id]) => id !== lessonId),
        )
      }
      return state
    })
  }
