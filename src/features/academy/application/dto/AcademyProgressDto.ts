export type AcademyProgressDto = {
  lessons: {
    prerequisitesMet: boolean
    lessonId: string
    generation: string | null
    contentVersion: number
    startedAt: number | null
    skippedAt: number | null
    guideViewedAt: number | null
    videoWatchedAt: number | null
    completedPracticeStepIds: string[]
    notStarted: boolean
    inProgress: boolean
    videoWatched: boolean
    practiceCompleted: boolean
    skipped: boolean
    mastered: boolean
    relearning: boolean
  }[]
  summary: {
    total: number
    completed: number
    denominator: number
    reviewable: number
    inProgress: number
    relearning: number
  }
  intro: { dismissedAt: number | null; skippedAt: number | null }
}
