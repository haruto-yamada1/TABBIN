import type { RemoveUrlsFromCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/RemoveUrlsFromCustomProjectCommand'
import { deleteCustomProjectUrls } from '@/contexts/saved-tabs/application/services/CustomProjectUrlDeletionService'
import type { CustomProjectUrlDeletionServiceDeps } from '@/contexts/saved-tabs/application/services/CustomProjectUrlDeletionService'

export type RemoveUrlsFromCustomProjectUseCaseDeps =
  CustomProjectUrlDeletionServiceDeps

export type RemoveUrlsFromCustomProjectUseCase = (
  command: RemoveUrlsFromCustomProjectCommand,
) => Promise<void>

/** A custom-mode delete removes the same saved URL from every mode. */
export const createRemoveUrlsFromCustomProjectUseCase = (
  deps: RemoveUrlsFromCustomProjectUseCaseDeps,
): RemoveUrlsFromCustomProjectUseCase => {
  return async (command) => {
    await deleteCustomProjectUrls(deps, command)
  }
}
