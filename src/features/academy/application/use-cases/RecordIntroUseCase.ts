import type { AcademyPorts } from '@/features/academy/application/ports/AcademyPorts'
import { AcademyCommandError } from '@/features/academy/application/services/AcademyProgressService'

export const createRecordIntroUseCase =
  (ports: AcademyPorts) =>
  async (action: 'dismiss' | 'skip'): Promise<void> => {
    if (!new Set<string>(['dismiss', 'skip']).has(action)) {
      throw new AcademyCommandError('INVALID_EVENT')
    }
    await ports.repository.update((state) => {
      if (action === 'dismiss') {
        state.intro.dismissedAt ??= ports.now()
      } else {
        state.intro.skippedAt ??= ports.now()
      }
      return state
    })
  }
