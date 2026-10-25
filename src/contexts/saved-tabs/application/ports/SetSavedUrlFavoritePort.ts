import type { SetSavedUrlFavoriteCommand } from '@/contexts/saved-tabs/application/commands/SetSavedUrlFavoriteCommand'

/** Mutates only the target URL; returns false if it no longer exists. */
export type SetSavedUrlFavoritePort = {
  readonly setFavorite: (
    command: SetSavedUrlFavoriteCommand,
  ) => Promise<boolean>
}
