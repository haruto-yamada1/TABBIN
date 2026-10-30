import { createAcademyWelcomeCommands } from '@/features/academy/application/use-cases/AcademyWelcomeUseCases'
import { createRecordIntroUseCase } from '@/features/academy/application/use-cases/RecordIntroUseCase'
import { createChromeAcademyProgressRepository } from '@/features/academy/infrastructure/ChromeAcademyProgressRepository'
import { createChromeAcademyWelcomeRepository } from '@/features/academy/infrastructure/ChromeAcademyWelcomeRepository'

import { getPersistenceBootstrapRuntime } from './persistenceBootstrap'

export const createAcademyWelcomeUseCases = () => {
  const progress = createChromeAcademyProgressRepository()
  return createAcademyWelcomeCommands({
    welcome: createChromeAcademyWelcomeRepository(),
    progress,
    ready: async () => {
      const runtime = getPersistenceBootstrapRuntime()
      await runtime.bootstrap.ready()
      if (runtime.recovery.getSnapshot().status === 'unavailable') {
        throw new Error('Academy welcome initialization unavailable')
      }
    },
    recordIntro: createRecordIntroUseCase({
      repository: progress,
      lessons: [],
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
    }),
  })
}
