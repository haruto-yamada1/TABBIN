import type { AcademyProgressRepository } from '@/features/academy/domain/AcademyProgressRepository'

export type AcademyWelcomeRepository = {
  prepare: () => Promise<void>
  isPending: () => Promise<boolean>
  claim: () => Promise<boolean>
}

export type AcademyWelcomePorts = {
  welcome: AcademyWelcomeRepository
  progress: AcademyProgressRepository
  /** Required before presentation, independent of install-marker persistence. */
  ready: () => Promise<void>
  recordIntro: (action: 'dismiss' | 'skip') => Promise<void>
}
