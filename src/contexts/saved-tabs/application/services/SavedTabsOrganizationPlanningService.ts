import type {
  SavedTabsOrganizationPreviewDto,
  SavedTabsOrganizationProposal,
} from '@/contexts/saved-tabs/application/dto/SavedTabsOrganizationDto'
import { SavedTabsOrganizationError } from '@/contexts/saved-tabs/application/errors/SavedTabsOrganizationError'
import type {
  PersistenceRecordMutation,
  PersistenceV2MembershipKey,
  PersistenceV2WritePlan,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { PERSISTENCE_V2_ORDERING_POLICY } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import {
  checkPersistenceIntegrity,
  hasBlockingPersistenceIntegrityIssues,
} from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

export type SavedTabsOrganizationWritePlan = Pick<
  PersistenceV2WritePlan,
  'categories' | 'collections' | 'groups' | 'memberships' | 'urls'
>

export const sameOrganizationState = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const diffRecords = <Value, Key>(
  before: readonly Value[],
  after: readonly Value[],
  identify: (value: Value) => Key,
): PersistenceRecordMutation<Value, Key> | undefined => {
  const beforeByKey = new Map(
    before.map((value) => [JSON.stringify(identify(value)), value]),
  )
  const afterKeys = new Set(
    after.map((value) => JSON.stringify(identify(value))),
  )
  const deleted = before
    .filter((value) => !afterKeys.has(JSON.stringify(identify(value))))
    .map(identify)
  const put = after.filter(
    (value) =>
      !sameOrganizationState(
        beforeByKey.get(JSON.stringify(identify(value))),
        value,
      ),
  )
  return deleted.length > 0 || put.length > 0
    ? { delete: deleted, put }
    : undefined
}

export const organizationWritePlan = (
  before: PersistenceV2Snapshot,
  after: PersistenceV2Snapshot,
): SavedTabsOrganizationWritePlan => {
  const identify = (value: { readonly id: string }) => value.id
  const categories = diffRecords(before.categories, after.categories, identify)
  const collections = diffRecords(
    before.collections,
    after.collections,
    identify,
  )
  const groups = diffRecords(before.groups, after.groups, identify)
  const urls = diffRecords(before.urls, after.urls, identify)
  const memberships = diffRecords(
    before.memberships,
    after.memberships,
    ({ collectionId, urlId }): PersistenceV2MembershipKey => [
      collectionId,
      urlId,
    ],
  )
  return {
    ...(categories ? { categories } : {}),
    ...(collections ? { collections } : {}),
    ...(groups ? { groups } : {}),
    ...(memberships ? { memberships } : {}),
    ...(urls ? { urls } : {}),
  }
}

const projectById = (
  snapshot: PersistenceV2Snapshot,
  id: string,
): PersistenceV2Collection => {
  const project = snapshot.collections.find(
    (collection) =>
      collection.id === id && collection.definition.type === 'custom',
  )
  if (!project) {
    throw new SavedTabsOrganizationError('TARGET_NOT_FOUND')
  }
  return project
}

const nextSortOrder = (
  records: readonly { readonly sortOrder: number }[],
): number =>
  Math.max(
    -PERSISTENCE_V2_ORDERING_POLICY.initialGap,
    ...records.map(({ sortOrder }) => sortOrder),
  ) + PERSISTENCE_V2_ORDERING_POLICY.initialGap

const describeMembership = (
  snapshot: PersistenceV2Snapshot,
  membership: PersistenceV2CollectionMembership,
): string => {
  const project = snapshot.collections.find(
    ({ id }) => id === membership.collectionId,
  )
  const category = snapshot.categories.find(
    ({ id }) => id === membership.categoryId,
  )
  return `${project?.name ?? membership.collectionId} / ${category?.name ?? '—'}`
}

const setCategory = (
  snapshot: PersistenceV2Snapshot,
  proposal: Extract<
    SavedTabsOrganizationProposal,
    { readonly kind: 'set_category' }
  >,
  timestamp: number,
): PersistenceV2Snapshot => {
  projectById(snapshot, proposal.projectId)
  if (
    proposal.categoryId !== null &&
    !snapshot.categories.some(
      ({ id, collectionId }) =>
        id === proposal.categoryId && collectionId === proposal.projectId,
    )
  ) {
    throw new SavedTabsOrganizationError('TARGET_NOT_FOUND')
  }
  const ids = new Set(proposal.urlIds)
  if (
    proposal.urlIds.some(
      (urlId) =>
        !snapshot.memberships.some(
          (membership) =>
            membership.collectionId === proposal.projectId &&
            membership.urlId === urlId,
        ),
    )
  ) {
    throw new SavedTabsOrganizationError('TARGET_NOT_FOUND')
  }
  return {
    ...snapshot,
    memberships: snapshot.memberships.map((membership) => {
      if (
        membership.collectionId !== proposal.projectId ||
        !ids.has(membership.urlId) ||
        (membership.categoryId ?? null) === proposal.categoryId
      ) {
        return membership
      }
      const { categoryId: _categoryId, ...rest } = membership
      return {
        ...rest,
        ...(proposal.categoryId !== null
          ? { categoryId: proposal.categoryId }
          : {}),
        updatedAt: timestamp,
      }
    }),
  }
}

const moveUrls = (
  snapshot: PersistenceV2Snapshot,
  proposal: Extract<
    SavedTabsOrganizationProposal,
    { readonly kind: 'move_urls' }
  >,
  timestamp: number,
): PersistenceV2Snapshot => {
  projectById(snapshot, proposal.sourceProjectId)
  projectById(snapshot, proposal.targetProjectId)
  if (proposal.sourceProjectId === proposal.targetProjectId) {
    throw new SavedTabsOrganizationError('INVALID_PROPOSAL')
  }
  const ids = new Set(proposal.urlIds)
  const source = snapshot.memberships.filter(
    ({ collectionId, urlId }) =>
      collectionId === proposal.sourceProjectId && ids.has(urlId),
  )
  if (source.length !== ids.size) {
    throw new SavedTabsOrganizationError('TARGET_NOT_FOUND')
  }
  const memberships = snapshot.memberships.filter(
    ({ collectionId, urlId }) =>
      collectionId !== proposal.sourceProjectId || !ids.has(urlId),
  )
  for (const membership of source) {
    if (
      memberships.some(
        ({ collectionId, urlId }) =>
          collectionId === proposal.targetProjectId &&
          urlId === membership.urlId,
      )
    ) {
      throw new SavedTabsOrganizationError('INVALID_PROPOSAL')
    }
    memberships.push({
      addedAt: timestamp,
      addedAtProvenance: 'exact',
      collectionId: proposal.targetProjectId,
      ...(membership.notes !== undefined ? { notes: membership.notes } : {}),
      sortOrder: nextSortOrder(
        memberships.filter(
          ({ collectionId }) => collectionId === proposal.targetProjectId,
        ),
      ),
      updatedAt: timestamp,
      urlId: membership.urlId,
    })
  }
  return { ...snapshot, memberships }
}

const deleteUrls = (
  snapshot: PersistenceV2Snapshot,
  ids: ReadonlySet<string>,
): PersistenceV2Snapshot => {
  const memberships = snapshot.memberships.filter(
    ({ urlId }) => !ids.has(urlId),
  )
  const touched = new Set(
    snapshot.memberships
      .filter(({ urlId }) => ids.has(urlId))
      .map(({ collectionId }) => collectionId),
  )
  const emptiedDomainIds = new Set(
    snapshot.collections
      .filter(
        (collection) =>
          collection.definition.type === 'domain' &&
          touched.has(collection.id) &&
          !memberships.some(
            ({ collectionId }) => collectionId === collection.id,
          ),
      )
      .map(({ id }) => id),
  )
  return {
    ...snapshot,
    categories: snapshot.categories.filter(
      ({ collectionId }) => !emptiedDomainIds.has(collectionId),
    ),
    collections: snapshot.collections.filter(
      ({ id }) => !emptiedDomainIds.has(id),
    ),
    memberships,
    urls: snapshot.urls.filter(({ id }) => !ids.has(id)),
  }
}

const createProject = (
  snapshot: PersistenceV2Snapshot,
  name: string,
  id: string,
  timestamp: number,
): PersistenceV2Snapshot => {
  if (
    snapshot.collections.some(
      (collection) =>
        collection.definition.type === 'custom' &&
        collection.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new SavedTabsOrganizationError('DUPLICATE_PROJECT_NAME')
  }
  if (!id || snapshot.collections.some((collection) => collection.id === id)) {
    throw new SavedTabsOrganizationError('INTEGRITY_ERROR')
  }
  return {
    ...snapshot,
    collections: [
      ...snapshot.collections,
      {
        createdAt: timestamp,
        definition: {
          projectKeywords: {
            domainKeywords: [],
            titleKeywords: [],
            urlKeywords: [],
          },
          type: 'custom',
        },
        id,
        name,
        sortOrder: nextSortOrder(
          snapshot.collections.filter(
            ({ definition }) => definition.type === 'custom',
          ),
        ),
        updatedAt: timestamp,
      },
    ],
  }
}

export const assertOrganizationIntegrity = (
  snapshot: PersistenceV2Snapshot,
): void => {
  if (
    hasBlockingPersistenceIntegrityIssues(checkPersistenceIntegrity(snapshot))
  ) {
    throw new SavedTabsOrganizationError('INTEGRITY_ERROR')
  }
}

export const planSavedTabsOrganization = (
  snapshot: PersistenceV2Snapshot,
  proposal: SavedTabsOrganizationProposal,
  timestamp: number,
  projectId: string,
): {
  readonly next: PersistenceV2Snapshot
  readonly targets: SavedTabsOrganizationPreviewDto['targets']
} => {
  if (proposal.kind === 'create_project') {
    return {
      next: createProject(snapshot, proposal.name, projectId, timestamp),
      targets: [
        {
          after: proposal.name,
          before: '—',
          id: projectId,
          title: proposal.name,
          url: '',
        },
      ],
    }
  }
  const urls = proposal.urlIds.map((id) => {
    const url = snapshot.urls.find((candidate) => candidate.id === id)
    if (!url) {
      throw new SavedTabsOrganizationError('TARGET_NOT_FOUND')
    }
    return url
  })
  let next: PersistenceV2Snapshot
  let relevantCollectionId: string | undefined
  if (proposal.kind === 'set_category') {
    next = setCategory(snapshot, proposal, timestamp)
    relevantCollectionId = proposal.projectId
  } else if (proposal.kind === 'move_urls') {
    next = moveUrls(snapshot, proposal, timestamp)
    relevantCollectionId = proposal.sourceProjectId
  } else {
    next = deleteUrls(snapshot, new Set(proposal.urlIds))
  }
  return {
    next,
    targets: urls.map(({ id, title, url }) => ({
      after:
        proposal.kind === 'delete_urls'
          ? '—'
          : next.memberships
              .filter(
                (membership) =>
                  membership.urlId === id &&
                  membership.collectionId ===
                    (proposal.kind === 'move_urls'
                      ? proposal.targetProjectId
                      : proposal.projectId),
              )
              .map((membership) => describeMembership(next, membership))
              .join(', '),
      before: snapshot.memberships
        .filter(
          (membership) =>
            membership.urlId === id &&
            (relevantCollectionId === undefined ||
              membership.collectionId === relevantCollectionId),
        )
        .map((membership) => describeMembership(snapshot, membership))
        .join(', '),
      id,
      title,
      url,
    })),
  }
}

const applyRecords = <Value, Key>(
  records: readonly Value[],
  mutation: PersistenceRecordMutation<Value, Key> | undefined,
  identify: (value: Value) => Key,
): readonly Value[] => {
  const removed = new Set(
    (mutation?.delete ?? []).map((key) => JSON.stringify(key)),
  )
  const replacements = new Map(
    (mutation?.put ?? []).map((record) => [
      JSON.stringify(identify(record)),
      record,
    ]),
  )
  return [
    ...records.filter(
      (record) =>
        !removed.has(JSON.stringify(identify(record))) &&
        !replacements.has(JSON.stringify(identify(record))),
    ),
    ...replacements.values(),
  ]
}

export const applyOrganizationWritePlan = (
  snapshot: PersistenceV2Snapshot,
  plan: SavedTabsOrganizationWritePlan,
): PersistenceV2Snapshot => {
  const identify = (value: { readonly id: string }) => value.id
  return {
    categories: applyRecords(snapshot.categories, plan.categories, identify),
    collections: applyRecords(snapshot.collections, plan.collections, identify),
    groups: applyRecords(snapshot.groups, plan.groups, identify),
    memberships: applyRecords(
      snapshot.memberships,
      plan.memberships,
      ({ collectionId, urlId }): PersistenceV2MembershipKey => [
        collectionId,
        urlId,
      ],
    ),
    urls: applyRecords(snapshot.urls, plan.urls, identify),
  }
}

const affectedRecords = <Value, Key>(
  records: readonly Value[],
  mutation: PersistenceRecordMutation<Value, Key> | undefined,
  identify: (value: Value) => Key,
): readonly Value[] => {
  const keys = new Set(
    [...(mutation?.delete ?? []), ...(mutation?.put ?? []).map(identify)].map(
      (key) => JSON.stringify(key),
    ),
  )
  return records
    .filter((record) => keys.has(JSON.stringify(identify(record))))
    .toSorted((left, right) =>
      JSON.stringify(identify(left)).localeCompare(
        JSON.stringify(identify(right)),
      ),
    )
}

export const organizationAffectedState = (
  snapshot: PersistenceV2Snapshot,
  plan: SavedTabsOrganizationWritePlan,
): PersistenceV2Snapshot => {
  const identify = (value: { readonly id: string }) => value.id
  return {
    categories: affectedRecords(snapshot.categories, plan.categories, identify),
    collections: affectedRecords(
      snapshot.collections,
      plan.collections,
      identify,
    ),
    groups: affectedRecords(snapshot.groups, plan.groups, identify),
    memberships: affectedRecords(
      snapshot.memberships,
      plan.memberships,
      ({ collectionId, urlId }): PersistenceV2MembershipKey => [
        collectionId,
        urlId,
      ],
    ),
    urls: affectedRecords(snapshot.urls, plan.urls, identify),
  }
}
