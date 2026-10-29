import type { AcademyProgressRepository } from '@/features/academy/domain/AcademyProgressRepository'
import type { Lesson } from '@/features/academy/domain/academySchemas'

export type AcademyPorts = {
  repository: AcademyProgressRepository
  lessons: readonly Lesson[]
  now: () => number
  newId: () => string
}

export type LessonAttempt = { lessonId: string; generation: string }
export type VideoProgressCommand = LessonAttempt & {
  sessionId: string
  sequence: number
  assetId: string
  positionSeconds: number
  playing: boolean
  seeking: boolean
}
export type PracticeStepCommand = LessonAttempt & {
  stepId: string
  action: string
  environment: string
}
