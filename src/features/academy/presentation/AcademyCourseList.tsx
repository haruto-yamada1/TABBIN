import { BookOpen, ChevronRight, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import type { AcademyProgressDto } from '@/features/academy/application/dto/AcademyProgressDto'
import { canPracticeWithSamples } from '@/features/academy/application/services/AcademyPracticeService'
import type { Course, Lesson } from '@/features/academy/domain/academySchemas'

import {
  AcademyEvidenceStatus,
  AcademyProgressStatus,
} from './AcademyProgressStatus'
import { useAcademyText } from './academyUiMessages'

const LessonCard = ({
  lesson,
  progress,
}: {
  lesson: Lesson
  progress: AcademyProgressDto['lessons'][number] | undefined
}) => {
  const { text, content } = useAcademyText()
  return (
    <article className='h-full min-w-0'>
      <Link
        aria-label={content(lesson.titleKey)}
        className='block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
        to={`/academy/${lesson.lessonId}`}
      >
        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          <span className='text-xs text-muted-foreground'>
            {text(lesson.difficulty)} · {lesson.estimatedMinutes}{' '}
            {text('minutes')}
          </span>
          <AcademyProgressStatus progress={progress} />
        </div>
        <h3 className='text-lg font-semibold'>{content(lesson.titleKey)}</h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          {content(lesson.descriptionKey)}
        </p>
        <div className='mt-4 space-y-2'>
          <p className='text-xs text-muted-foreground'>
            {text(
              lesson.assets.some((asset) => asset.status === 'available')
                ? 'videoReady'
                : 'videoPlanned',
            )}{' '}
            ·{' '}
            {text(
              canPracticeWithSamples(lesson) ? 'practicePlanned' : 'noPractice',
            )}
          </p>
          <AcademyEvidenceStatus progress={progress} />
        </div>
      </Link>
    </article>
  )
}
export const AcademyCourseList = ({
  lessons,
  courses,
  progress,
}: {
  lessons: readonly Lesson[]
  courses: readonly Course[]
  progress: AcademyProgressDto
}) => {
  const { text, content } = useAcademyText()
  const eligible = new Set(lessons.map((lesson) => lesson.lessonId))
  const started = progress.lessons
    .filter(
      (item) =>
        eligible.has(item.lessonId) &&
        item.startedAt !== null &&
        !item.mastered &&
        !item.skipped,
    )
    .toSorted((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]
  const resume =
    lessons.find((lesson) => lesson.lessonId === started?.lessonId) ??
    lessons[0]
  return (
    <div className='space-y-8'>
      <section
        className='rounded-2xl border border-border bg-card p-6'
        aria-label={text('progress')}
      >
        <div className='flex flex-wrap items-start justify-between gap-5'>
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              <GraduationCap
                aria-hidden='true'
                className='size-5 text-primary'
              />
              <h2 className='font-semibold'>{text('progress')}</h2>
            </div>
            <p className='text-3xl font-semibold tabular-nums'>
              {progress.summary.completed}
              <span className='text-base text-muted-foreground'>
                {' '}
                / {progress.summary.denominator} {text('mastered')}
              </span>
            </p>
          </div>
          {resume ? (
            <Button asChild>
              <Link to={`/academy/${resume.lessonId}`}>
                {text(started ? 'resume' : 'begin')}
                <ChevronRight aria-hidden='true' className='size-4' />
              </Link>
            </Button>
          ) : null}
        </div>
        <progress
          className='mt-4 h-2 w-full accent-primary'
          aria-label={text('progress')}
          max={Math.max(1, progress.summary.denominator)}
          value={progress.summary.completed}
        />
        <p className='mt-3 text-sm text-muted-foreground'>{text('textNote')}</p>
      </section>
      {lessons.length === 0 ? (
        <p className='rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground'>
          {text('empty')}
        </p>
      ) : null}
      <div className='space-y-8' aria-label={text('courses')}>
        {courses.map((course) => (
          <section key={course.courseId} className='space-y-4'>
            <h2 className='flex items-center gap-2 text-xl font-semibold'>
              <BookOpen aria-hidden='true' className='size-5 text-primary' />
              {content(course.titleKey)}
            </h2>
            <ul className='grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3'>
              {course.lessonIds.flatMap((id) => {
                const lesson = lessons.find((item) => item.lessonId === id)
                return lesson
                  ? [
                      <li key={id} className='h-full min-w-0'>
                        <LessonCard
                          lesson={lesson}
                          progress={progress.lessons.find(
                            (item) => item.lessonId === id,
                          )}
                        />
                      </li>,
                    ]
                  : []
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
