import type { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'
import type { Course, Lesson } from '@/features/academy/domain/academySchemas'

export type AcademyUiUseCases = Pick<
  ReturnType<typeof createAcademyUseCases>,
  'getProgress' | 'startLesson' | 'skipLesson'
>
export type AcademyRouteProps = {
  useCases?: AcademyUiUseCases
  lessons?: readonly Lesson[]
  courses?: readonly Course[]
}
