import type { AcademyProgressDto } from '@/features/academy/application/dto/AcademyProgressDto'
import { hasAcademyScreenGuide } from '@/features/academy/application/use-cases/RecordGuideViewedUseCase'

import { useAcademyText } from './academyUiMessages'

export type AcademyLessonProgress = AcademyProgressDto['lessons'][number]
export const AcademyProgressStatus = ({
  progress,
}: {
  progress: AcademyLessonProgress | undefined
}) => {
  const { text } = useAcademyText()
  let key: 'relearning' | 'mastered' | 'skipped' | 'inProgress' | 'notStarted' =
    'notStarted'
  if (progress?.relearning) {
    key = 'relearning'
  } else if (progress?.mastered) {
    key = 'mastered'
  } else if (progress?.skipped) {
    key = 'skipped'
  } else if (progress?.inProgress) {
    key = 'inProgress'
  }
  return (
    <span className='rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium'>
      {text(key)}
    </span>
  )
}
export const AcademyEvidenceStatus = ({
  progress,
}: {
  progress: AcademyLessonProgress | undefined
}) => {
  const { text } = useAcademyText()
  return (
    <p className='text-xs text-muted-foreground'>
      {text(progress?.videoWatched ? 'completedVideo' : 'pendingVideo')} ·{' '}
      {text(
        progress?.practiceCompleted ? 'completedPractice' : 'pendingPractice',
      )}
      {progress && hasAcademyScreenGuide(progress.lessonId) ? (
        <>
          {' · '}
          {text(
            progress.guideViewedAt !== null ? 'completedGuide' : 'pendingGuide',
          )}
        </>
      ) : null}
    </p>
  )
}
