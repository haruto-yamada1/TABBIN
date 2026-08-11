import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceVersionedSavedTabsSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import {
  mergeLegacyCompatibilityStorageRecord,
  projectPersistenceV2ToLegacyCompatibilityStorage,
} from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/PersistenceV2LegacyCompatibilityMapper'
import type { LegacyCompatibilityStorageRecord } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/PersistenceV2LegacyCompatibilityMapper'
import {
  normalizeDomainLookupKey,
  tabGroupMatchesCategory,
  toHostname,
} from '@/utils/domain-normalize'

import type {
  BackgroundSavedTabInput,
  BackgroundSavedTabsDataPlane,
  SavedTabsAnalyticsRecord,
  SavedTabsInsightRecord,
} from './backgroundSavedTabsDataPlaneTypes'

type CustomProject = LegacyCompatibilityStorageRecord['customProjects'][number]
type ParentCategory =
  LegacyCompatibilityStorageRecord['parentCategories'][number]
type TabGroup = LegacyCompatibilityStorageRecord['savedTabs'][number]
type UrlRecord = LegacyCompatibilityStorageRecord['urls'][number]

export type SavedTabsCompatibilityStorage = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly set: (items: Record<string, unknown>) => Promise<void>
}

export type CreateBackgroundSavedTabsDataPlaneOptions = {
  readonly idGenerator: () => string
  readonly legacyStorage: SavedTabsCompatibilityStorage
  readonly now: () => number
  readonly readIndexedDbSnapshot?: () => Promise<PersistenceVersionedSavedTabsSnapshot>
  readonly router: PersistenceDataPlaneRouterPort
  readonly runIndexedDbSession: <Result>(
    operation: (storage: SavedTabsCompatibilityStorage) => Promise<Result>,
  ) => Promise<Result>
}

type SavedTabsCompatibilityState = LegacyCompatibilityStorageRecord

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const emptyPersistenceV2Snapshot = {
  categories: [],
  collections: [],
  groups: [],
  memberships: [],
  urls: [],
} as const

const projectLegacyStateToVersionedSnapshot = (
  state: SavedTabsCompatibilityState,
): PersistenceVersionedSavedTabsSnapshot => ({
  revision: 0,
  savedTabs: mergeLegacyCompatibilityStorageRecord(
    emptyPersistenceV2Snapshot,
    state,
  ),
})

const readArray = async <Value>(
  storage: SavedTabsCompatibilityStorage,
  key: string,
): Promise<Value[]> => {
  const record = await storage.get(key)
  const value: unknown = record[key]
  // eslint-disable-next-line typescript/no-unsafe-argument -- compatibility storage is validated by the IndexedDB session before commit
  return Array.isArray(value) ? structuredClone<Value[]>(value) : []
}

const readState = async (
  storage: SavedTabsCompatibilityStorage,
): Promise<SavedTabsCompatibilityState> => {
  const [
    customProjectOrder,
    customProjects,
    domainCategoryMappings,
    domainCategorySettings,
    parentCategories,
    savedTabs,
    urls,
  ] = await Promise.all([
    readArray<string>(storage, 'customProjectOrder'),
    readArray<CustomProject>(storage, 'customProjects'),
    readArray<
      LegacyCompatibilityStorageRecord['domainCategoryMappings'][number]
    >(storage, 'domainCategoryMappings'),
    readArray<
      LegacyCompatibilityStorageRecord['domainCategorySettings'][number]
    >(storage, 'domainCategorySettings'),
    readArray<ParentCategory>(storage, 'parentCategories'),
    readArray<TabGroup>(storage, 'savedTabs'),
    readArray<UrlRecord>(storage, 'urls'),
  ])
  return {
    customProjectOrder,
    customProjects,
    domainCategoryMappings,
    domainCategorySettings,
    parentCategories,
    savedTabs,
    urls,
  }
}

const comparableUrl = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl.trim())
    url.hostname = url.hostname.toLowerCase()
    return url.toString()
  } catch {
    return null
  }
}

const getParentCategoriesForGroup = (
  group: TabGroup,
  parentCategories: readonly ParentCategory[],
): string[] =>
  parentCategories.flatMap((category) =>
    tabGroupMatchesCategory(
      category.domains,
      category.domainNames,
      group.id,
      group.domain,
    )
      ? [category.name]
      : [],
  )

const getProjectCategoriesForUrl = (
  project: CustomProject,
  urlId: string,
): string[] => {
  const category = project.urlMetadata?.[urlId]?.category
  return category ? [category] : []
}

const indexCollectionsByUrlId = <
  Collection extends { readonly urlIds?: readonly string[] },
>(
  collections: readonly Collection[],
): ReadonlyMap<string, readonly Collection[]> => {
  const collectionsByUrlId = new Map<string, Collection[]>()
  for (const collection of collections) {
    for (const urlId of collection.urlIds ?? []) {
      const matchingCollections = collectionsByUrlId.get(urlId)
      if (matchingCollections) {
        matchingCollections.push(collection)
      } else {
        collectionsByUrlId.set(urlId, [collection])
      }
    }
  }
  return collectionsByUrlId
}

const buildSavedTabsInsightRecords = ({
  customProjects,
  parentCategories,
  savedTabs,
  urls,
}: SavedTabsCompatibilityState): SavedTabsInsightRecord[] =>
  urls
    .map((record) => {
      const matchingGroups = savedTabs.filter((group) =>
        (group.urlIds ?? []).includes(record.id),
      )
      const matchingProjects = customProjects.filter((project) =>
        (project.urlIds ?? []).includes(record.id),
      )
      return {
        domain: toHostname(record.url),
        id: record.id,
        parentCategories: unique(
          matchingGroups.flatMap((group) =>
            getParentCategoriesForGroup(group, parentCategories),
          ),
        ),
        projectCategories: unique(
          matchingProjects.flatMap((project) =>
            getProjectCategoriesForUrl(project, record.id),
          ),
        ),
        savedAt: record.savedAt,
        savedInProjects: unique(
          matchingProjects.map((project) => project.name),
        ),
        savedInTabGroups: unique(matchingGroups.map((group) => group.domain)),
        subCategories: unique(
          matchingGroups.flatMap((group) => {
            const category = group.urlSubCategories?.[record.id]
            return category ? [category] : []
          }),
        ),
        title: record.title,
        url: record.url,
      }
    })
    .sort((left, right) => right.savedAt - left.savedAt)

const buildSavedTabsAnalyticsRecords = (
  state: SavedTabsCompatibilityState,
): SavedTabsAnalyticsRecord[] => {
  const insightRecords = buildSavedTabsInsightRecords(state)
  const groupsByUrlId = indexCollectionsByUrlId(state.savedTabs)
  const projectsByUrlId = indexCollectionsByUrlId(state.customProjects)
  return insightRecords
    .flatMap((record): SavedTabsAnalyticsRecord[] => {
      const matchingGroups = groupsByUrlId.get(record.id) ?? []
      const matchingProjects = projectsByUrlId.get(record.id) ?? []
      return [
        {
          ...record,
          eventId: `${record.id}:first-saved`,
          metric: 'first-saved',
          timestampAccuracy: 'legacy-fallback',
        },
        {
          ...record,
          eventId: `${record.id}:last-saved`,
          metric: 'last-saved',
          timestampAccuracy: 'legacy-fallback',
        },
        ...matchingGroups.map((group) => ({
          ...record,
          collectionType: 'domain' as const,
          eventId: `legacy:domain:${group.id}:${record.id}`,
          metric: 'membership-added' as const,
          parentCategories: getParentCategoriesForGroup(
            group,
            state.parentCategories,
          ),
          projectCategories: [],
          savedInProjects: [],
          savedInTabGroups: [group.domain],
          subCategories: group.urlSubCategories?.[record.id]
            ? [group.urlSubCategories[record.id]]
            : [],
          timestampAccuracy: 'legacy-fallback' as const,
        })),
        ...matchingProjects.map((project) => ({
          ...record,
          collectionType: 'custom' as const,
          eventId: `legacy:custom:${project.id}:${record.id}`,
          metric: 'membership-added' as const,
          parentCategories: [],
          projectCategories: getProjectCategoriesForUrl(project, record.id),
          savedInProjects: [project.name],
          savedInTabGroups: [],
          subCategories: [],
          timestampAccuracy: 'legacy-fallback' as const,
        })),
      ]
    })
    .toSorted(
      (left, right) =>
        left.savedAt - right.savedAt ||
        left.eventId.localeCompare(right.eventId),
    )
}

const removeSelectedUrls = async (
  storage: SavedTabsCompatibilityStorage,
  selectedIds: ReadonlySet<string>,
  selectedUrls: ReadonlySet<string>,
): Promise<number> => {
  const state = await readState(storage)
  const removedIds = new Set(
    state.urls
      .filter(
        (record) =>
          selectedIds.has(record.id) ||
          (comparableUrl(record.url)
            ? selectedUrls.has(comparableUrl(record.url) ?? '')
            : false),
      )
      .map((record) => record.id),
  )
  const removedUrls = new Set([
    ...selectedUrls,
    ...state.urls
      .filter((record) => removedIds.has(record.id))
      .flatMap((record) => {
        const key = comparableUrl(record.url)
        return key ? [key] : []
      }),
  ])
  const removedGroupIds: string[] = []
  const savedTabs = state.savedTabs.flatMap((group) => {
    const nextUrlIds = (group.urlIds ?? []).filter(
      (urlId) => !removedIds.has(urlId),
    )
    const nextUrls = (group.urls ?? []).filter((item) => {
      const key = comparableUrl(item.url)
      return (
        !(item.id && removedIds.has(item.id)) && !(key && removedUrls.has(key))
      )
    })
    const hadCanonicalUrls = Array.isArray(group.urlIds)
    const hasUrls = hadCanonicalUrls
      ? nextUrlIds.length > 0
      : nextUrls.length > 0
    if (!hasUrls) {
      removedGroupIds.push(group.id)
      return []
    }
    const urlSubCategories = group.urlSubCategories
      ? Object.fromEntries(
          Object.entries(group.urlSubCategories).filter(
            ([urlId]) => !removedIds.has(urlId),
          ),
        )
      : undefined
    return [
      {
        ...group,
        ...(hadCanonicalUrls ? { urlIds: nextUrlIds } : {}),
        ...(Array.isArray(group.urls) ? { urls: nextUrls } : {}),
        ...(urlSubCategories && Object.keys(urlSubCategories).length > 0
          ? { urlSubCategories }
          : { urlSubCategories: undefined }),
      },
    ]
  })
  const customProjects = state.customProjects.map((project) => ({
    ...project,
    ...(Array.isArray(project.urlIds)
      ? {
          urlIds: project.urlIds.filter((urlId) => !removedIds.has(urlId)),
        }
      : {}),
    ...(Array.isArray(project.urls)
      ? {
          urls: project.urls.filter((item) => {
            const key = comparableUrl(item.url)
            return !(key && removedUrls.has(key))
          }),
        }
      : {}),
    ...(project.urlMetadata
      ? {
          urlMetadata: Object.fromEntries(
            Object.entries(project.urlMetadata).filter(
              ([urlId]) => !removedIds.has(urlId),
            ),
          ),
        }
      : {}),
  }))
  const removedGroups = new Set(removedGroupIds)
  const parentCategories = state.parentCategories.map((category) => ({
    ...category,
    domains: category.domains.filter((id) => !removedGroups.has(id)),
  }))
  const urls = state.urls.filter((record) => !removedIds.has(record.id))
  const removedCount = state.urls.length - urls.length
  const nestedRemoved =
    JSON.stringify(savedTabs) !== JSON.stringify(state.savedTabs)
  if (removedCount === 0 && !nestedRemoved) {
    return 0
  }
  await storage.set({
    customProjects,
    parentCategories,
    savedTabs,
    urls,
  })
  return removedCount > 0 ? removedCount : 1
}

// eslint-disable-next-line complexity -- one atomic compatibility mutation preserves domain/custom/category placement together
const saveTabs = async (
  storage: SavedTabsCompatibilityStorage,
  tabs: readonly BackgroundSavedTabInput[],
  idGenerator: () => string,
  now: () => number,
): Promise<void> => {
  const state = await readState(storage)
  const uniqueTabs = new Map<string, BackgroundSavedTabInput>()
  for (const tab of tabs) {
    const key = comparableUrl(tab.url ?? '')
    if (key) {
      uniqueTabs.set(key, { title: tab.title ?? '', url: key })
    }
  }
  if (uniqueTabs.size === 0) {
    return
  }
  const savedAt = now()
  const urls = [...state.urls]
  const savedTabs = structuredClone(state.savedTabs)
  const customProjects = structuredClone(state.customProjects)
  const customProjectOrder = [...state.customProjectOrder]
  let uncategorized = customProjects.find(
    ({ id }) => id === 'custom-uncategorized',
  )
  if (!uncategorized) {
    uncategorized = {
      categories: [],
      createdAt: savedAt,
      id: 'custom-uncategorized',
      name: '未分類',
      updatedAt: savedAt,
      urlIds: [],
    }
    customProjects.push(uncategorized)
    customProjectOrder.push(uncategorized.id)
  }
  const orderedProjects = [
    ...customProjectOrder.flatMap((projectId) => {
      const project = customProjects.find(({ id }) => id === projectId)
      return project ? [project] : []
    }),
    ...customProjects.filter(({ id }) => !customProjectOrder.includes(id)),
  ].filter(({ id }) => id !== uncategorized.id)
  const projectMatches = (
    project: CustomProject,
    title: string,
    url: string,
  ): boolean => {
    const includes = (
      target: string,
      keywords: readonly string[] | undefined,
    ): boolean =>
      (keywords ?? []).some((keyword) => {
        const normalizedKeyword = keyword.trim().toLowerCase()
        return (
          normalizedKeyword.length > 0 &&
          target.toLowerCase().includes(normalizedKeyword)
        )
      })
    return (
      includes(title, project.projectKeywords?.titleKeywords) ||
      includes(url, project.projectKeywords?.urlKeywords) ||
      includes(toHostname(url), project.projectKeywords?.domainKeywords)
    )
  }

  for (const tab of uniqueTabs.values()) {
    const tabUrl = tab.url ?? ''
    const tabTitle = tab.title ?? ''
    let record = urls.find(
      ({ url }) => comparableUrl(url) === comparableUrl(tabUrl),
    )
    if (!record) {
      record = {
        id: idGenerator(),
        savedAt,
        title: tabTitle,
        url: tabUrl,
      }
      urls.push(record)
    } else if (tabTitle && tabTitle !== record.title) {
      record.title = tabTitle
    }
    const domain = toHostname(tabUrl)
    let group = savedTabs.find(
      ({ domain: value }) => normalizeDomainLookupKey(value) === domain,
    )
    if (!group) {
      const domainSetting = state.domainCategorySettings.find(
        ({ domain: value }) => normalizeDomainLookupKey(value) === domain,
      )
      const categoryMapping = state.domainCategoryMappings.find(
        ({ domain: value }) => normalizeDomainLookupKey(value) === domain,
      )
      const parentCategory =
        state.parentCategories.find(
          ({ id }) => id === categoryMapping?.categoryId,
        ) ??
        state.parentCategories.find(({ domainNames }) =>
          domainNames.some(
            (value) => normalizeDomainLookupKey(value) === domain,
          ),
        )
      group = {
        ...(domainSetting
          ? {
              categoryKeywords: structuredClone(domainSetting.categoryKeywords),
              subCategories: [...domainSetting.subCategories],
            }
          : {}),
        domain,
        id: idGenerator(),
        ...(parentCategory ? { parentCategoryId: parentCategory.id } : {}),
        savedAt,
        urlIds: [],
      }
      savedTabs.push(group)
      if (parentCategory && !parentCategory.domains.includes(group.id)) {
        parentCategory.domains.push(group.id)
      }
    }
    group.urlIds ??= []
    if (!group.urlIds.includes(record.id)) {
      group.urlIds.push(record.id)
    }
    const matchedCategory = group.categoryKeywords?.find(({ keywords }) =>
      keywords.some((keyword) =>
        record.title.toLowerCase().includes(keyword.toLowerCase()),
      ),
    )
    if (matchedCategory) {
      group.urlSubCategories ??= {}
      group.urlSubCategories[record.id] = matchedCategory.categoryName
    }

    const targetProject =
      orderedProjects.find((project) =>
        projectMatches(project, record.title, record.url),
      ) ?? uncategorized
    for (const project of customProjects) {
      project.urlIds = (project.urlIds ?? []).filter(
        (urlId) => urlId !== record.id,
      )
    }
    targetProject.urlIds ??= []
    targetProject.urlIds.push(record.id)
    targetProject.updatedAt = savedAt
  }
  await storage.set({
    customProjectOrder,
    customProjects,
    parentCategories: state.parentCategories,
    savedTabs,
    urls,
  })
}

const removeExpiredUrls = async (
  storage: SavedTabsCompatibilityStorage,
  cutoffTime: number,
  currentTime: number,
): Promise<{ readonly removedCount: number; readonly sourceCount: number }> => {
  const state = await readState(storage)
  const urlById = new Map(state.urls.map((record) => [record.id, record]))
  let removedCount = 0
  let sourceCount = 0
  const removedGroupIds = new Set<string>()
  const savedTabs = state.savedTabs.flatMap((group) => {
    const urlIds = (group.urlIds ?? []).filter((urlId) => {
      sourceCount += 1
      const savedAt =
        urlById.get(urlId)?.savedAt ?? group.savedAt ?? currentTime
      if (savedAt < cutoffTime) {
        removedCount += 1
        return false
      }
      return true
    })
    const urls = (group.urls ?? []).filter((item) => {
      if (group.urlIds) {
        return true
      }
      sourceCount += 1
      const savedAt = item.savedAt ?? group.savedAt ?? currentTime
      if (savedAt < cutoffTime) {
        removedCount += 1
        return false
      }
      return true
    })
    const hasUrls = group.urlIds ? urlIds.length > 0 : urls.length > 0
    if (!hasUrls) {
      removedGroupIds.add(group.id)
      return []
    }
    return [
      {
        ...group,
        ...(group.urlIds ? { urlIds } : { urls }),
        ...(group.urlSubCategories
          ? {
              urlSubCategories: Object.fromEntries(
                Object.entries(group.urlSubCategories).filter(([urlId]) =>
                  urlIds.includes(urlId),
                ),
              ),
            }
          : {}),
      },
    ]
  })
  if (removedCount === 0) {
    return { removedCount: 0, sourceCount }
  }
  const parentCategories = state.parentCategories.map((category) => ({
    ...category,
    domains: category.domains.filter((id) => !removedGroupIds.has(id)),
  }))
  await storage.set({ parentCategories, savedTabs })
  return { removedCount, sourceCount }
}

export const createBackgroundSavedTabsDataPlane = ({
  idGenerator,
  legacyStorage,
  now,
  readIndexedDbSnapshot,
  router,
  runIndexedDbSession,
}: CreateBackgroundSavedTabsDataPlaneOptions): BackgroundSavedTabsDataPlane => {
  const routeRead = async <Result>(
    operation: (storage: SavedTabsCompatibilityStorage) => Promise<Result>,
  ): Promise<Result> =>
    router.read({
      indexeddb: async () => runIndexedDbSession(operation),
      legacy: async () => operation(legacyStorage),
    })
  const routeWrite = async <Result>(
    operation: (storage: SavedTabsCompatibilityStorage) => Promise<Result>,
  ): Promise<Result> =>
    router.write({
      indexeddb: async () => runIndexedDbSession(operation),
      legacy: async () => operation(legacyStorage),
    })

  return {
    readAnalyticsRecords: async () =>
      routeRead(async (storage) =>
        buildSavedTabsAnalyticsRecords(await readState(storage)),
      ),
    readInsightRecords: async () =>
      routeRead(async (storage) =>
        buildSavedTabsInsightRecords(await readState(storage)),
      ),
    readUndoSnapshot: async () =>
      router.read({
        indexeddb: async () => {
          if (!readIndexedDbSnapshot) {
            throw new PersistenceUnavailableError(
              'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
            )
          }
          return readIndexedDbSnapshot()
        },
        legacy: async () =>
          projectLegacyStateToVersionedSnapshot(await readState(legacyStorage)),
      }),
    removeExpiredUrls: async (cutoffTime, currentTime) =>
      routeWrite(async (storage) =>
        removeExpiredUrls(storage, cutoffTime, currentTime),
      ),
    removeUrl: async (url) => {
      const key = comparableUrl(url)
      if (!key) {
        return 0
      }
      return routeWrite(async (storage) =>
        removeSelectedUrls(storage, new Set(), new Set([key])),
      )
    },
    removeUrlIds: async (urlIds) =>
      routeWrite(async (storage) =>
        removeSelectedUrls(storage, new Set(urlIds), new Set()),
      ),
    restoreUndoSnapshot: async (snapshot) =>
      router.write({
        indexeddb: async () =>
          runIndexedDbSession(async (storage) =>
            storage.set(
              projectPersistenceV2ToLegacyCompatibilityStorage(
                snapshot.savedTabs,
              ),
            ),
          ),
        legacy: async () =>
          legacyStorage.set(
            projectPersistenceV2ToLegacyCompatibilityStorage(
              snapshot.savedTabs,
            ),
          ),
      }),
    saveTabs: async (tabs) =>
      routeWrite(async (storage) => saveTabs(storage, tabs, idGenerator, now)),
    updateTabTimestamps: async (timestamp) =>
      routeWrite(async (storage) => {
        const savedTabs = await readArray<TabGroup>(storage, 'savedTabs')
        if (savedTabs.length === 0) {
          return { success: false }
        }
        await storage.set({
          savedTabs: savedTabs.map((group) => ({
            ...group,
            savedAt: timestamp,
          })),
        })
        return { success: true }
      }),
  }
}

const selectedLegacyRouter: PersistenceDataPlaneRouterPort = {
  read: async (operations) => operations.legacy(),
  write: async (operations) => operations.legacy(),
}

export const createBackgroundSavedTabsLegacyDataPlane = (
  options: Pick<
    CreateBackgroundSavedTabsDataPlaneOptions,
    'idGenerator' | 'legacyStorage' | 'now'
  >,
): BackgroundSavedTabsDataPlane =>
  createBackgroundSavedTabsDataPlane({
    ...options,
    router: selectedLegacyRouter,
    runIndexedDbSession: () => {
      throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
    },
  })
