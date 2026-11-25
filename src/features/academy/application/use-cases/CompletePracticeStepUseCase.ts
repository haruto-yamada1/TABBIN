import type {
  AcademyPorts,
  PracticeStepCommand,
} from '@/features/academy/application/ports/AcademyPorts'
import {
  AcademyCommandError,
  currentAttempt,
  findLesson,
} from '@/features/academy/application/services/AcademyProgressService'

/** The sandbox command handler calls this only after observing its successful operation. */
export const createCompletePracticeStepUseCase =
  (ports: AcademyPorts) =>
  async (command: PracticeStepCommand): Promise<void> => {
    const lesson = findLesson(ports, command.lessonId)
    const step = lesson.steps.find((item) => item.stepId === command.stepId)
    if (
      !step?.practiceRequirement ||
      command.environment !== 'academy-sandbox' ||
      command.action !== step.practiceRequirement.action
    ) {
      throw new AcademyCommandError('INVALID_EVENT')
    }
    await ports.repository.update((state) => {
      const progress = currentAttempt(state, lesson, command)
      progress.practice[step.stepId] ??= ports.now()
      return state
    })
  }
