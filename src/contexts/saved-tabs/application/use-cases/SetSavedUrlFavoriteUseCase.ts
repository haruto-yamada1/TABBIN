import type { SetSavedUrlFavoriteCommand } from '@/contexts/saved-tabs/application/commands/SetSavedUrlFavoriteCommand'
import type { SetSavedUrlFavoritePort } from '@/contexts/saved-tabs/application/ports/SetSavedUrlFavoritePort'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

export type SetSavedUrlFavoriteUseCase = (
  command: SetSavedUrlFavoriteCommand,
) => Promise<void>

export const createSetSavedUrlFavoriteUseCase =
  ({
    setSavedUrlFavoritePort,
  }: {
    readonly setSavedUrlFavoritePort: SetSavedUrlFavoritePort
  }): SetSavedUrlFavoriteUseCase =>
  async (command) => {
    if (typeof command.isFavorite !== 'boolean') {
      throw new SavedTabsDomainError(
        'Favorite must be a boolean',
        'INVALID_URL_RECORD',
      )
    }
    if (!(await setSavedUrlFavoritePort.setFavorite(command))) {
      throw new SavedTabsDomainError(
        'Saved URL not found',
        'URL_RECORD_NOT_FOUND',
      )
    }
  }
