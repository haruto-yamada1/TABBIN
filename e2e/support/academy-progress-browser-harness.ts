import { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'

const useCases = createAcademyUseCases()
const firstLessonId = 'install-extension'

export const runAcademyPersistenceSmoke = async (phase: 'fresh' | 'verify') => {
  if (phase === 'fresh') {
    const attempt = await useCases.startLesson(firstLessonId)
    await useCases.skipLesson(attempt)
    await useCases.recordIntro('dismiss')
  }
  const progress = await useCases.getProgress()
  const first = progress.lessons.find(
    (lesson) => lesson.lessonId === firstLessonId,
  )
  if (
    !first ||
    first.startedAt === null ||
    first.skippedAt === null ||
    progress.intro.dismissedAt === null ||
    first.mastered ||
    first.videoWatched ||
    first.practiceCompleted
  ) {
    throw new Error('Academy independent progress was not retained')
  }
  return { first, intro: progress.intro, summary: progress.summary }
}

Object.assign(globalThis, {
  __tabbinAcademySmoke: { ...useCases, runAcademyPersistenceSmoke },
})
