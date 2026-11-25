import type { Lesson, LessonProgress, VideoEvidence } from './academySchemas'

export const VIDEO_WATCH_THRESHOLD = 0.9
export const VIDEO_MAX_SAMPLE_GAP_SECONDS = 10

export const createLessonProgress = (
  lesson: Lesson,
  generation: string,
): LessonProgress => ({
  lessonId: lesson.lessonId,
  contentVersion: lesson.contentVersion,
  assessmentVersion: lesson.assessmentVersion,
  generation,
  startedAt: null,
  skippedAt: null,
  video: { assets: {}, legacy: null },
  practice: {},
})

const viewedSeconds = (ranges: readonly [number, number][]): number => {
  let end = 0
  let total = 0
  for (const range of ranges.toSorted((left, right) => left[0] - right[0])) {
    total += Math.max(0, range[1] - Math.max(end, range[0]))
    end = Math.max(end, range[1])
  }
  return total
}

const hasVideoAchievement = (evidence: VideoEvidence): boolean =>
  evidence.watchedAt !== null &&
  evidence.durationSeconds !== null &&
  viewedSeconds(evidence.ranges) >=
    evidence.durationSeconds * VIDEO_WATCH_THRESHOLD

const videoEvidence = (progress: LessonProgress): VideoEvidence[] => [
  ...Object.values(progress.video.assets),
  ...(progress.video.legacy ? [progress.video.legacy] : []),
]

export const getVideoWatchedAt = (progress: LessonProgress): number | null => {
  const timestamps = videoEvidence(progress)
    .filter(hasVideoAchievement)
    .flatMap((evidence) =>
      evidence.watchedAt === null ? [] : [evidence.watchedAt],
    )
  return timestamps.length === 0 ? null : Math.min(...timestamps)
}

const hasPracticeAchievement = (
  lesson: Lesson,
  progress: LessonProgress,
): boolean =>
  lesson.mastery.practiceStepIds.length > 0 &&
  lesson.mastery.practiceStepIds.every((stepId) =>
    Object.hasOwn(progress.practice, stepId),
  )

const hasActivity = (progress: LessonProgress): boolean =>
  progress.startedAt !== null ||
  (progress.guideViewedAt ?? null) !== null ||
  videoEvidence(progress).some((evidence) => evidence.ranges.length > 0) ||
  Object.keys(progress.practice).length > 0

const meetsMastery = (
  lesson: Lesson,
  progress: LessonProgress,
  videoWatched: boolean,
  practiceCompleted: boolean,
): boolean => {
  const availableVideo = lesson.assets.some((asset) => {
    const evidence = progress.video.assets[asset.assetId]
    const legacy = progress.video.legacy
    return (
      asset.status === 'available' &&
      ((evidence !== undefined &&
        evidence.durationSeconds === asset.durationSeconds &&
        hasVideoAchievement(evidence)) ||
        (legacy !== null &&
          legacy.durationSeconds === asset.durationSeconds &&
          hasVideoAchievement(legacy)))
    )
  })
  const hasRequirements =
    lesson.mastery.videoRequired || lesson.mastery.practiceStepIds.length > 0
  return (
    hasRequirements &&
    (!lesson.mastery.videoRequired || (videoWatched && availableVideo)) &&
    (lesson.mastery.practiceStepIds.length === 0 || practiceCompleted)
  )
}

export const deriveLessonState = (
  lesson: Lesson,
  progress: LessonProgress | null,
) => {
  if (progress === null || progress.lessonId !== lesson.lessonId) {
    return {
      notStarted: true,
      inProgress: false,
      videoWatched: false,
      practiceCompleted: false,
      skipped: false,
      mastered: false,
      relearning: false,
    }
  }
  const videoWatched = getVideoWatchedAt(progress) !== null
  const practiceCompleted = hasPracticeAchievement(lesson, progress)
  const activity = hasActivity(progress)
  const relearning =
    activity && progress.assessmentVersion !== lesson.assessmentVersion
  const mastered =
    !relearning &&
    meetsMastery(lesson, progress, videoWatched, practiceCompleted)
  return {
    notStarted: !activity,
    inProgress: activity && !mastered,
    videoWatched,
    practiceCompleted,
    skipped: progress.skippedAt !== null,
    mastered,
    relearning,
  }
}

export const aggregateProgress = (
  lessons: readonly Lesson[],
  progresses: Readonly<Record<string, LessonProgress>>,
) => {
  const uniqueLessons = [
    ...new Map(lessons.map((lesson) => [lesson.lessonId, lesson])).values(),
  ]
  const result = {
    total: uniqueLessons.length,
    completed: 0,
    denominator: uniqueLessons.length,
    reviewable: 0,
    inProgress: 0,
    relearning: 0,
  }
  for (const lesson of uniqueLessons) {
    const state = deriveLessonState(
      lesson,
      Object.hasOwn(progresses, lesson.lessonId)
        ? (progresses[lesson.lessonId] ?? null)
        : null,
    )
    result.completed += Number(state.mastered)
    result.reviewable += Number(
      state.mastered ||
        (state.relearning && (state.videoWatched || state.practiceCompleted)),
    )
    result.inProgress += Number(state.inProgress)
    result.relearning += Number(state.relearning)
  }
  return result
}
