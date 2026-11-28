import type {
  PersistenceV2SnapshotReaderPort,
  PersistenceVersionedExpiredUrlsSnapshot,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type {
  PersistenceRecordMutation,
  PersistenceV2MembershipKey,
  PersistenceV2UnitOfWorkPort,
  PersistenceV2WritePlan,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type { ExpiredUrlRecoveryRecord } from '@/contexts/saved-tabs/domain/entities/ExpiredUrlRecovery'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

export type IndexedDbSavedTabsMutableState = {
  categories: PersistenceV2CollectionCategory[]
  collections: PersistenceV2Collection[]
  groups: PersistenceV2CollectionGroup[]
  memberships: PersistenceV2CollectionMembership[]
  urls: PersistenceV2Url[]
}

export type IndexedDbSavedTabsSessionServiceDeps = {
  readonly readWithExpiredUrls?: () => Promise<PersistenceVersionedExpiredUrlsSnapshot>
  readonly snapshotReaderPort: PersistenceV2SnapshotReaderPort
  readonly unitOfWorkPort: PersistenceV2UnitOfWorkPort
}

type SavedTabsStateWithExpiredUrls = IndexedDbSavedTabsMutableState & {
  expiredUrls: ExpiredUrlRecoveryRecord[]
}

type SavedTabsSessionState = IndexedDbSavedTabsMutableState &
  Partial<Pick<SavedTabsStateWithExpiredUrls, 'expiredUrls'>>

type SessionResult<Result> = {
  readonly result: Result
  readonly undo?: () => Promise<void>
}

type SessionOptions<Result> = {
  readonly onCommitFailure?:
    | ((error: unknown, result: Result) => never)
    | undefined
  readonly undo?:
    | true
    | {
        readonly clock: () => number
        readonly cutoff: number
      }
}

type EntityWithId = { readonly id: string }

const isSameRecord = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const diffById = <Value extends EntityWithId>(
  current: readonly Value[],
  next: readonly Value[],
): PersistenceRecordMutation<Value> | undefined => {
  const currentById = new Map(current.map((value) => [value.id, value]))
  const nextById = new Map(next.map((value) => [value.id, value]))
  const deleted = current
    .filter(({ id }) => !nextById.has(id))
    .map(({ id }) => id)
  const put = next.filter((value) => {
    const previous = currentById.get(value.id)
    return previous === undefined || !isSameRecord(previous, value)
  })
  return deleted.length > 0 || put.length > 0
    ? {
        ...(deleted.length > 0 ? { delete: deleted } : {}),
        ...(put.length > 0 ? { put } : {}),
      }
    : undefined
}

const membershipKey = (membership: PersistenceV2CollectionMembership): string =>
  `${membership.collectionId}\u0000${membership.urlId}`

const diffMemberships = (
  current: readonly PersistenceV2CollectionMembership[],
  next: readonly PersistenceV2CollectionMembership[],
):
  | PersistenceRecordMutation<
      PersistenceV2CollectionMembership,
      PersistenceV2MembershipKey
    >
  | undefined => {
  const currentByKey = new Map(
    current.map((membership) => [membershipKey(membership), membership]),
  )
  const nextKeys = new Set(next.map(membershipKey))
  const deleted = current
    .filter((membership) => !nextKeys.has(membershipKey(membership)))
    .map(({ collectionId, urlId }): PersistenceV2MembershipKey => [
      collectionId,
      urlId,
    ])
  const put = next.filter((membership) => {
    const previous = currentByKey.get(membershipKey(membership))
    return previous === undefined || !isSameRecord(previous, membership)
  })
  return deleted.length > 0 || put.length > 0
    ? {
        ...(deleted.length > 0 ? { delete: deleted } : {}),
        ...(put.length > 0 ? { put } : {}),
      }
    : undefined
}

const toWritePlan = (
  current: SavedTabsSessionState,
  next: SavedTabsSessionState,
): PersistenceV2WritePlan => {
  const categories = diffById(current.categories, next.categories)
  const collections = diffById(current.collections, next.collections)
  const expiredUrls =
    current.expiredUrls && next.expiredUrls
      ? diffById(current.expiredUrls, next.expiredUrls)
      : undefined
  const groups = diffById(current.groups, next.groups)
  const memberships = diffMemberships(current.memberships, next.memberships)
  const urls = diffById(current.urls, next.urls)
  return {
    ...(categories !== undefined ? { categories } : {}),
    ...(collections !== undefined ? { collections } : {}),
    ...(expiredUrls !== undefined ? { expiredUrls } : {}),
    ...(groups !== undefined ? { groups } : {}),
    ...(memberships !== undefined ? { memberships } : {}),
    ...(urls !== undefined ? { urls } : {}),
  }
}

const hasWritePlanChanges = (plan: PersistenceV2WritePlan): boolean =>
  Object.keys(plan).length > 0

const materializeState = (
  savedTabs: PersistenceV2Snapshot,
): IndexedDbSavedTabsMutableState => ({
  categories: [...savedTabs.categories],
  collections: [...savedTabs.collections],
  groups: [...savedTabs.groups],
  memberships: [...savedTabs.memberships],
  urls: [...savedTabs.urls],
})

export class IndexedDbSavedTabsSessionService {
  private readonly deps: IndexedDbSavedTabsSessionServiceDeps

  constructor(deps: IndexedDbSavedTabsSessionServiceDeps) {
    this.deps = deps
  }

  async run<Result>(
    operation: (
      state: IndexedDbSavedTabsMutableState,
    ) => Promise<Result> | Result,
    onCommitFailure?: (error: unknown, result: Result) => never,
  ): Promise<Result> {
    const { result } = await this.runSavedTabs(operation, { onCommitFailure })
    return result
  }

  async runUndoable<Result>(
    operation: (
      state: IndexedDbSavedTabsMutableState,
    ) => Promise<Result> | Result,
  ): Promise<SessionResult<Result>> {
    return this.runSavedTabs(operation, { undo: true })
  }

  async runWithExpiredUrls<Result>(
    operation: (
      state: SavedTabsStateWithExpiredUrls,
    ) => Promise<Result> | Result,
  ): Promise<Result> {
    const { revision, state } = await this.readExpiredState()
    const { result } = await this.runState(revision, state, operation, {})
    return result
  }

  async runUndoableWithExpiredUrls<Result>(
    operation: (
      state: SavedTabsStateWithExpiredUrls,
      cutoff: number,
    ) => Promise<Result> | Result,
    clock: () => number,
  ): Promise<SessionResult<Result>> {
    const { revision, state } = await this.readExpiredState()
    const cutoff = clock()
    return this.runState(
      revision,
      state,
      async (next) => operation(next, cutoff),
      {
        undo: { clock, cutoff },
      },
    )
  }

  private async runSavedTabs<Result>(
    operation: (
      state: IndexedDbSavedTabsMutableState,
    ) => Promise<Result> | Result,
    options: SessionOptions<Result>,
  ): Promise<SessionResult<Result>> {
    const { revision, savedTabs } =
      await this.deps.snapshotReaderPort.readVerifiedSavedTabsSnapshot()
    return this.runState(
      revision,
      materializeState(savedTabs),
      operation,
      options,
    )
  }

  private async readExpiredState() {
    const read = this.deps.readWithExpiredUrls
    if (!read) {
      throw new Error('The expiration recovery reader has not been configured.')
    }
    const { expiredUrls, revision, savedTabs } = await read()
    return {
      revision,
      state: { ...materializeState(savedTabs), expiredUrls: [...expiredUrls] },
    }
  }

  private async runState<State extends SavedTabsSessionState, Result>(
    revision: number,
    source: State,
    operation: (state: State) => Promise<Result> | Result,
    options: SessionOptions<Result>,
  ): Promise<SessionResult<Result>> {
    const state = structuredClone(source)
    const archiveUndo =
      typeof options.undo === 'object' ? options.undo : undefined
    const result = await operation(state)
    const plan = toWritePlan(source, state)
    if (!hasWritePlanChanges(plan)) {
      return { result }
    }

    // Restoring also purges overdue archive rows. Undo must leave those purged.
    const undoSource =
      archiveUndo === undefined
        ? source
        : {
            ...source,
            expiredUrls:
              source.expiredUrls?.filter(
                ({ recoverUntil }) => recoverUntil > archiveUndo.cutoff,
              ) ?? [],
          }
    const inverse = options.undo && toWritePlan(state, undoSource)
    const commit = this.commit(plan, revision).catch((error: unknown) => {
      options.onCommitFailure?.(error, result)
      throw error
    })
    if (!inverse || !hasWritePlanChanges(inverse)) {
      await commit
      return { result }
    }
    const { revision: committedRevision } = await commit
    const clock = archiveUndo?.clock
    const assertCanCommit =
      clock &&
      (() => {
        const now = clock()
        if (
          inverse.expiredUrls?.put?.some(
            ({ recoverUntil }) => recoverUntil <= now,
          )
        ) {
          throw new Error('The original recovery deadline has passed.')
        }
      })
    return {
      result,
      undo: async () => {
        await this.commit(inverse, committedRevision, assertCanCommit)
      },
    }
  }

  private async commit(
    plan: PersistenceV2WritePlan,
    revision: number,
    assertCanCommit?: () => void,
  ) {
    return this.deps.unitOfWorkPort.commit(plan, {
      ...(assertCanCommit ? { assertCanCommit } : {}),
      ...(plan.expiredUrls ? { durability: 'strict' } : {}),
      expectedRevision: revision,
    })
  }
}
