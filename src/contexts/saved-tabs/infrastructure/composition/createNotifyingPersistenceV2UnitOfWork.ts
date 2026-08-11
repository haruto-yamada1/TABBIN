import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'
import type { PersistenceChangePort } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import type { PersistenceV2UnitOfWorkPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { createPersistenceMutationCoordinator } from '@/contexts/saved-tabs/application/services/PersistenceMutationCoordinatorService'
import type { PersistenceNotificationFailureDiagnostic } from '@/contexts/saved-tabs/application/services/PersistenceMutationCoordinatorService'

export type CreateNotifyingPersistenceV2UnitOfWorkOptions = {
  readonly changePort: PersistenceChangePort
  readonly idGenerator: IdGeneratorPort
  readonly onNotificationFailure: (
    diagnostic: PersistenceNotificationFailureDiagnostic,
  ) => void
  readonly unitOfWork: PersistenceV2UnitOfWorkPort
}

export const createNotifyingPersistenceV2UnitOfWork = ({
  changePort,
  idGenerator,
  onNotificationFailure,
  unitOfWork,
}: CreateNotifyingPersistenceV2UnitOfWorkOptions): PersistenceV2UnitOfWorkPort => {
  const coordinator = createPersistenceMutationCoordinator({
    changePort,
    idGenerator,
    unitOfWork,
  })
  return {
    commit: async (plan, options) => {
      const outcome = await coordinator.commit(plan, options)
      if (outcome.kind === 'commit_succeeded_notification_failed') {
        onNotificationFailure(outcome.diagnostic)
      }
      return outcome.commitResult
    },
    readRevision: async () => unitOfWork.readRevision(),
  }
}
