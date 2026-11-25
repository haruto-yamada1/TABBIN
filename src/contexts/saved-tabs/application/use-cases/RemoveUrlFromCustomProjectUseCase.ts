import type { RemoveUrlFromCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/RemoveUrlFromCustomProjectCommand'
import { deleteCustomProjectUrls } from '@/contexts/saved-tabs/application/services/CustomProjectUrlDeletionService'
import type { CustomProjectUrlDeletionServiceDeps } from '@/contexts/saved-tabs/application/services/CustomProjectUrlDeletionService'

export type RemoveUrlFromCustomProjectUseCaseDeps =
  CustomProjectUrlDeletionServiceDeps

export type RemoveUrlFromCustomProjectUseCase = (
  command: RemoveUrlFromCustomProjectCommand,
) => Promise<void>

/** A custom-mode delete removes the same saved URL from every mode. */
export const createRemoveUrlFromCustomProjectUseCase = (
  deps: RemoveUrlFromCustomProjectUseCaseDeps,
): RemoveUrlFromCustomProjectUseCase => {
  return async (command) => {
    await deleteCustomProjectUrls(deps, {
      projectId: command.projectId,
      urls: [command.url],
    })
  }
}
