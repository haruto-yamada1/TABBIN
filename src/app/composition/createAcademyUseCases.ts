import { createCompletePracticeStepUseCase } from '@/features/academy/application/use-cases/CompletePracticeStepUseCase'
import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createRecordIntroUseCase } from '@/features/academy/application/use-cases/RecordIntroUseCase'
import { createRecordVideoProgressUseCase } from '@/features/academy/application/use-cases/RecordVideoProgressUseCase'
import { createResetProgressUseCase } from '@/features/academy/application/use-cases/ResetProgressUseCase'
import { createSkipLessonUseCase } from '@/features/academy/application/use-cases/SkipLessonUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { createChromeAcademyProgressRepository } from '@/features/academy/infrastructure/ChromeAcademyProgressRepository'

export const createAcademyUseCases = () => {
  const ports = {
    repository: createChromeAcademyProgressRepository(),
    lessons: ACADEMY_LESSONS,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  }
  return {
    startLesson: createStartLessonUseCase(ports),
    recordVideoProgress: createRecordVideoProgressUseCase(ports),
    completePracticeStep: createCompletePracticeStepUseCase(ports),
    skipLesson: createSkipLessonUseCase(ports),
    resetProgress: createResetProgressUseCase(ports),
    recordIntro: createRecordIntroUseCase(ports),
    getProgress: createGetAcademyProgressUseCase(ports),
    exportRawProgress: async () => ports.repository.exportRaw(),
  }
}
