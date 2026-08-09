/* eslint-disable typescript/require-await -- in-memory state adapters preserve asynchronous repository and port contracts */
import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionMembership,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

import type { IndexedDbSavedTabsMutableState } from './IndexedDbSavedTabsSessionService'

type ExternalDeps = Pick<
  SavedTabsUseCasesDeps,
  | 'browserTabPort'
  | 'browserWindowPort'
  | 'clock'
  | 'idGenerator'
  | 'messagingPort'
  | 'notificationPort'
  | 'storageChangePort'
  | 'userSettingsRepository'
>

type DomainCollection = PersistenceV2Collection & {
  readonly definition: Extract<
    PersistenceV2Collection['definition'],
    { readonly type: 'domain' }
  >
}

type CustomCollection = PersistenceV2Collection & {
  readonly definition: Extract<
    PersistenceV2Collection['definition'],
    { readonly type: 'custom' }
  >
}

const isDomainCollection = (
  collection: PersistenceV2Collection,
): collection is DomainCollection => collection.definition.type === 'domain'

const isCustomCollection = (
  collection: PersistenceV2Collection,
): collection is CustomCollection => collection.definition.type === 'custom'

const domainCollections = (
  state: IndexedDbSavedTabsMutableState,
): DomainCollection[] => state.collections.filter(isDomainCollection)

const customCollections = (
  state: IndexedDbSavedTabsMutableState,
): CustomCollection[] => state.collections.filter(isCustomCollection)

const categoriesFor = (
  state: IndexedDbSavedTabsMutableState,
  collectionId: string,
): PersistenceV2CollectionCategory[] =>
  state.categories
    .filter((category) => category.collectionId === collectionId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)

const membershipsFor = (
  state: IndexedDbSavedTabsMutableState,
  collectionId: string,
): PersistenceV2CollectionMembership[] =>
  state.memberships
    .filter((membership) => membership.collectionId === collectionId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)

const replaceCollectionAggregates = (
  state: IndexedDbSavedTabsMutableState,
  type: PersistenceV2Collection['definition']['type'],
  aggregates: readonly {
    readonly collection: PersistenceV2Collection
    readonly collectionCategories: readonly PersistenceV2CollectionCategory[]
    readonly memberships: readonly PersistenceV2CollectionMembership[]
  }[],
): void => {
  const replacedIds = new Set(
    state.collections
      .filter((collection) => collection.definition.type === type)
      .map(({ id }) => id),
  )
  state.collections = [
    ...state.collections.filter(({ id }) => !replacedIds.has(id)),
    ...aggregates.map(({ collection }) => structuredClone(collection)),
  ]
  state.categories = [
    ...state.categories.filter(
      ({ collectionId }) => !replacedIds.has(collectionId),
    ),
    ...aggregates.flatMap(({ collectionCategories }) =>
      structuredClone(collectionCategories),
    ),
  ]
  state.memberships = [
    ...state.memberships.filter(
      ({ collectionId }) => !replacedIds.has(collectionId),
    ),
    ...aggregates.flatMap(({ memberships }) => structuredClone(memberships)),
  ]
}

const removeCollections = (
  state: IndexedDbSavedTabsMutableState,
  ids: ReadonlySet<string>,
): void => {
  state.collections = state.collections.filter(({ id }) => !ids.has(id))
  state.categories = state.categories.filter(
    ({ collectionId }) => !ids.has(collectionId),
  )
  state.memberships = state.memberships.filter(
    ({ collectionId }) => !ids.has(collectionId),
  )
}

const createTabGroupRepository = (
  state: IndexedDbSavedTabsMutableState,
): SavedTabsUseCasesDeps['tabGroupRepository'] => {
  const findAll = async () =>
    domainCollections(state)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((collection) =>
        createTabGroup({
          collection,
          collectionCategories: categoriesFor(state, collection.id),
          memberships: membershipsFor(state, collection.id),
        }),
      )
  return {
    findAll,
    findById: async (id) =>
      (await findAll()).find((group) => group.collection.id === id) ?? null,
    findRawDomainById: async (id) =>
      domainCollections(state).find((collection) => collection.id === id)
        ?.definition.domain ?? null,
    findRawTabGroupById: async (id) => {
      const group = (await findAll()).find(
        (candidate) => candidate.collection.id === id,
      )
      return group ?? null
    },
    removeByIds: async (ids) => {
      removeCollections(state, new Set(ids))
    },
    saveAll: async (groups) => {
      replaceCollectionAggregates(state, 'domain', groups)
    },
  }
}

const createCustomProjectRepository = (
  state: IndexedDbSavedTabsMutableState,
): SavedTabsUseCasesDeps['customProjectRepository'] => {
  const findAll = async () =>
    customCollections(state)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((collection) =>
        createCustomProject({
          collection,
          collectionCategories: categoriesFor(state, collection.id),
          memberships: membershipsFor(state, collection.id),
        }),
      )
  return {
    findAll,
    findAllRaw: findAll,
    findById: async (id) =>
      (await findAll()).find((project) => project.collection.id === id) ?? null,
    findOrder: async () => (await findAll()).map(({ id }) => id),
    removeByIds: async (ids) => {
      removeCollections(state, new Set(ids))
    },
    restoreAllRaw: async (projects) => {
      replaceCollectionAggregates(state, 'custom', projects)
    },
    saveAll: async (projects) => {
      replaceCollectionAggregates(state, 'custom', projects)
    },
    saveOrder: async (order) => {
      const indexById = new Map<string, number>(
        order.map((id, index) => [String(id), index]),
      )
      state.collections = state.collections.map((collection) =>
        collection.definition.type === 'custom' && indexById.has(collection.id)
          ? { ...collection, sortOrder: indexById.get(collection.id) ?? 0 }
          : collection,
      )
    },
  }
}

const createParentCategoryRepository = (
  state: IndexedDbSavedTabsMutableState,
): SavedTabsUseCasesDeps['parentCategoryRepository'] => {
  const findAll = async () =>
    state.groups
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((group) =>
        createParentCategory({
          collections: domainCollections(state)
            .filter(({ groupId }) => groupId === group.id)
            .map((collection) => ({
              domain: collection.definition.domain,
              id: collection.id,
            })),
          id: group.id,
          name: group.name,
        }),
      )
  const saveAll = async (
    categories: readonly ParentCategory[],
  ): Promise<void> => {
    const now = Date.now()
    const currentById = new Map(state.groups.map((group) => [group.id, group]))
    state.groups = categories.map((category, sortOrder) => {
      const current = currentById.get(category.id)
      return {
        createdAt: current?.createdAt ?? now,
        id: category.id,
        name: category.name,
        sortOrder,
        updatedAt: now,
      }
    })
    const groupIdByCollection = new Map<string, string>(
      categories.flatMap((category) =>
        category.collections.map(
          ({ id }) => [String(id), String(category.id)] as const,
        ),
      ),
    )
    state.collections = state.collections.map((collection) => {
      if (collection.definition.type !== 'domain') {
        return collection
      }
      const groupId = groupIdByCollection.get(collection.id)
      const next = { ...collection, groupId, updatedAt: now }
      if (groupId === undefined) {
        Reflect.deleteProperty(next, 'groupId')
      }
      return next
    })
  }
  return {
    findAll,
    findById: async (id) =>
      (await findAll()).find((category) => category.id === id) ?? null,
    removeByIds: async (ids) => {
      const removed = new Set<string>(ids.map(String))
      await saveAll(
        (await findAll()).filter((category) => !removed.has(category.id)),
      )
    },
    saveAll,
  }
}

const createUrlRecordRepository = (
  state: IndexedDbSavedTabsMutableState,
): SavedTabsUseCasesDeps['urlRecordRepository'] => {
  const findAll = async () =>
    state.urls.map((url) =>
      createUrlRecord({
        favIconUrl: url.favIconUrl,
        id: url.id,
        savedAt: url.lastSavedAt,
        title: url.title,
        url: url.url,
      }),
    )
  return {
    findAll,
    findById: async (id) =>
      (await findAll()).find((record) => record.id === id) ?? null,
    removeByIds: async (ids) => {
      const removed = new Set<string>(ids.map(String))
      state.urls = state.urls.filter(({ id }) => !removed.has(id))
    },
    saveAll: async (records) => {
      const existingById = new Map(state.urls.map((url) => [url.id, url]))
      state.urls = records.map((record): PersistenceV2Url => {
        const existing = existingById.get(record.id)
        return {
          ...(record.favIconUrl ? { favIconUrl: record.favIconUrl } : {}),
          firstSavedAt: existing?.firstSavedAt ?? record.savedAt,
          id: record.id,
          lastSavedAt: record.savedAt,
          normalizedUrl: existing?.normalizedUrl ?? record.url,
          title: record.title,
          updatedAt: record.savedAt,
          url: record.url,
        }
      })
    },
  }
}

const findCustomCollection = (
  state: IndexedDbSavedTabsMutableState,
  projectId: string,
): PersistenceV2Collection => {
  const project = customCollections(state).find(({ id }) => id === projectId)
  if (!project) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  return project
}

const updateCustomCollection = (
  state: IndexedDbSavedTabsMutableState,
  projectId: string,
  update: (project: PersistenceV2Collection) => PersistenceV2Collection,
): void => {
  findCustomCollection(state, projectId)
  state.collections = state.collections.map((collection) =>
    collection.id === projectId ? update(collection) : collection,
  )
}

const createCustomProjectsCommandService = (
  state: IndexedDbSavedTabsMutableState,
  deps: Pick<ExternalDeps, 'clock' | 'idGenerator'>,
): CustomProjectsCommandService => {
  const now = () => deps.clock.now()
  const touch = (projectId: string): void => {
    updateCustomCollection(state, projectId, (project) => ({
      ...project,
      updatedAt: now(),
    }))
  }
  const removeUrlIds = (projectId: string, ids: ReadonlySet<string>): void => {
    state.memberships = state.memberships.filter(
      (membership) =>
        membership.collectionId !== projectId || !ids.has(membership.urlId),
    )
    touch(projectId)
  }
  const removeOrphanUrls = (): void => {
    const referenced = new Set(state.memberships.map(({ urlId }) => urlId))
    state.urls = state.urls.filter(({ id }) => referenced.has(id))
  }
  const findCategory = (projectId: string, name: string) =>
    categoriesFor(state, projectId).find((category) => category.name === name)
  const addCategory = (projectId: string, name: string) => {
    const existing = findCategory(projectId, name)
    if (existing) {
      return existing
    }
    const timestamp = now()
    const category: PersistenceV2CollectionCategory = {
      collectionId: projectId,
      createdAt: timestamp,
      id: deps.idGenerator.generate(),
      keywords: [],
      name,
      sortOrder: categoriesFor(state, projectId).length,
      updatedAt: timestamp,
    }
    state.categories.push(category)
    return category
  }
  const service: CustomProjectsCommandService = {
    addCategoryToProject: async (projectId, categoryName) => {
      addCategory(projectId, categoryName)
      touch(projectId)
    },
    addUrlToCustomProject: async (projectId, url, title, options) => {
      const timestamp = now()
      let record = state.urls.find((candidate) => candidate.url === url)
      if (!record) {
        record = {
          firstSavedAt: timestamp,
          id: deps.idGenerator.generate(),
          lastSavedAt: timestamp,
          normalizedUrl: url,
          title,
          updatedAt: timestamp,
          url,
        }
        state.urls.push(record)
      }
      if (
        !membershipsFor(state, projectId).some(
          ({ urlId }) => urlId === record.id,
        )
      ) {
        const category = options?.category
          ? addCategory(projectId, options.category)
          : undefined
        state.memberships.push({
          addedAt: timestamp,
          ...(category ? { categoryId: category.id } : {}),
          collectionId: projectId,
          ...(options?.notes ? { notes: options.notes } : {}),
          sortOrder: membershipsFor(state, projectId).length,
          updatedAt: timestamp,
          urlId: record.id,
        })
      }
      touch(projectId)
    },
    moveUrlBetweenCustomProjects: async (sourceId, targetId, url) => {
      const record = state.urls.find((candidate) => candidate.url === url)
      if (!record) {
        return
      }
      const source = state.memberships.find(
        (membership) =>
          membership.collectionId === sourceId &&
          membership.urlId === record.id,
      )
      removeUrlIds(sourceId, new Set([record.id]))
      if (
        !membershipsFor(state, targetId).some(
          ({ urlId }) => urlId === record.id,
        )
      ) {
        state.memberships.push({
          addedAt: now(),
          collectionId: targetId,
          ...(source?.notes ? { notes: source.notes } : {}),
          sortOrder: membershipsFor(state, targetId).length,
          updatedAt: now(),
          urlId: record.id,
        })
      }
      touch(targetId)
    },
    removeCategoryFromProject: async (projectId, categoryName) => {
      const category = findCategory(projectId, categoryName)
      if (!category) {
        return
      }
      state.categories = state.categories.filter(({ id }) => id !== category.id)
      state.memberships = state.memberships.map((membership) => {
        if (membership.categoryId !== category.id) {
          return membership
        }
        const next = { ...membership, updatedAt: now() }
        Reflect.deleteProperty(next, 'categoryId')
        return next
      })
      touch(projectId)
    },
    removeUrlFromCustomProject: async (projectId, url) => {
      const record = state.urls.find((candidate) => candidate.url === url)
      if (!record) {
        return
      }
      removeUrlIds(projectId, new Set([record.id]))
      removeOrphanUrls()
    },
    removeUrlIdsFromAllCustomProjects: async (urlIds) => {
      const ids = new Set(urlIds)
      state.memberships = state.memberships.filter(
        (membership) =>
          !ids.has(membership.urlId) ||
          state.collections.find(({ id }) => id === membership.collectionId)
            ?.definition.type !== 'custom',
      )
      removeOrphanUrls()
    },
    removeUrlsFromAllCustomProjects: async (urls) => {
      const selected = new Set(urls)
      await service.removeUrlIdsFromAllCustomProjects(
        state.urls.filter(({ url }) => selected.has(url)).map(({ id }) => id),
      )
    },
    removeUrlsFromCustomProject: async (projectId, urls) => {
      const selected = new Set(urls)
      removeUrlIds(
        projectId,
        new Set(
          state.urls.filter(({ url }) => selected.has(url)).map(({ id }) => id),
        ),
      )
      removeOrphanUrls()
    },
    renameCategoryInProject: async (projectId, oldName, newName) => {
      const category = findCategory(projectId, oldName)
      if (!category) {
        return
      }
      state.categories = state.categories.map((candidate) =>
        candidate.id === category.id
          ? { ...candidate, name: newName, updatedAt: now() }
          : candidate,
      )
      touch(projectId)
    },
    reorderProjectUrls: async (
      projectId: string,
      urls:
        | readonly { readonly id?: string; readonly url: string }[]
        | undefined,
    ) => {
      const idsByUrl = new Map(state.urls.map(({ id, url }) => [url, id]))
      const order = new Map<string, number>(
        (urls ?? []).flatMap((url, index) => {
          const id = url.id ?? idsByUrl.get(url.url)
          return id ? [[id, index] as const] : []
        }),
      )
      state.memberships = state.memberships.map((membership) =>
        membership.collectionId === projectId && order.has(membership.urlId)
          ? {
              ...membership,
              sortOrder: order.get(membership.urlId) ?? 0,
              updatedAt: now(),
            }
          : membership,
      )
      touch(projectId)
    },
    setUrlCategory: async (projectId, url, categoryName) => {
      const record = state.urls.find((candidate) => candidate.url === url)
      if (!record) {
        return
      }
      const category = categoryName
        ? addCategory(projectId, categoryName)
        : undefined
      state.memberships = state.memberships.map((membership) => {
        if (
          membership.collectionId !== projectId ||
          membership.urlId !== record.id
        ) {
          return membership
        }
        const next = {
          ...membership,
          ...(category ? { categoryId: category.id } : {}),
          updatedAt: now(),
        }
        if (!category) {
          Reflect.deleteProperty(next, 'categoryId')
        }
        return next
      })
      touch(projectId)
    },
    updateCategoryOrder: async (projectId, newOrder) => {
      const order = new Map(newOrder.map((name, index) => [name, index]))
      state.categories = state.categories.map((category) =>
        category.collectionId === projectId && order.has(category.name)
          ? {
              ...category,
              sortOrder: order.get(category.name) ?? 0,
              updatedAt: now(),
            }
          : category,
      )
      touch(projectId)
    },
    updateProjectKeywords: async (projectId, keywords) => {
      updateCustomCollection(state, projectId, (project) => ({
        ...project,
        definition: {
          projectKeywords: structuredClone(keywords),
          type: 'custom',
        },
        updatedAt: now(),
      }))
    },
  }
  return service
}

export const createNativeSavedTabsPersistenceAdapters = (
  state: IndexedDbSavedTabsMutableState,
  external: ExternalDeps,
): SavedTabsUseCasesDeps => {
  const tabGroupRepository = createTabGroupRepository(state)
  const customProjectRepository = createCustomProjectRepository(state)
  const parentCategoryRepository = createParentCategoryRepository(state)
  const urlRecordRepository = createUrlRecordRepository(state)
  const now = () => external.clock.now()
  const saveDomainCategories = (
    domain: string,
    names: readonly string[],
    keywordsByName: ReadonlyMap<string, readonly string[]>,
  ): void => {
    const collection = domainCollections(state).find(
      (candidate) => candidate.definition.domain === domain,
    )
    if (!collection) {
      return
    }
    const currentByName = new Map(
      categoriesFor(state, collection.id).map((category) => [
        category.name,
        category,
      ]),
    )
    const timestamp = now()
    state.categories = [
      ...state.categories.filter(
        ({ collectionId }) => collectionId !== collection.id,
      ),
      ...names.map((name, sortOrder) => {
        const current = currentByName.get(name)
        return {
          collectionId: collection.id,
          createdAt: current?.createdAt ?? timestamp,
          id: current?.id ?? external.idGenerator.generate(),
          keywords: [...(keywordsByName.get(name) ?? current?.keywords ?? [])],
          name,
          sortOrder,
          updatedAt: timestamp,
        }
      }),
    ]
  }
  return {
    ...external,
    categoriesCommandService: {
      updateCollectionCategories: async (collection, categories) => {
        state.collections = state.collections.map((candidate) =>
          candidate.id === collection.id
            ? structuredClone(collection)
            : candidate,
        )
        state.categories = [
          ...state.categories.filter(
            ({ collectionId }) => collectionId !== collection.id,
          ),
          ...structuredClone(categories),
        ]
      },
    },
    categoryAssignmentPort: createNativeCategoryAssignmentPort(state, external),
    customProjectRepository,
    customProjectsCommandService: createCustomProjectsCommandService(
      state,
      external,
    ),
    domainCategoryMappingRepository: {
      findAll: async () =>
        domainCollections(state).flatMap((collection) =>
          collection.groupId
            ? [
                {
                  categoryId: collection.groupId,
                  domain: collection.definition.domain,
                },
              ]
            : [],
        ),
      saveAll: async (mappings) => {
        const groupIdByDomain = new Map(
          mappings.map(({ categoryId, domain }) => [domain, categoryId]),
        )
        state.collections = state.collections.map((collection) => {
          if (collection.definition.type !== 'domain') {
            return collection
          }
          const groupId = groupIdByDomain.get(collection.definition.domain)
          const next = { ...collection, groupId, updatedAt: now() }
          if (!groupId) {
            Reflect.deleteProperty(next, 'groupId')
          }
          return next
        })
      },
    },
    domainCategorySettingsRepository: {
      findAll: async () =>
        domainCollections(state).map((collection) => ({
          collection,
          collectionCategories: categoriesFor(state, collection.id),
        })),
      saveAll: async (settings) => {
        for (const setting of settings) {
          state.collections = state.collections.map((collection) =>
            collection.id === setting.collection.id
              ? structuredClone(setting.collection)
              : collection,
          )
          state.categories = [
            ...state.categories.filter(
              ({ collectionId }) => collectionId !== setting.collection.id,
            ),
            ...structuredClone(setting.collectionCategories),
          ]
        }
      },
    },
    migrationPort: {
      migrateDomainStorageToHostname: async () => {},
      migrateParentCategoriesToDomainNames: async () => {},
      migrateToUrlsStorage: async () => {},
    },
    parentCategoryRepository,
    removeSubCategoryFromTabGroupPort: {
      removeSubCategoryFromTabGroup: async (groupId, categoryName) => {
        const collection = domainCollections(state).find(
          ({ id }) => id === groupId,
        )
        const category = collection
          ? categoriesFor(state, collection.id).find(
              ({ name }) => name === categoryName,
            )
          : undefined
        if (category) {
          state.categories = state.categories.filter(
            ({ id }) => id !== category.id,
          )
          state.memberships = state.memberships.map((membership) => {
            if (membership.categoryId !== category.id) {
              return membership
            }
            const next = { ...membership, updatedAt: now() }
            Reflect.deleteProperty(next, 'categoryId')
            return next
          })
        }
        return tabGroupRepository.findAll()
      },
    },
    savedTabsTabGroupReadPort: {
      findAll: async () =>
        (await tabGroupRepository.findAll()).map((group) => {
          const categoriesById = new Map(
            group.collectionCategories.map((category) => [
              category.id,
              category,
            ]),
          )
          const urlsById = new Map(state.urls.map((url) => [url.id, url]))
          return {
            ...group,
            resolvedUrls: group.memberships.flatMap((membership) => {
              const url = urlsById.get(membership.urlId)
              if (!url) {
                return []
              }
              const category = membership.categoryId
                ? categoriesById.get(membership.categoryId)
                : undefined
              return [
                {
                  ...(category ? { category: category.name } : {}),
                  ...(url.favIconUrl ? { favIconUrl: url.favIconUrl } : {}),
                  id: url.id,
                  ...(membership.notes ? { notes: membership.notes } : {}),
                  savedAt: url.lastSavedAt,
                  title: url.title,
                  url: url.url,
                },
              ]
            }),
          }
        }),
    },
    setCategoryKeywordsPort: {
      setCategoryKeywords: async (groupId, categoryName, keywords) => {
        const collection = domainCollections(state).find(
          ({ id }) => id === groupId,
        )
        if (!collection) {
          return
        }
        const names = categoriesFor(state, collection.id).map(
          ({ name }) => name,
        )
        if (!names.includes(categoryName)) {
          names.push(categoryName)
        }
        saveDomainCategories(
          collection.definition.domain,
          names,
          new Map([[categoryName, keywords]]),
        )
      },
    },
    tabGroupRepository,
    urlRecordRepository,
  }
}

export const createNativeCategoryAssignmentPort = (
  state: IndexedDbSavedTabsMutableState,
  _external: Pick<ExternalDeps, 'clock' | 'idGenerator'>,
): CategoryAssignmentPort => ({
  saveParentCategories: async (categories) => {
    await createParentCategoryRepository(state).saveAll(
      categories.map(createParentCategory),
    )
  },
  saveTabGroups: async (groups) => {
    await createTabGroupRepository(state).saveAll(groups)
  },
})
