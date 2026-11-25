import type { Lesson } from '@/features/academy/domain/academySchemas'

const writablePracticeActions = new Set([
  'organize-parent-category',
  'organize-child-category',
  'reorder-categories-and-domains',
  'restore-tabs',
])

/** Screen explanations and native toolbar actions never require sample data. */
export const canPracticeWithSamples = (
  lesson: Pick<Lesson, 'steps'>,
): boolean =>
  lesson.steps.some(
    (step) =>
      step.practiceRequirement !== null &&
      writablePracticeActions.has(step.practiceRequirement.action),
  )
