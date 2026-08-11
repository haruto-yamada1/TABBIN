import type { PersistenceV2QueryPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2QueryPort'
import type {
  PersistenceRecordMutation,
  PersistenceV2MembershipKey,
  PersistenceV2UnitOfWorkPort,
  PersistenceV2WritePlan,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
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
  readonly queryPort: PersistenceV2QueryPort
  readonly unitOfWorkPort: PersistenceV2UnitOfWorkPort
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
    .map(
      ({ collectionId, urlId }): PersistenceV2MembershipKey => [
        collectionId,
        urlId,
      ],
    )
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
  current: IndexedDbSavedTabsMutableState,
  next: IndexedDbSavedTabsMutableState,
): PersistenceV2WritePlan => ({
  ...(diffById(current.categories, next.categories)
    ? { categories: diffById(current.categories, next.categories) }
    : {}),
  ...(diffById(current.collections, next.collections)
    ? { collections: diffById(current.collections, next.collections) }
    : {}),
  ...(diffById(current.groups, next.groups)
    ? { groups: diffById(current.groups, next.groups) }
    : {}),
  ...(diffMemberships(current.memberships, next.memberships)
    ? { memberships: diffMemberships(current.memberships, next.memberships) }
    : {}),
  ...(diffById(current.urls, next.urls)
    ? { urls: diffById(current.urls, next.urls) }
    : {}),
})

const hasWritePlanChanges = (plan: PersistenceV2WritePlan): boolean =>
  Object.keys(plan).length > 0

const materializeState = async (
  queryPort: PersistenceV2QueryPort,
): Promise<{
  readonly revision: number
  readonly state: IndexedDbSavedTabsMutableState
}> => {
  const initial = await queryPort.readInitialLoad()
  const urlsById = new Map<string, PersistenceV2Url>()
  const memberships: PersistenceV2CollectionMembership[] = []
  for (const projection of initial.collections) {
    for (const item of projection.items) {
      memberships.push(item.membership)
      urlsById.set(item.url.id, item.url)
    }
  }
  return {
    revision: initial.revision,
    state: {
      categories: [...initial.categories],
      collections: initial.collections.map(({ collection }) => collection),
      groups: [...initial.groups],
      memberships,
      urls: [...urlsById.values()],
    },
  }
}

export class IndexedDbSavedTabsSessionService {
  private readonly deps: IndexedDbSavedTabsSessionServiceDeps

  constructor(deps: IndexedDbSavedTabsSessionServiceDeps) {
    this.deps = deps
  }

  async run<Result>(
    operation: (
      state: IndexedDbSavedTabsMutableState,
    ) => Promise<Result> | Result,
  ): Promise<Result> {
    const { revision, state: source } = await materializeState(
      this.deps.queryPort,
    )
    const state = structuredClone(source)
    const result = await operation(state)
    const plan = toWritePlan(source, state)
    if (hasWritePlanChanges(plan)) {
      await this.deps.unitOfWorkPort.commit(plan, {
        expectedRevision: revision,
      })
    }
    return result
  }
}
