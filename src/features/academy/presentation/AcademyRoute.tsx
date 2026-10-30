import { Link, useParams } from 'react-router-dom'

import { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'
import { Button } from '@/components/ui/button'
import {
  ACADEMY_COURSES,
  ACADEMY_LESSONS,
} from '@/features/academy/domain/academyCatalog'

import { AcademyCourseList } from './AcademyCourseList'
import { AcademyLessonDetail } from './AcademyLessonDetail'
import type { AcademyRouteProps } from './AcademyRoute.types'
import { useAcademyText } from './academyUiMessages'
import { useAcademyProgress } from './useAcademyProgress'

export type { AcademyRouteProps, AcademyUiUseCases } from './AcademyRoute.types'
const productionUseCases = createAcademyUseCases()

export const AcademyRoute = ({
  useCases = productionUseCases,
  lessons = ACADEMY_LESSONS,
  courses = ACADEMY_COURSES,
}: AcademyRouteProps) => {
  const { text } = useAcademyText()
  const { lessonId } = useParams<{ lessonId: string }>()
  const state = useAcademyProgress(useCases)
  const lesson = lessons.find((item) => item.lessonId === lessonId)
  return (
    <main className='min-h-0 flex-1 overflow-y-auto'>
      <div
        className='mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-10'
        aria-label={text('title')}
      >
        {!lessonId ? (
          <header className='space-y-2'>
            <h1 className='text-3xl font-semibold tracking-tight'>
              {text('title')}
            </h1>
            <p className='text-muted-foreground'>{text('intro')}</p>
          </header>
        ) : null}
        <p className='rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground'>
          {text('safe')}
        </p>
        {state.loadState === 'loading' ? (
          <output>{text('loading')}</output>
        ) : null}
        {state.loadState === 'error' ? (
          <div
            role='alert'
            className='space-y-3 rounded-xl border border-destructive p-5'
          >
            <p>{text('loadError')}</p>
            <Button variant='outline' onClick={state.handleRetry}>
              {text('retry')}
            </Button>
          </div>
        ) : null}
        {state.actionError ? (
          <p
            role='alert'
            className='rounded-lg border border-destructive p-4 text-sm'
          >
            {text('actionError')}
          </p>
        ) : null}
        {state.loadState === 'loaded' && state.progress ? (
          <>
            {!lessonId ? (
              <AcademyCourseList
                lessons={lessons}
                courses={courses}
                progress={state.progress}
              />
            ) : null}
            {lesson ? (
              <AcademyLessonDetail
                key={lesson.lessonId}
                lesson={lesson}
                lessons={lessons}
                progress={state.progress.lessons.find(
                  (item) => item.lessonId === lesson.lessonId,
                )}
                busy={state.busy}
                record={state.record}
              />
            ) : null}
            {lessonId && !lesson ? (
              <div className='space-y-4'>
                <h1 className='text-2xl font-semibold'>{text('missing')}</h1>
                <Link className='underline underline-offset-4' to='/academy'>
                  {text('back')}
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
