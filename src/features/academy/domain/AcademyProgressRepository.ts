import type { LessonProgress } from './academySchemas'

export type AcademyState = {
  schemaVersion: 1
  lessons: Record<string, LessonProgress>
  intro: { dismissedAt: number | null; skippedAt: number | null }
}

export type AcademyProgressRepository = {
  read: () => Promise<AcademyState>
  update: (
    change: (state: AcademyState) => AcademyState,
  ) => Promise<AcademyState>
  exportRaw: () => Promise<unknown>
}

export const emptyAcademyState = (): AcademyState => ({
  schemaVersion: 1,
  lessons: {},
  intro: { dismissedAt: null, skippedAt: null },
})
