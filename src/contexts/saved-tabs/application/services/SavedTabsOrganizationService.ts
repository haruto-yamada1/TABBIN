import type {
  SavedTabsOrganizationCatalogDto,
  SavedTabsOrganizationExecuteResultDto,
  SavedTabsOrganizationPreviewDto,
  SavedTabsOrganizationUndoResultDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsOrganizationDto'
import { savedTabsOrganizationProposalSchema } from '@/contexts/saved-tabs/application/dto/SavedTabsOrganizationDto'
import { SavedTabsOrganizationError } from '@/contexts/saved-tabs/application/errors/SavedTabsOrganizationError'
import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'
import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import { PersistenceRevisionConflictError } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

import type { PersistenceMutationCoordinator } from './PersistenceMutationCoordinatorService'
import {
  applyOrganizationWritePlan,
  assertOrganizationIntegrity,
  organizationAffectedState,
  organizationWritePlan,
  planSavedTabsOrganization,
  sameOrganizationState,
} from './SavedTabsOrganizationPlanningService'
import type { SavedTabsOrganizationWritePlan } from './SavedTabsOrganizationPlanningService'

export { SavedTabsOrganizationError } from '@/contexts/saved-tabs/application/errors/SavedTabsOrganizationError'
export type { SavedTabsOrganizationErrorCode } from '@/contexts/saved-tabs/application/errors/SavedTabsOrganizationError'

export type SavedTabsOrganizationService = {
  readonly execute: (
    previewId: string,
  ) => Promise<SavedTabsOrganizationExecuteResultDto>
  readonly preview: (
    proposal: unknown,
  ) => Promise<SavedTabsOrganizationPreviewDto>
  readonly readCatalog: () => Promise<SavedTabsOrganizationCatalogDto>
  readonly undo: (undoId: string) => Promise<SavedTabsOrganizationUndoResultDto>
}

export type SavedTabsOrganizationServiceDependencies = {
  readonly clock: ClockPort
  readonly idGenerator: IdGeneratorPort
  readonly mutationCoordinator: PersistenceMutationCoordinator
  readonly snapshotReader: Pick<
    PersistenceV2SnapshotReaderPort,
    'readVerifiedSavedTabsSnapshot'
  >
}

const ORGANIZATION_SESSION_LIFETIME_MS = 1_800_000

export const createSavedTabsOrganizationService = (
  deps: SavedTabsOrganizationServiceDependencies,
): SavedTabsOrganizationService => {
  type Checkpoint = {
    readonly after: PersistenceV2Snapshot
    readonly expiresAt: number
    readonly inverse: SavedTabsOrganizationWritePlan
    readonly plan: SavedTabsOrganizationWritePlan
    readonly revision: number
  }
  const previews = new Map<string, Checkpoint>()
  const undoEntries = new Map<string, Checkpoint>()
  const lifetime = ORGANIZATION_SESSION_LIFETIME_MS
  const capacity = 20
  let undoReservations = 0
  const pendingUndo = new Set<string>()
  const cleanEntries = (entries: Map<string, Checkpoint>): void => {
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= deps.clock.now()) {
        entries.delete(id)
      }
    }
  }
  const createToken = (): string => {
    const id = deps.idGenerator.generate()
    if (!id || previews.has(id) || undoEntries.has(id)) {
      throw new SavedTabsOrganizationError('INTEGRITY_ERROR')
    }
    return id
  }
  const saveEntry = (
    entries: Map<string, Checkpoint>,
    id: string,
    checkpoint: Checkpoint,
  ): void => {
    cleanEntries(entries)
    if (entries.size >= capacity) {
      const oldest = entries.keys().next().value
      if (oldest !== undefined) {
        entries.delete(oldest)
      }
    }
    entries.set(id, checkpoint)
  }
  const readSnapshot = async () => {
    try {
      return await deps.snapshotReader.readVerifiedSavedTabsSnapshot()
    } catch {
      throw new SavedTabsOrganizationError('INTEGRITY_ERROR')
    }
  }
  const consumeEntry = (
    entries: Map<string, Checkpoint>,
    id: string,
    kind: 'preview' | 'undo',
    consume = true,
  ): Checkpoint => {
    cleanEntries(entries)
    const checkpoint = entries.get(id)
    if (!checkpoint) {
      throw new SavedTabsOrganizationError(
        kind === 'preview' ? 'PREVIEW_UNAVAILABLE' : 'UNDO_UNAVAILABLE',
      )
    }
    if (consume) {
      entries.delete(id)
    }
    return checkpoint
  }
  const commit = async (
    plan: SavedTabsOrganizationWritePlan,
    revision: number,
    kind: 'preview' | 'undo',
  ) => {
    try {
      return await deps.mutationCoordinator.commit(plan, {
        expectedRevision: revision,
      })
    } catch (error) {
      if (error instanceof PersistenceRevisionConflictError) {
        throw new SavedTabsOrganizationError(
          kind === 'preview' ? 'STALE_PREVIEW' : 'UNDO_CONFLICT',
        )
      }
      throw new SavedTabsOrganizationError('COMMIT_FAILED')
    }
  }

  return {
    readCatalog: async () => {
      const { revision, savedTabs } = await readSnapshot()
      const projects = savedTabs.collections.filter(
        ({ definition }) => definition.type === 'custom',
      )
      const projectIds = new Set(projects.map(({ id }) => id))
      return {
        memberships: savedTabs.memberships
          .filter(({ collectionId }) => projectIds.has(collectionId))
          .map(({ categoryId, collectionId, urlId }) => ({
            ...(categoryId !== undefined ? { categoryId } : {}),
            projectId: collectionId,
            urlId,
          })),
        projects: projects.map(({ id, name }) => ({
          categories: savedTabs.categories
            .filter(({ collectionId }) => collectionId === id)
            .map((category) => ({ id: category.id, name: category.name })),
          id,
          name,
        })),
        revision,
      }
    },
    preview: async (input) => {
      const parsed = savedTabsOrganizationProposalSchema.safeParse(input)
      if (!parsed.success) {
        throw new SavedTabsOrganizationError('INVALID_PROPOSAL')
      }
      const snapshot = await readSnapshot()
      const timestamp = deps.clock.now()
      const projectId =
        parsed.data.kind === 'create_project' ? createToken() : ''
      const { next, targets } = planSavedTabsOrganization(
        snapshot.savedTabs,
        parsed.data,
        timestamp,
        projectId,
      )
      assertOrganizationIntegrity(next)
      const plan = organizationWritePlan(snapshot.savedTabs, next)
      if (Object.keys(plan).length === 0) {
        throw new SavedTabsOrganizationError('NO_CHANGES')
      }
      const id = createToken()
      const expiresAt = timestamp + lifetime
      saveEntry(previews, id, {
        after: organizationAffectedState(next, plan),
        expiresAt,
        inverse: organizationWritePlan(next, snapshot.savedTabs),
        plan,
        revision: snapshot.revision,
      })
      return structuredClone({
        expiresAt,
        id,
        proposal: parsed.data,
        revision: snapshot.revision,
        targets,
      })
    },
    execute: async (id) => {
      cleanEntries(undoEntries)
      if (undoEntries.size + undoReservations >= capacity) {
        throw new SavedTabsOrganizationError('SESSION_CAPACITY')
      }
      const checkpoint = consumeEntry(previews, id, 'preview')
      const undoId = createToken()
      undoReservations += 1
      try {
        const outcome = await commit(
          checkpoint.plan,
          checkpoint.revision,
          'preview',
        )
        saveEntry(undoEntries, undoId, {
          ...checkpoint,
          expiresAt: deps.clock.now() + lifetime,
          revision: outcome.commitResult.revision,
        })
        return {
          notificationFailed:
            outcome.kind === 'commit_succeeded_notification_failed',
          undoId,
        }
      } finally {
        undoReservations -= 1
      }
    },
    undo: async (id) => {
      if (pendingUndo.has(id)) {
        throw new SavedTabsOrganizationError('UNDO_CONFLICT')
      }
      const checkpoint = consumeEntry(undoEntries, id, 'undo', false)
      pendingUndo.add(id)
      try {
        const snapshot = await readSnapshot()
        if (
          !sameOrganizationState(
            organizationAffectedState(snapshot.savedTabs, checkpoint.plan),
            checkpoint.after,
          )
        ) {
          throw new SavedTabsOrganizationError('UNDO_CONFLICT')
        }
        try {
          assertOrganizationIntegrity(
            applyOrganizationWritePlan(snapshot.savedTabs, checkpoint.inverse),
          )
        } catch {
          throw new SavedTabsOrganizationError('UNDO_CONFLICT')
        }
        const outcome = await commit(
          checkpoint.inverse,
          snapshot.revision,
          'undo',
        )
        undoEntries.delete(id)
        return {
          notificationFailed:
            outcome.kind === 'commit_succeeded_notification_failed',
        }
      } finally {
        pendingUndo.delete(id)
      }
    },
  }
}
