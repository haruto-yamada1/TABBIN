import { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'
import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createRecordVideoProgressUseCase } from '@/features/academy/application/use-cases/RecordVideoProgressUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { createChromeAcademyProgressRepository } from '@/features/academy/infrastructure/ChromeAcademyProgressRepository'

const useCases = createAcademyUseCases()
const firstLessonId = 'install-extension'

const videoRestartSmoke = async (phase: 'fresh' | 'verify') => {
  const lesson = ACADEMY_LESSONS.find(
    (item) => item.lessonId === 'pin-extension',
  )
  if (!lesson) {
    throw new Error('Video smoke catalog lesson missing')
  }
  let time = 1000
  const ports = {
    repository: createChromeAcademyProgressRepository(),
    lessons: [
      {
        ...lesson,
        assets: lesson.assets.map((asset) => ({
          ...asset,
          status: 'available' as const,
          durationSeconds: asset.locale === 'en' ? 100 : 60,
        })),
      },
    ],
    now: () => time,
    newId: () => crypto.randomUUID(),
  }
  if (phase === 'fresh') {
    const attempt = await createStartLessonUseCase(ports)(lesson.lessonId)
    const record = createRecordVideoProgressUseCase(ports)
    await (ports.lessons[0]?.assets ?? [])
      .toSorted((left, right) => left.locale.localeCompare(right.locale))
      .reduce(async (previousAsset, asset) => {
        await previousAsset
        const sample = {
          ...attempt,
          sessionId: asset.assetId,
          assetId: asset.assetId,
          playing: true,
          seeking: false,
        }
        const seconds = asset.locale === 'en' ? 1 : 54
        await record({ ...sample, sequence: 0, positionSeconds: 0 })
        await Array.from({ length: seconds }, (_, index) => index + 1).reduce(
          async (previous, sequence) => {
            await previous
            time += 1000
            await record({ ...sample, sequence, positionSeconds: sequence })
          },
          Promise.resolve(),
        )
      }, Promise.resolve())
  }
  const progress = await createGetAcademyProgressUseCase(ports)()
  const videoLesson = progress.lessons[0]
  if (!videoLesson?.mastered || !videoLesson.videoWatched) {
    throw new Error('Asset-specific video evidence was not retained')
  }
  return videoLesson
}

export const runAcademyPersistenceSmoke = async (phase: 'fresh' | 'verify') => {
  if (phase === 'fresh') {
    const attempt = await useCases.startLesson(firstLessonId)
    await useCases.skipLesson(attempt)
    await useCases.recordIntro('dismiss')
  }
  const video = await videoRestartSmoke(phase)
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
  return {
    first,
    intro: progress.intro,
    summary: progress.summary,
    video,
  }
}

Object.assign(globalThis, {
  __tabbinAcademySmoke: { ...useCases, runAcademyPersistenceSmoke },
})
