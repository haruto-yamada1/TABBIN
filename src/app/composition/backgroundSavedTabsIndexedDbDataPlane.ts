import type { ExpiredUrlRecoveryDto } from '@/contexts/saved-tabs/application/dto/ExpiredUrlRecoveryDto'
import type { PersistenceVersionedSavedTabsSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type { ExpiredUrlRecoveryRecord } from '@/contexts/saved-tabs/domain/entities/ExpiredUrlRecovery'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { PERSISTENCE_V2_ORDERING_POLICY } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import {
  discardExpiredUrls,
  expireSavedUrls,
  isRecoverableExpiredUrl,
  getRecoverableExpiredUrls,
  restoreExpiredUrls,
} from '@/contexts/saved-tabs/domain/services/ExpiredUrlRecoveryService'
import type { ExpiredUrlRecoveryState } from '@/contexts/saved-tabs/domain/services/ExpiredUrlRecoveryService'
import { createUrlIdentityKey } from '@/contexts/saved-tabs/domain/services/UrlIdentityPolicy'
import type { IndexedDbSavedTabsMutableState } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'
import { BACKUP_RESOURCE_LIMITS } from '@/lib/persistence/backupResourcePolicy'
import { toHostname } from '@/utils/domain-normalize'

import type {
  BackgroundSavedTabInput,
  BackgroundSavedTabsDataPlane,
  SavedTabsAnalyticsRecord,
  SavedTabsInsightRecord,
} from './backgroundSavedTabsDataPlaneTypes'

type NativeSession = {
  readonly runWithExpiredUrls: <Result>(
    operation: (state: ExpiredUrlRecoveryState) => Result,
  ) => Promise<Result>
  readonly run: <Result>(
    operation: (
      state: IndexedDbSavedTabsMutableState,
    ) => Promise<Result> | Result,
  ) => Promise<Result>
}

export type CreateBackgroundSavedTabsIndexedDbDataPlaneOptions = {
  readonly idGenerator: () => string
  readonly now: () => number
  readonly readExpiredUrls: () => Promise<readonly ExpiredUrlRecoveryRecord[]>
  readonly readSnapshot: () => Promise<PersistenceVersionedSavedTabsSnapshot>
  readonly session: NativeSession
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const validUrlIdentityKey = (rawUrl: string): string | null => {
  try {
    return createUrlIdentityKey(rawUrl)
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

const buildAnalyticsRecords = (
  snapshot: PersistenceV2Snapshot,
): SavedTabsAnalyticsRecord[] => {
  const collections = new Map(
    snapshot.collections.map((collection) => [collection.id, collection]),
  )
  const categories = new Map(
    snapshot.categories.map((category) => [category.id, category]),
  )
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]))
  const urls = new Map(snapshot.urls.map((url) => [url.id, url]))
  const urlMetrics = snapshot.urls.flatMap(
    (url): SavedTabsAnalyticsRecord[] => {
      const base = {
        domain: toHostname(url.url),
        parentCategories: [],
        projectCategories: [],
        savedInProjects: [],
        savedInTabGroups: [],
        subCategories: [],
        title: url.title,
        url: url.url,
      }
      return [
        {
          ...base,
          eventId: `${url.id}:first-saved`,
          id: url.id,
          metric: 'first-saved',
          savedAt: url.firstSavedAt,
          timestampAccuracy: url.firstSavedAtProvenance ?? 'legacy-fallback',
        },
        {
          ...base,
          eventId: `${url.id}:last-saved`,
          id: url.id,
          metric: 'last-saved',
          savedAt: url.lastSavedAt,
          timestampAccuracy: url.lastSavedAtProvenance ?? 'legacy-fallback',
        },
      ]
    },
  )
  const membershipEvents = snapshot.memberships.flatMap(
    (membership): SavedTabsAnalyticsRecord[] => {
      const collection = collections.get(membership.collectionId)
      const url = urls.get(membership.urlId)
      if (!collection || !url) {
        return []
      }
      const category = membership.categoryId
        ? categories.get(membership.categoryId)
        : undefined
      const group = collection.groupId
        ? groups.get(collection.groupId)
        : undefined
      const isDomain = collection.definition.type === 'domain'
      return [
        {
          collectionType: collection.definition.type,
          domain: toHostname(url.url),
          eventId: `${collection.id}:${url.id}`,
          id: url.id,
          metric: 'membership-added',
          parentCategories: isDomain && group ? [group.name] : [],
          projectCategories: !isDomain && category ? [category.name] : [],
          savedAt: membership.addedAt,
          savedInProjects: isDomain ? [] : [collection.name],
          savedInTabGroups: isDomain ? [collection.definition.domain] : [],
          subCategories: isDomain && category ? [category.name] : [],
          timestampAccuracy: membership.addedAtProvenance ?? 'legacy-fallback',
          title: url.title,
          url: url.url,
        },
      ]
    },
  )
  return [...urlMetrics, ...membershipEvents].toSorted(
    (left, right) =>
      left.savedAt - right.savedAt || left.eventId.localeCompare(right.eventId),
  )
}

const removeEmptyDomainCollections = (
  state: IndexedDbSavedTabsMutableState,
  affectedCollectionIds: ReadonlySet<string>,
): void => {
  const referencedCollectionIds = new Set(
    state.memberships.map(({ collectionId }) => collectionId),
  )
  const removedCollectionIds = new Set(
    state.collections
      .filter(
        (collection) =>
          collection.definition.type === 'domain' &&
          affectedCollectionIds.has(collection.id) &&
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
): number => {
  const removedIds = new Set(
    state.urls.filter((url) => selectedIds.has(url.id)).map(({ id }) => id),
  )
  if (removedIds.size === 0) {
    return 0
  }
  state.urls = state.urls.filter(({ id }) => !removedIds.has(id))
  const affectedCollectionIds = new Set<string>()
  state.memberships = state.memberships.filter(({ collectionId, urlId }) => {
    if (!removedIds.has(urlId)) {
      return true
    }
    affectedCollectionIds.add(collectionId)
    return false
  })
  removeEmptyDomainCollections(state, affectedCollectionIds)
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

type SaveTabsContext = {
  readonly idGenerator: () => string
  readonly preserveExistingTitle: boolean
  readonly timestamp: number
}

const ensureUrl = (
  state: IndexedDbSavedTabsMutableState,
  input: Required<BackgroundSavedTabInput>,
  options: SaveTabsContext,
): PersistenceV2Url => {
  const { idGenerator, preserveExistingTitle, timestamp } = options
  const normalizedUrl = validUrlIdentityKey(input.url)
  if (!normalizedUrl) {
    throw new TypeError('A valid normalized URL is required.')
  }
  const existing = state.urls.find((url) => url.normalizedUrl === normalizedUrl)
  if (existing) {
    const updated: PersistenceV2Url = {
      ...existing,
      lastSavedAt: timestamp,
      lastSavedAtProvenance: 'exact',
      title: preserveExistingTitle
        ? existing.title
        : input.title || existing.title,
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
    firstSavedAtProvenance: 'exact',
    id: idGenerator(),
    lastSavedAt: timestamp,
    lastSavedAtProvenance: 'exact',
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
    addedAtProvenance: 'exact',
    ...(categoryId ? { categoryId } : {}),
    collectionId: collection.id,
    sortOrder: nextSortOrder(collectionMemberships(state, collection.id)),
    updatedAt: timestamp,
    urlId: url.id,
  })
}

type SaveTabsOutcome = {
  readonly savedUrls: string[]
  /** 既存 URL のうち、保存先が変わらず記録を更新した件数 (issue #923)。 */
  readonly resavedRefreshedCount: number
  /** 既存 URL のうち、保存先プロジェクトが変わった件数 (issue #923)。 */
  readonly resavedMovedCount: number
}

const saveTabs = (
  state: IndexedDbSavedTabsMutableState,
  tabs: readonly BackgroundSavedTabInput[],
  options: SaveTabsContext,
): SaveTabsOutcome => {
  const { idGenerator, timestamp } = options
  const uniqueTabs = new Map<string, Required<BackgroundSavedTabInput>>()
  for (const tab of tabs) {
    const url = validUrlIdentityKey(tab.url ?? '')
    if (url) {
      uniqueTabs.set(url, { title: tab.title ?? '', url })
    }
  }
  if (uniqueTabs.size === 0) {
    return { resavedMovedCount: 0, resavedRefreshedCount: 0, savedUrls: [] }
  }
  const existingUrlIdentities = new Set(
    state.urls.map(({ normalizedUrl }) => normalizedUrl),
  )
  let resavedRefreshedCount = 0
  let resavedMovedCount = 0
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
    const isExisting = existingUrlIdentities.has(input.url)
    const url = ensureUrl(state, input, options)
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

    // 再保存時の保存先変化を判定するため、付け替え前のプロジェクトを控える。
    const previousProjectId = isExisting
      ? state.memberships.find(({ collectionId, urlId }) => {
          if (urlId !== url.id) {
            return false
          }
          const collection = state.collections.find(
            ({ id }) => id === collectionId,
          )
          return collection?.definition.type === 'custom'
        })?.collectionId
      : undefined
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
    if (isExisting) {
      if (previousProjectId === project.id) {
        resavedRefreshedCount += 1
      } else {
        resavedMovedCount += 1
      }
    }
  }
  return {
    resavedMovedCount,
    resavedRefreshedCount,
    savedUrls: [...uniqueTabs.keys()],
  }
}

const toExpiredUrlRecoveryDto = (
  record: ExpiredUrlRecoveryRecord,
): ExpiredUrlRecoveryDto => ({
  expiredAt: record.expiredAt,
  id: record.id,
  memberships: record.memberships.map(({ category, collection }) => ({
    ...(category ? { categoryName: category.name } : {}),
    collectionName: collection.name,
  })),
  recoverUntil: record.recoverUntil,
  title: record.url.title,
  url: record.url.url,
})

export const createBackgroundSavedTabsIndexedDbDataPlane = ({
  idGenerator,
  now,
  readExpiredUrls,
  readSnapshot,
  session,
}: CreateBackgroundSavedTabsIndexedDbDataPlaneOptions): BackgroundSavedTabsDataPlane => ({
  discardExpiredUrls: async (ids) =>
    session.runWithExpiredUrls((state) => {
      const outcome = discardExpiredUrls(state.expiredUrls, new Set(ids), now())
      state.expiredUrls = outcome.expiredUrls
      return outcome.removedCount
    }),
  listExpiredUrls: async () => {
    const records = await readExpiredUrls()
    const currentTime = now()
    return records
      .filter((record) => isRecoverableExpiredUrl(record, currentTime))
      .toSorted(
        (left, right) =>
          right.expiredAt - left.expiredAt || left.id.localeCompare(right.id),
      )
      .map(toExpiredUrlRecoveryDto)
  },
  purgeExpiredUrls: async () => {
    const records = await readExpiredUrls()
    const currentTime = now()
    if (
      records.some((record) => !isRecoverableExpiredUrl(record, currentTime))
    ) {
      await session.runWithExpiredUrls((state) => {
        state.expiredUrls = getRecoverableExpiredUrls(state.expiredUrls, now())
      })
    }
  },
  readAnalyticsRecords: async () =>
    buildAnalyticsRecords((await readSnapshot()).savedTabs),
  readInsightRecords: async () =>
    buildInsightRecords((await readSnapshot()).savedTabs),
  readUndoSnapshot: readSnapshot,
  removeExpiredUrls: async (
    cutoffTime,
    currentTime,
    options = { protectFavoriteFromAutoRemoval: true },
  ) =>
    session.runWithExpiredUrls((state) => {
      const outcome = expireSavedUrls(state, {
        cutoff: cutoffTime,
        generateId: idGenerator,
        now: currentTime,
        protectFavorite: options.protectFavoriteFromAutoRemoval,
      })
      Object.assign(state, outcome.state)
      return outcome.result
    }),
  removeUrl: async (url, urlRecordId, options = {}) => {
    const identity = validUrlIdentityKey(url)
    if (!identity) {
      return 0
    }
    return session.run((state) => {
      const matches = state.urls.filter(
        (record) =>
          record.url === identity &&
          (urlRecordId === undefined || record.id === urlRecordId),
      )
      const target = matches.length === 1 ? matches[0] : undefined
      if (
        target &&
        options.protectFavorite === true &&
        target.isFavorite === true
      ) {
        return 0
      }
      return target ? removeSelectedUrls(state, new Set([target.id])) : 0
    })
  },
  removeUrlIds: async (urlIds) =>
    session.run((state) => removeSelectedUrls(state, new Set(urlIds))),
  restoreExpiredUrls: async (ids) =>
    session.runWithExpiredUrls((state) => {
      const timestamp = now()
      const outcome = restoreExpiredUrls(state, new Set(ids), {
        generateId: idGenerator,
        getFallbackCollection: (next) => {
          const fallback = ensureUncategorizedCollection(next, timestamp)
          if (fallback.definition.type !== 'custom') {
            throw new Error(
              'The Custom uncategorized collection ID is occupied.',
            )
          }
          return fallback
        },
        maxNoteBytes: BACKUP_RESOURCE_LIMITS.maxNotesBytes,
        now: timestamp,
      })
      Object.assign(state, outcome.state)
      return outcome.result
    }),
  restoreUndoSnapshot: async (snapshot) =>
    session.run((state) => {
      state.categories = [...structuredClone(snapshot.savedTabs.categories)]
      state.collections = [...structuredClone(snapshot.savedTabs.collections)]
      state.groups = [...structuredClone(snapshot.savedTabs.groups)]
      state.memberships = [...structuredClone(snapshot.savedTabs.memberships)]
      state.urls = [...structuredClone(snapshot.savedTabs.urls)]
    }),
  saveTabs: async (tabs, options = {}) =>
    session.run((state) => {
      if (options.preserveExisting) {
        const existingIdentities = new Set(
          state.urls.map(({ normalizedUrl }) => normalizedUrl),
        )
        const distinctTabs = new Map<string, BackgroundSavedTabInput>()
        for (const tab of tabs) {
          const identity = validUrlIdentityKey(tab.url ?? '')
          if (identity) {
            distinctTabs.set(identity, tab)
          }
        }
        const freshTabs = [...distinctTabs]
          .filter(([identity]) => !existingIdentities.has(identity))
          .map(([, tab]) => tab)
        const outcome = saveTabs(state, freshTabs, {
          idGenerator,
          preserveExistingTitle: false,
          timestamp: now(),
        })
        return {
          existingCount: distinctTabs.size - freshTabs.length,
          savedCount: outcome.savedUrls.length,
        }
      }
      const outcome = saveTabs(state, tabs, {
        idGenerator,
        preserveExistingTitle: options.preserveExistingTitle === true,
        timestamp: now(),
      })
      return {
        resavedMovedCount: outcome.resavedMovedCount,
        resavedRefreshedCount: outcome.resavedRefreshedCount,
        savedUrls: outcome.savedUrls,
      }
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
          ? {
              ...url,
              lastSavedAt: timestamp,
              lastSavedAtProvenance: 'exact',
              updatedAt: timestamp,
            }
          : url,
      )
      return { success: true }
    }),
})
