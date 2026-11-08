import { getAcademyLessonContent } from './academyLessonContent'
import { useAcademyText } from './academyUiMessages'

export const AcademyLessonFacts = ({
  lessonId,
  part,
}: {
  lessonId: string
  part: 'before' | 'after'
}) => {
  const { text, language } = useAcademyText()
  const content = getAcademyLessonContent(lessonId, language)
  if (!content) {
    return null
  }
  if (part === 'before') {
    return (
      <dl className='grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2'>
        <div>
          <dt className='font-semibold'>{text('objective')}</dt>
          <dd>{content.goal}</dd>
        </div>
        <div>
          <dt className='font-semibold'>{text('targetScreen')}</dt>
          <dd>{content.screen}</dd>
        </div>
        <div className='sm:col-span-2'>
          <dt className='font-semibold'>{text('beforeStarting')}</dt>
          <dd>{content.prerequisites}</dd>
        </div>
      </dl>
    )
  }
  return (
    <dl className='space-y-3 rounded-xl border border-border p-4 text-sm'>
      <div>
        <dt className='font-semibold'>{text('cautions')}</dt>
        <dd>{content.notes}</dd>
      </div>
      <div>
        <dt className='font-semibold'>{text('completion')}</dt>
        <dd>{content.completion}</dd>
      </div>
    </dl>
  )
}
