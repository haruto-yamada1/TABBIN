import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'
import type {
  PersistenceChangeEvent,
  PersistenceChangePort,
  PersistenceChangeScope,
} from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import type {
  PersistenceCommitOptions,
  PersistenceCommitResult,
  PersistenceV2UnitOfWorkPort,
  PersistenceV2WritePlan,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'

export const PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT_CODE =
  'PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT' as const

export type PersistenceNotificationFailureStage =
  | 'change_id_generation'
  | 'change_publication'

export type PersistenceNotificationFailureDiagnostic = {
  readonly code: typeof PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT_CODE
  readonly revision: number
  readonly scopes: readonly PersistenceChangeScope[]
  readonly stage: PersistenceNotificationFailureStage
}

export type PersistenceMutationOutcome =
  | {
      readonly commitResult: PersistenceCommitResult
      readonly event: PersistenceChangeEvent
      readonly kind: 'committed_and_published'
    }
  | {
      readonly commitResult: PersistenceCommitResult
      readonly diagnostic: PersistenceNotificationFailureDiagnostic
      readonly kind: 'commit_succeeded_notification_failed'
    }

export type PersistenceMutationCoordinator = {
  readonly commit: (
    plan: PersistenceV2WritePlan,
    options?: PersistenceCommitOptions,
  ) => Promise<PersistenceMutationOutcome>
}

export type PersistenceMutationCoordinatorDependencies = {
  readonly changePort: PersistenceChangePort
  readonly idGenerator: IdGeneratorPort
  readonly unitOfWork: PersistenceV2UnitOfWorkPort
}

const createNotificationFailure = (
  commitResult: PersistenceCommitResult,
  stage: PersistenceNotificationFailureStage,
): PersistenceMutationOutcome => ({
  commitResult,
  diagnostic: {
    code: PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT_CODE,
    revision: commitResult.revision,
    scopes: commitResult.changedScopes,
    stage,
  },
  kind: 'commit_succeeded_notification_failed',
})

export const createPersistenceMutationCoordinator = ({
  changePort,
  idGenerator,
  unitOfWork,
}: PersistenceMutationCoordinatorDependencies): PersistenceMutationCoordinator => ({
  commit: async (
    plan: PersistenceV2WritePlan,
    options?: PersistenceCommitOptions,
  ): Promise<PersistenceMutationOutcome> => {
    const commitResult = await unitOfWork.commit(plan, options)

    let changeId: string
    try {
      changeId = idGenerator.generate()
    } catch {
      return createNotificationFailure(commitResult, 'change_id_generation')
    }

    const event: PersistenceChangeEvent = {
      changeId,
      revision: commitResult.revision,
      scopes: commitResult.changedScopes,
    }
    try {
      await changePort.publish(event)
    } catch {
      return createNotificationFailure(commitResult, 'change_publication')
    }

    return {
      commitResult,
      event,
      kind: 'committed_and_published',
    }
  },
})
