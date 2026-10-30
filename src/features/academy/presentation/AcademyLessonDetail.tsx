import { ArrowLeft, ArrowRight, BookOpen, RotateCcw } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canPracticeWithSamples } from '@/features/academy/application/services/AcademyPracticeService'
import type { Lesson } from '@/features/academy/domain/academySchemas'

import { getAcademyGuide, getAcademyRelatedRoute } from './academyLessonGuide'
import {
  AcademyEvidenceStatus,
  AcademyProgressStatus,
} from './AcademyProgressStatus'
import type { AcademyLessonProgress } from './AcademyProgressStatus'
import { useAcademyText } from './academyUiMessages'

const AcademyChapters = ({
  guide,
  chapter,
  onChapterClick,
}: {
  guide: string[]
  chapter: number
  onChapterClick: (event: MouseEvent<HTMLButtonElement>) => void
}) => {
  const { text } = useAcademyText()
  return (
    <nav
      aria-label={text('chapters')}
      className='rounded-xl border border-border p-4'
    >
      <h2 className='mb-3 font-semibold'>{text('chapters')}</h2>
      <ol className='space-y-2'>
        {guide.map((paragraph, itemIndex) => (
          <li key={paragraph}>
            <button
              type='button'
              className='w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=step]:bg-muted aria-[current=step]:font-semibold'
              value={itemIndex}
              onClick={onChapterClick}
              aria-current={chapter === itemIndex ? 'step' : undefined}
            >
              {text('reading')} {itemIndex + 1}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export const AcademyLessonDetail = ({
  lesson,
  lessons,
  progress,
  busy,
  record,
}: {
  lesson: Lesson
  lessons: readonly Lesson[]
  progress: AcademyLessonProgress | undefined
  busy: boolean
  record: (lessonId: string, skip: boolean) => Promise<void>
}) => {
  const { text, content, language } = useAcademyText()
  const [chapter, setChapter] = useState(0)
  const guide = getAcademyGuide(lesson.lessonId, language)
  const index = lessons.findIndex((item) => item.lessonId === lesson.lessonId)
  const previous = lessons[index - 1]
  const next = lessons[index + 1]
  const handleChapter = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setChapter(Number(event.currentTarget.value))
  }, [])
  const handleReview = useCallback(() => {
    setChapter(0)
    void record(lesson.lessonId, false)
  }, [record, lesson.lessonId])
  const handleSkip = useCallback(() => {
    void record(lesson.lessonId, true)
  }, [record, lesson.lessonId])
  const hasPractice = canPracticeWithSamples(lesson)
  let reviewLabel: 'saving' | 'replay' | 'start' = 'start'
  if (busy) {
    reviewLabel = 'saving'
  } else if (
    progress?.startedAt !== null &&
    progress?.startedAt !== undefined
  ) {
    reviewLabel = 'replay'
  }

  return (
    <div className='space-y-6'>
      <Link
        to='/academy'
        className='inline-flex items-center gap-2 text-sm underline underline-offset-4'
      >
        <ArrowLeft aria-hidden='true' className='size-4' />
        {text('back')}
      </Link>
      <header className='space-y-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <p className='text-sm text-muted-foreground'>
            {text(lesson.difficulty)} · {lesson.estimatedMinutes}{' '}
            {text('minutes')}
          </p>
          <AcademyProgressStatus progress={progress} />
        </div>
        <h1 className='text-2xl font-semibold sm:text-3xl'>
          {content(lesson.titleKey)}
        </h1>
        <p className='text-muted-foreground'>
          {content(lesson.descriptionKey)}
        </p>
        <AcademyEvidenceStatus progress={progress} />
      </header>
      <Tabs defaultValue='text' className='space-y-4'>
        <TabsList
          className='h-auto max-w-full flex-wrap justify-start gap-1'
          aria-label={content(lesson.titleKey)}
        >
          <TabsTrigger value='text'>{text('text')}</TabsTrigger>
          <TabsTrigger
            value='video'
            disabled
            aria-describedby='academy-video-unavailable'
          >
            {text('video')}
          </TabsTrigger>
          <TabsTrigger
            value='practice'
            disabled={!hasPractice}
            aria-describedby='academy-practice-unavailable'
          >
            {text('practice')}
          </TabsTrigger>
        </TabsList>
        <div className='space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground'>
          <p id='academy-video-unavailable'>{text('videoUnavailable')}</p>
          <p id='academy-practice-unavailable'>
            {text(hasPractice ? 'practiceSafe' : 'screenGuide')}
          </p>
        </div>
        {hasPractice ? (
          <TabsContent value='practice' className='space-y-4'>
            <p>{text('practiceSafe')}</p>
            <Button asChild>
              <a
                href={`practice.html?lessonId=${encodeURIComponent(lesson.lessonId)}&lang=${language}`}
              >
                {text('practice')}
              </a>
            </Button>
          </TabsContent>
        ) : null}
        <TabsContent value='text' className='space-y-5'>
          <div className='grid min-w-0 gap-5 md:grid-cols-[180px_minmax(0,1fr)]'>
            <AcademyChapters
              guide={guide}
              chapter={chapter}
              onChapterClick={handleChapter}
            />
            <article
              className='min-w-0 rounded-xl border border-border bg-card p-5 sm:p-7'
              aria-live='polite'
            >
              <BookOpen
                aria-hidden='true'
                className='mb-4 size-6 text-primary'
              />
              <h2 className='mb-4 font-semibold'>
                {text('reading')} {chapter + 1} / {guide.length}
              </h2>
              <p className='leading-7'>
                {guide[chapter] ?? content(lesson.descriptionKey)}
              </p>
            </article>
          </div>
          <p className='text-sm text-muted-foreground'>
            {text('screenGuide')}
            <br />
            {text('prerequisite')}
          </p>
        </TabsContent>
      </Tabs>
      <p className='text-sm text-muted-foreground'>{text('textNote')}</p>
      <div className='flex flex-wrap items-center gap-3'>
        <Button type='button' onClick={handleReview} disabled={busy}>
          <RotateCcw aria-hidden='true' className='size-4' />
          {text(reviewLabel)}
        </Button>
        <Button
          type='button'
          onClick={handleSkip}
          disabled={busy}
          variant='outline'
        >
          {text('skip')}
        </Button>
        <Link
          className='text-sm underline underline-offset-4'
          to={getAcademyRelatedRoute(lesson.lessonId)}
        >
          {text('related')}
        </Link>
      </div>
      <nav
        className='flex flex-wrap justify-between gap-3 border-t border-border pt-5'
        aria-label={text('courses')}
      >
        {previous ? (
          <Link
            className='inline-flex items-center gap-2 text-sm underline underline-offset-4'
            to={`/academy/${previous.lessonId}`}
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            {text('previous')}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            className='inline-flex items-center gap-2 text-sm underline underline-offset-4'
            to={`/academy/${next.lessonId}`}
          >
            {text('next')}
            <ArrowRight aria-hidden='true' className='size-4' />
          </Link>
        ) : (
          <Link className='text-sm underline underline-offset-4' to='/academy'>
            {text('back')}
          </Link>
        )}
      </nav>
    </div>
  )
}
