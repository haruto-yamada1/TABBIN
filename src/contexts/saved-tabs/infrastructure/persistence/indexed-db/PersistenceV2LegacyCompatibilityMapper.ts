import type {
  CustomProject,
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/contexts/saved-tabs/application/dto/LegacyChromeStorageDto'
import { mapLegacyStorageToPersistenceV2 } from '@/contexts/saved-tabs/application/mappers/LegacyStorageToPersistenceV2Mapper'
import type {
  MigrationSourceKey,
  RawLegacyStorageSnapshot,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

export type LegacyCompatibilityStorageRecord = {
  readonly customProjectOrder: string[]
  readonly customProjects: CustomProject[]
  readonly domainCategoryMappings: DomainParentCategoryMapping[]
  readonly domainCategorySettings: DomainCategorySettings[]
  readonly parentCategories: ParentCategory[]
  readonly savedTabs: TabGroup[]
  readonly urls: UrlRecord[]
}

export class PersistenceV2CompatibilityMutationError extends Error {
  readonly issueCodes: readonly string[]

  constructor(issueCodes: readonly string[]) {
    super(
      `Persistence v2 compatibility mutation is invalid: ${issueCodes.join(', ')}`,
    )
    this.issueCodes = issueCodes
    this.name = 'PersistenceV2CompatibilityMutationError'
  }
}

const byOrderThenId = <Value extends { id: string; sortOrder: number }>(
  left: Value,
  right: Value,
): number => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)

const membershipsFor = (
  snapshot: PersistenceV2Snapshot,
  collectionId: string,
): readonly PersistenceV2CollectionMembership[] =>
  snapshot.memberships
    .filter((membership) => membership.collectionId === collectionId)
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.urlId.localeCompare(right.urlId),
    )

const categoriesFor = (
  snapshot: PersistenceV2Snapshot,
  collectionId: string,
): readonly PersistenceV2CollectionCategory[] =>
  snapshot.categories
    .filter((category) => category.collectionId === collectionId)
    .toSorted(byOrderThenId)

const projectDomainCollection = (
  snapshot: PersistenceV2Snapshot,
  collection: PersistenceV2Collection,
): TabGroup => {
  if (collection.definition.type !== 'domain') {
    throw new TypeError('Expected a domain collection.')
  }
  const categories = categoriesFor(snapshot, collection.id)
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  const memberships = membershipsFor(snapshot, collection.id)
  const urlsById = new Map(snapshot.urls.map((url) => [url.id, url]))
  const urlSubCategories = Object.fromEntries(
    memberships.flatMap((membership) => {
      if (!membership.categoryId) {
        return []
      }
      const name = categoryNames.get(membership.categoryId)
      return name ? [[membership.urlId, name] as const] : []
    }),
  )

  return {
    categoryKeywords: categories.map(({ keywords, name }) => ({
      categoryName: name,
      keywords: [...keywords],
    })),
    domain: collection.definition.domain,
    id: collection.id,
    ...(collection.groupId ? { parentCategoryId: collection.groupId } : {}),
    savedAt: collection.createdAt,
    subCategories: categories.map(({ name }) => name),
    subCategoryOrder: categories.map(({ name }) => name),
    subCategoryOrderWithUncategorized: categories.map(({ name }) => name),
    urlIds: memberships.map(({ urlId }) => urlId),
    urls: memberships.flatMap((membership) => {
      const url = urlsById.get(membership.urlId)
      if (!url) {
        return []
      }
      const subCategory = membership.categoryId
        ? categoryNames.get(membership.categoryId)
        : undefined
      return [
        {
          id: url.id,
          savedAt: url.firstSavedAt,
          ...(subCategory ? { subCategory } : {}),
          title: url.title,
          url: url.url,
        },
      ]
    }),
    ...(Object.keys(urlSubCategories).length > 0 ? { urlSubCategories } : {}),
  }
}

const projectCustomCollection = (
  snapshot: PersistenceV2Snapshot,
  collection: PersistenceV2Collection,
): CustomProject => {
  if (collection.definition.type !== 'custom') {
    throw new TypeError('Expected a custom collection.')
  }
  const categories = categoriesFor(snapshot, collection.id)
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  const memberships = membershipsFor(snapshot, collection.id)
  const urlsById = new Map(snapshot.urls.map((url) => [url.id, url]))
  const urlMetadata = Object.fromEntries(
    memberships.flatMap((membership) => {
      const category = membership.categoryId
        ? categoryNames.get(membership.categoryId)
        : undefined
      if (!membership.notes && !category) {
        return []
      }
      return [
        [
          membership.urlId,
          {
            ...(category ? { category } : {}),
            ...(membership.notes ? { notes: membership.notes } : {}),
          },
        ] as const,
      ]
    }),
  )

  return {
    categories: categories.map(({ name }) => name),
    categoryOrder: categories.map(({ name }) => name),
    createdAt: collection.createdAt,
    id: collection.id,
    name: collection.name,
    projectKeywords: {
      domainKeywords: [...collection.definition.projectKeywords.domainKeywords],
      titleKeywords: [...collection.definition.projectKeywords.titleKeywords],
      urlKeywords: [...collection.definition.projectKeywords.urlKeywords],
    },
    updatedAt: collection.updatedAt,
    urlIds: memberships.map(({ urlId }) => urlId),
    urls: memberships.flatMap((membership) => {
      const url = urlsById.get(membership.urlId)
      if (!url) {
        return []
      }
      const category = membership.categoryId
        ? categoryNames.get(membership.categoryId)
        : undefined
      return [
        {
          ...(category ? { category } : {}),
          id: url.id,
          ...(membership.notes ? { notes: membership.notes } : {}),
          savedAt: url.firstSavedAt,
          title: url.title,
          url: url.url,
        },
      ]
    }),
    ...(Object.keys(urlMetadata).length > 0 ? { urlMetadata } : {}),
  }
}

export const projectPersistenceV2ToLegacyCompatibilityStorage = (
  snapshot: PersistenceV2Snapshot,
): LegacyCompatibilityStorageRecord => {
  const domainCollections = snapshot.collections
    .filter(({ definition }) => definition.type === 'domain')
    .toSorted(byOrderThenId)
  const customCollections = snapshot.collections
    .filter(({ definition }) => definition.type === 'custom')
    .toSorted(byOrderThenId)

  return {
    customProjectOrder: customCollections.map(({ id }) => id),
    customProjects: customCollections.map((collection) =>
      projectCustomCollection(snapshot, collection),
    ),
    domainCategoryMappings: domainCollections.flatMap((collection) =>
      collection.groupId
        ? [
            {
              categoryId: collection.groupId,
              domain:
                collection.definition.type === 'domain'
                  ? collection.definition.domain
                  : collection.name,
            },
          ]
        : [],
    ),
    domainCategorySettings: domainCollections.map((collection) => {
      const categories = categoriesFor(snapshot, collection.id)
      return {
        categoryKeywords: categories.map(({ keywords, name }) => ({
          categoryName: name,
          keywords: [...keywords],
        })),
        domain:
          collection.definition.type === 'domain'
            ? collection.definition.domain
            : collection.name,
        subCategories: categories.map(({ name }) => name),
      }
    }),
    parentCategories: snapshot.groups.toSorted(byOrderThenId).map((group) => {
      const members = domainCollections.filter(
        ({ groupId }) => groupId === group.id,
      )
      return {
        domainNames: members.map(({ definition, name }) =>
          definition.type === 'domain' ? definition.domain : name,
        ),
        domains: members.map(({ id }) => id),
        id: group.id,
        name: group.name,
      }
    }),
    savedTabs: domainCollections.map((collection) =>
      projectDomainCollection(snapshot, collection),
    ),
    urls: snapshot.urls.map(
      (url): UrlRecord => ({
        ...(url.favIconUrl ? { favIconUrl: url.favIconUrl } : {}),
        id: url.id,
        savedAt: url.firstSavedAt,
        title: url.title,
        url: url.url,
      }),
    ),
  }
}

const toRawSnapshot = (
  record: LegacyCompatibilityStorageRecord,
): RawLegacyStorageSnapshot => {
  const urlsById = new Map(record.urls.map((url) => [url.id, url]))
  const customProjects = record.customProjects.map((project) => {
    if (project.urlIds === undefined) {
      return project
    }
    return {
      ...project,
      urls: project.urlIds.flatMap((urlId) => {
        const url = urlsById.get(urlId)
        if (!url) {
          return []
        }
        const metadata = project.urlMetadata?.[urlId]
        return [
          {
            ...(metadata?.category ? { category: metadata.category } : {}),
            ...(metadata?.notes ? { notes: metadata.notes } : {}),
            savedAt: url.savedAt,
            title: url.title,
            url: url.url,
          },
        ]
      }),
    }
  })
  const savedTabs = record.savedTabs.map((group) => {
    if (group.urlIds === undefined) {
      return group
    }
    return {
      ...group,
      urls: group.urlIds.flatMap((urlId) => {
        const url = urlsById.get(urlId)
        if (!url) {
          return []
        }
        const subCategory = group.urlSubCategories?.[urlId]
        return [
          {
            id: url.id,
            savedAt: url.savedAt,
            ...(subCategory ? { subCategory } : {}),
            title: url.title,
            url: url.url,
          },
        ]
      }),
    }
  })
  const values: Readonly<Record<MigrationSourceKey, unknown>> = {
    activeAiChatConversationId: '',
    aiChatConversations: [],
    customProjectOrder: record.customProjectOrder,
    customProjects,
    domainCategoryMappings: record.domainCategoryMappings,
    domainCategorySettings: record.domainCategorySettings,
    parentCategories: record.parentCategories,
    savedAnalyticsViews: [],
    savedTabs,
    urls: record.urls,
  }
  return {
    activeAiChatConversationId: {
      status: 'present',
      value: values.activeAiChatConversationId,
    },
    aiChatConversations: {
      status: 'present',
      value: values.aiChatConversations,
    },
    customProjectOrder: {
      status: 'present',
      value: values.customProjectOrder,
    },
    customProjects: { status: 'present', value: values.customProjects },
    domainCategoryMappings: {
      status: 'present',
      value: values.domainCategoryMappings,
    },
    domainCategorySettings: {
      status: 'present',
      value: values.domainCategorySettings,
    },
    parentCategories: { status: 'present', value: values.parentCategories },
    savedAnalyticsViews: {
      status: 'present',
      value: values.savedAnalyticsViews,
    },
    savedTabs: { status: 'present', value: values.savedTabs },
    urls: { status: 'present', value: values.urls },
  }
}

const preserveById = <Value extends { id: string }>(
  current: readonly Value[],
  next: readonly Value[],
  preserve: (currentValue: Value, nextValue: Value) => Value,
): readonly Value[] => {
  const currentById = new Map(current.map((value) => [value.id, value]))
  return next.map((value) => {
    const existing = currentById.get(value.id)
    return existing ? preserve(existing, value) : value
  })
}

const preserveUrlProvenance = (
  current: PersistenceV2Url,
  next: PersistenceV2Url,
): PersistenceV2Url => ({
  ...next,
  firstSavedAt: current.firstSavedAt,
  firstSavedAtProvenance: current.firstSavedAtProvenance ?? 'legacy-fallback',
  lastSavedAtProvenance:
    current.lastSavedAt === next.lastSavedAt
      ? (current.lastSavedAtProvenance ?? 'legacy-fallback')
      : (next.lastSavedAtProvenance ?? 'legacy-fallback'),
  updatedAt:
    current.url === next.url &&
    current.title === next.title &&
    current.favIconUrl === next.favIconUrl &&
    current.lastSavedAt === next.lastSavedAt
      ? current.updatedAt
      : next.updatedAt,
})

const preserveCollectionProvenance = (
  current: PersistenceV2Collection,
  next: PersistenceV2Collection,
): PersistenceV2Collection => ({
  ...next,
  createdAt: current.createdAt,
  updatedAt:
    current.name === next.name &&
    current.groupId === next.groupId &&
    JSON.stringify(current.definition) === JSON.stringify(next.definition) &&
    current.sortOrder === next.sortOrder
      ? current.updatedAt
      : next.updatedAt,
})

const preserveCategoryProvenance = (
  current: PersistenceV2CollectionCategory,
  next: PersistenceV2CollectionCategory,
): PersistenceV2CollectionCategory => ({
  ...next,
  createdAt: current.createdAt,
  updatedAt:
    current.name === next.name &&
    current.sortOrder === next.sortOrder &&
    JSON.stringify(current.keywords) === JSON.stringify(next.keywords)
      ? current.updatedAt
      : next.updatedAt,
})

const preserveGroupProvenance = (
  current: PersistenceV2CollectionGroup,
  next: PersistenceV2CollectionGroup,
): PersistenceV2CollectionGroup => ({
  ...next,
  createdAt: current.createdAt,
  updatedAt:
    current.name === next.name && current.sortOrder === next.sortOrder
      ? current.updatedAt
      : next.updatedAt,
})

const preserveMembershipProvenance = (
  current: PersistenceV2CollectionMembership,
  next: PersistenceV2CollectionMembership,
): PersistenceV2CollectionMembership => ({
  ...next,
  addedAt: current.addedAt,
  addedAtProvenance: current.addedAtProvenance ?? 'legacy-fallback',
  updatedAt:
    current.categoryId === next.categoryId &&
    current.notes === next.notes &&
    current.sortOrder === next.sortOrder
      ? current.updatedAt
      : next.updatedAt,
})

export const mergeLegacyCompatibilityStorageRecord = (
  current: PersistenceV2Snapshot,
  record: LegacyCompatibilityStorageRecord,
): PersistenceV2Snapshot => {
  const projectIds = record.customProjects.map(({ id }) => id)
  const knownProjectIds = new Set(projectIds)
  const normalizedProjectOrder = [
    ...record.customProjectOrder.filter((id) => knownProjectIds.has(id)),
    ...projectIds.filter((id) => !record.customProjectOrder.includes(id)),
  ]
  const analysis = mapLegacyStorageToPersistenceV2(
    toRawSnapshot({
      ...record,
      customProjectOrder: normalizedProjectOrder,
    }),
  )
  const errorCodes = analysis.issues
    .filter(({ severity }) => severity === 'error')
    .map(({ code }) => code)
  if (errorCodes.length > 0) {
    throw new PersistenceV2CompatibilityMutationError(errorCodes)
  }
  const next = analysis.snapshot
  const currentMemberships = new Map(
    current.memberships.map((membership) => [
      `${membership.collectionId}\0${membership.urlId}`,
      membership,
    ]),
  )

  return {
    categories: preserveById(
      current.categories,
      next.categories,
      preserveCategoryProvenance,
    ),
    collections: preserveById(
      current.collections,
      next.collections,
      preserveCollectionProvenance,
    ),
    groups: preserveById(current.groups, next.groups, preserveGroupProvenance),
    memberships: next.memberships.map((membership) => {
      const existing = currentMemberships.get(
        `${membership.collectionId}\0${membership.urlId}`,
      )
      return existing
        ? preserveMembershipProvenance(existing, membership)
        : membership
    }),
    urls: preserveById(current.urls, next.urls, preserveUrlProvenance),
  }
}
