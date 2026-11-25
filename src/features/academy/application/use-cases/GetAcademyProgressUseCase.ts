import type { AcademyProgressDto } from '@/features/academy/application/dto/AcademyProgressDto'
import type { AcademyPorts } from '@/features/academy/application/ports/AcademyPorts'
import { prerequisitesMet } from '@/features/academy/application/services/AcademyProgressService'
import {
  aggregateProgress,
  deriveLessonState,
  getVideoWatchedAt,
} from '@/features/academy/domain/academyProgress'

export const createGetAcademyProgressUseCase =
  (ports: AcademyPorts) => async (): Promise<AcademyProgressDto> => {
    const state = await ports.repository.read()
    return {
      lessons: ports.lessons.map((lesson) => {
        const progress = state.lessons[lesson.lessonId]
        return {
          prerequisitesMet: prerequisitesMet(ports, state, lesson),
          lessonId: lesson.lessonId,
          generation: progress?.generation ?? null,
          contentVersion: lesson.contentVersion,
          startedAt: progress?.startedAt ?? null,
          skippedAt: progress?.skippedAt ?? null,
          guideViewedAt: progress?.guideViewedAt ?? null,
          videoWatchedAt: progress ? getVideoWatchedAt(progress) : null,
          completedPracticeStepIds: Object.keys(progress?.practice ?? {}),
          ...deriveLessonState(lesson, progress ?? null),
        }
      }),
      summary: aggregateProgress(ports.lessons, state.lessons),
      intro: { ...state.intro },
    }
  }
