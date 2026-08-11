import type { PersistenceVersionedSavedTabsSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { PERSISTENCE_V2_ORDERING_POLICY } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type { IndexedDbSavedTabsMutableState } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'
import { toHostname } from '@/utils/domain-normalize'

import type {
  BackgroundSavedTabInput,
  BackgroundSavedTabsDataPlane,
  SavedTabsInsightRecord,
} from './backgroundSavedTabsDataPlaneTypes'

type NativeSession = {
  readonly run: <Result>(
    operation: (
      state: IndexedDbSavedTabsMutableState,
    ) => Promise<Result> | Result,
  ) => Promise<Result>
}

export type CreateBackgroundSavedTabsIndexedDbDataPlaneOptions = {
  readonly idGenerator: () => string
  readonly now: () => number
  readonly readSnapshot: () => Promise<PersistenceVersionedSavedTabsSnapshot>
  readonly session: NativeSession
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const comparableUrl = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl.trim())
    url.hostname = url.hostname.toLowerCase()
    return url.toString()
  } catch {
    return null
  }
}

const collectionMemberships = (
  snapshot: PersistenceV2Snapshot,
  collectionId: string,
): readonly PersistenceV2CollectionMembership[] =>
  snapshot.memberships.filter(
    (membership) => membership.collectionId === collectionId,
  )

const buildInsightRecords = (
  snapshot: PersistenceV2Snapshot,
): SavedTabsInsightRecord[] => {
  const collections = new Map(
    snapshot.collections.map((collection) => [collection.id, collection]),
  )
  const categories = new Map(
    snapshot.categories.map((category) => [category.id, category]),
  )
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]))
  const membershipsByUrl = new Map<
    string,
    PersistenceV2CollectionMembership[]
  >()
  for (const membership of snapshot.memberships) {
    const memberships = membershipsByUrl.get(membership.urlId) ?? []
    memberships.push(membership)
    membershipsByUrl.set(membership.urlId, memberships)
  }

  return snapshot.urls
    .map((url): SavedTabsInsightRecord => {
      const memberships = membershipsByUrl.get(url.id) ?? []
      const domainMemberships = memberships.filter(
        ({ collectionId }) =>
          collections.get(collectionId)?.definition.type === 'domain',
      )
      const customMemberships = memberships.filter(
        ({ collectionId }) =>
          collections.get(collectionId)?.definition.type === 'custom',
      )
      return {
        domain: toHostname(url.url),
        id: url.id,
        parentCategories: unique(
          domainMemberships.flatMap(({ collectionId }) => {
            const groupId = collections.get(collectionId)?.groupId
            const group = groupId ? groups.get(groupId) : undefined
            return group ? [group.name] : []
          }),
        ),
        projectCategories: unique(
          customMemberships.flatMap(({ categoryId }) => {
            const category = categoryId ? categories.get(categoryId) : undefined
            return category ? [category.name] : []
          }),
        ),
        savedAt: url.lastSavedAt,
        savedInProjects: unique(
          customMemberships.flatMap(({ collectionId }) => {
            const collection = collections.get(collectionId)
            return collection ? [collection.name] : []
          }),
        ),
        savedInTabGroups: unique(
          domainMemberships.flatMap(({ collectionId }) => {
            const collection = collections.get(collectionId)
            return collection?.definition.type === 'domain'
              ? [collection.definition.domain]
              : []
          }),
        ),
        subCategories: unique(
          domainMemberships.flatMap(({ categoryId }) => {
            const category = categoryId ? categories.get(categoryId) : undefined
            return category ? [category.name] : []
          }),
        ),
        title: url.title,
        url: url.url,
      }
    })
    .toSorted((left, right) => right.savedAt - left.savedAt)
}

const removeEmptyDomainCollections = (
  state: IndexedDbSavedTabsMutableState,
): void => {
  const referencedCollectionIds = new Set(
    state.memberships.map(({ collectionId }) => collectionId),
  )
  const removedCollectionIds = new Set(
    state.collections
      .filter(
        (collection) =>
          collection.definition.type === 'domain' &&
          !referencedCollectionIds.has(collection.id),
      )
      .map(({ id }) => id),
  )
  if (removedCollectionIds.size === 0) {
    return
  }
  state.collections = state.collections.filter(
    ({ id }) => !removedCollectionIds.has(id),
  )
  state.categories = state.categories.filter(
    ({ collectionId }) => !removedCollectionIds.has(collectionId),
  )
}

const removeSelectedUrls = (
  state: IndexedDbSavedTabsMutableState,
  selectedIds: ReadonlySet<string>,
  selectedUrls: ReadonlySet<string>,
): number => {
  const removedIds = new Set(
    state.urls
      .filter((url) => {
        const comparable = comparableUrl(url.url)
        return (
          selectedIds.has(url.id) ||
          (comparable !== null && selectedUrls.has(comparable))
        )
      })
      .map(({ id }) => id),
  )
  if (removedIds.size === 0) {
    return 0
  }
  state.urls = state.urls.filter(({ id }) => !removedIds.has(id))
  state.memberships = state.memberships.filter(
    ({ urlId }) => !removedIds.has(urlId),
  )
  removeEmptyDomainCollections(state)
  return removedIds.size
}

const nextSortOrder = (
  values: readonly { readonly sortOrder: number }[],
): number =>
  Math.max(
    -PERSISTENCE_V2_ORDERING_POLICY.initialGap,
    ...values.map(({ sortOrder }) => sortOrder),
  ) + PERSISTENCE_V2_ORDERING_POLICY.initialGap

const includesKeyword = (
  target: string,
  keywords: readonly string[],
): boolean =>
  keywords.some((keyword) => {
    const normalized = keyword.trim().toLowerCase()
    return normalized.length > 0 && target.toLowerCase().includes(normalized)
  })

const projectMatches = (
  collection: PersistenceV2Collection,
  title: string,
  url: string,
): boolean => {
  if (collection.definition.type !== 'custom') {
    return false
  }
  const keywords = collection.definition.projectKeywords
  return (
    includesKeyword(title, keywords.titleKeywords) ||
    includesKeyword(url, keywords.urlKeywords) ||
    includesKeyword(toHostname(url), keywords.domainKeywords)
  )
}

const ensureUncategorizedCollection = (
  state: IndexedDbSavedTabsMutableState,
  timestamp: number,
): PersistenceV2Collection => {
  const existing = state.collections.find(
    ({ id }) => id === 'custom-uncategorized',
  )
  if (existing) {
    return existing
  }
  const collection: PersistenceV2Collection = {
    createdAt: timestamp,
    definition: {
      projectKeywords: {
        domainKeywords: [],
        titleKeywords: [],
        urlKeywords: [],
      },
      type: 'custom',
    },
    id: 'custom-uncategorized',
    name: '未分類',
    sortOrder: nextSortOrder(
      state.collections.filter(
        ({ definition }) => definition.type === 'custom',
      ),
    ),
    updatedAt: timestamp,
  }
  state.collections.push(collection)
  return collection
}

const ensureUrl = (
  state: IndexedDbSavedTabsMutableState,
  input: Required<BackgroundSavedTabInput>,
  idGenerator: () => string,
  timestamp: number,
): PersistenceV2Url => {
  const normalizedUrl = comparableUrl(input.url)
  if (!normalizedUrl) {
    throw new TypeError('A valid normalized URL is required.')
  }
  const existing = state.urls.find((url) => url.normalizedUrl === normalizedUrl)
  if (existing) {
    const updated: PersistenceV2Url = {
      ...existing,
      lastSavedAt: timestamp,
      title: input.title || existing.title,
      updatedAt: timestamp,
      url: normalizedUrl,
    }
    state.urls = state.urls.map((url) =>
      url.id === existing.id ? updated : url,
    )
    return updated
  }
  const created: PersistenceV2Url = {
    firstSavedAt: timestamp,
    id: idGenerator(),
    lastSavedAt: timestamp,
    normalizedUrl,
    title: input.title,
    updatedAt: timestamp,
    url: normalizedUrl,
  }
  state.urls.push(created)
  return created
}

const ensureDomainCollection = (
  state: IndexedDbSavedTabsMutableState,
  domain: string,
  idGenerator: () => string,
  timestamp: number,
): PersistenceV2Collection => {
  const existing = state.collections.find(
    (collection) =>
      collection.definition.type === 'domain' &&
      collection.definition.domain === domain,
  )
  if (existing) {
    return existing
  }
  const collection: PersistenceV2Collection = {
    createdAt: timestamp,
    definition: { domain, type: 'domain' },
    id: idGenerator(),
    name: domain,
    sortOrder: nextSortOrder(
      state.collections.filter(
        ({ definition }) => definition.type === 'domain',
      ),
    ),
    updatedAt: timestamp,
  }
  state.collections.push(collection)
  return collection
}

const upsertMembership = (
  state: IndexedDbSavedTabsMutableState,
  collection: PersistenceV2Collection,
  url: PersistenceV2Url,
  options: { readonly categoryId?: string; readonly timestamp: number },
): void => {
  const { categoryId, timestamp } = options
  const current = state.memberships.find(
    (membership) =>
      membership.collectionId === collection.id && membership.urlId === url.id,
  )
  if (current) {
    if (categoryId && current.categoryId !== categoryId) {
      state.memberships = state.memberships.map((membership) =>
        membership === current
          ? { ...membership, categoryId, updatedAt: timestamp }
          : membership,
      )
    }
    return
  }
  state.memberships.push({
    addedAt: timestamp,
    ...(categoryId ? { categoryId } : {}),
    collectionId: collection.id,
    sortOrder: nextSortOrder(collectionMemberships(state, collection.id)),
    updatedAt: timestamp,
    urlId: url.id,
  })
}

const saveTabs = (
  state: IndexedDbSavedTabsMutableState,
  tabs: readonly BackgroundSavedTabInput[],
  idGenerator: () => string,
  timestamp: number,
): void => {
  const uniqueTabs = new Map<string, Required<BackgroundSavedTabInput>>()
  for (const tab of tabs) {
    const url = comparableUrl(tab.url ?? '')
    if (url) {
      uniqueTabs.set(url, { title: tab.title ?? '', url })
    }
  }
  if (uniqueTabs.size === 0) {
    return
  }
  const uncategorized = ensureUncategorizedCollection(state, timestamp)
  const customCollections = state.collections
    .filter(
      (collection) =>
        collection.definition.type === 'custom' &&
        collection.id !== uncategorized.id,
    )
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    )

  for (const input of uniqueTabs.values()) {
    const url = ensureUrl(state, input, idGenerator, timestamp)
    const domainCollection = ensureDomainCollection(
      state,
      toHostname(url.url),
      idGenerator,
      timestamp,
    )
    const category = state.categories
      .filter(({ collectionId }) => collectionId === domainCollection.id)
      .toSorted(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      )
      .find(({ keywords }) => includesKeyword(url.title, keywords))
    upsertMembership(state, domainCollection, url, {
      ...(category ? { categoryId: category.id } : {}),
      timestamp,
    })

    state.memberships = state.memberships.filter(({ collectionId, urlId }) => {
      const collection = state.collections.find(({ id }) => id === collectionId)
      return urlId !== url.id || collection?.definition.type !== 'custom'
    })
    const project =
      customCollections.find((collection) =>
        projectMatches(collection, url.title, url.url),
      ) ?? uncategorized
    upsertMembership(state, project, url, { timestamp })
    state.collections = state.collections.map((collection) =>
      collection.id === project.id
        ? { ...collection, updatedAt: timestamp }
        : collection,
    )
  }
}

const removeExpiredUrls = (
  state: IndexedDbSavedTabsMutableState,
  cutoffTime: number,
  _currentTime: number,
): { readonly removedCount: number; readonly sourceCount: number } => {
  const collections = new Map(
    state.collections.map((collection) => [collection.id, collection]),
  )
  const urls = new Map(state.urls.map((url) => [url.id, url]))
  const expired = new Set<string>()
  let sourceCount = 0
  for (const membership of state.memberships) {
    const collection = collections.get(membership.collectionId)
    if (collection?.definition.type !== 'domain') {
      continue
    }
    sourceCount += 1
    const savedAt =
      urls.get(membership.urlId)?.lastSavedAt ?? collection.createdAt
    if (savedAt < cutoffTime) {
      expired.add(`${membership.collectionId}\u0000${membership.urlId}`)
    }
  }
  if (expired.size === 0) {
    return { removedCount: 0, sourceCount }
  }
  state.memberships = state.memberships.filter(
    ({ collectionId, urlId }) => !expired.has(`${collectionId}\u0000${urlId}`),
  )
  removeEmptyDomainCollections(state)
  const referencedUrlIds = new Set(state.memberships.map(({ urlId }) => urlId))
  state.urls = state.urls.filter(({ id }) => referencedUrlIds.has(id))
  return { removedCount: expired.size, sourceCount }
}

export const createBackgroundSavedTabsIndexedDbDataPlane = ({
  idGenerator,
  now,
  readSnapshot,
  session,
}: CreateBackgroundSavedTabsIndexedDbDataPlaneOptions): BackgroundSavedTabsDataPlane => ({
  readInsightRecords: async () =>
    buildInsightRecords((await readSnapshot()).savedTabs),
  readUndoSnapshot: readSnapshot,
  removeExpiredUrls: async (cutoffTime, currentTime) =>
    session.run((state) => removeExpiredUrls(state, cutoffTime, currentTime)),
  removeUrl: async (url) => {
    const normalized = comparableUrl(url)
    return normalized
      ? session.run((state) =>
          removeSelectedUrls(state, new Set(), new Set([normalized])),
        )
      : 0
  },
  removeUrlIds: async (urlIds) =>
    session.run((state) =>
      removeSelectedUrls(state, new Set(urlIds), new Set()),
    ),
  restoreUndoSnapshot: async (snapshot) =>
    session.run((state) => {
      state.categories = [...structuredClone(snapshot.savedTabs.categories)]
      state.collections = [...structuredClone(snapshot.savedTabs.collections)]
      state.groups = [...structuredClone(snapshot.savedTabs.groups)]
      state.memberships = [...structuredClone(snapshot.savedTabs.memberships)]
      state.urls = [...structuredClone(snapshot.savedTabs.urls)]
    }),
  saveTabs: async (tabs) =>
    session.run((state) => {
      saveTabs(state, tabs, idGenerator, now())
    }),
  updateTabTimestamps: async (timestamp) =>
    session.run((state) => {
      const domainCollectionIds = new Set(
        state.collections
          .filter(({ definition }) => definition.type === 'domain')
          .map(({ id }) => id),
      )
      const urlIds = new Set(
        state.memberships
          .filter(({ collectionId }) => domainCollectionIds.has(collectionId))
          .map(({ urlId }) => urlId),
      )
      if (urlIds.size === 0) {
        return { success: false }
      }
      state.urls = state.urls.map((url) =>
        urlIds.has(url.id)
          ? { ...url, lastSavedAt: timestamp, updatedAt: timestamp }
          : url,
      )
      return { success: true }
    }),
})
