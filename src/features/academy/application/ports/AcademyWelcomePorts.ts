import type { AcademyProgressRepository } from '@/features/academy/domain/AcademyProgressRepository'

export type AcademyWelcomeRepository = {
  prepare: () => Promise<void>
  isPending: () => Promise<boolean>
  claim: () => Promise<boolean>
}

export type AcademyWelcomePorts = {
  welcome: AcademyWelcomeRepository
  progress: AcademyProgressRepository
  ready: () => Promise<void>
  recordIntro: (action: 'dismiss' | 'skip') => Promise<void>
}
