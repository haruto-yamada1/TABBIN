/* eslint-disable no-restricted-imports -- browser harness exercises the production saved-tabs read composition */
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { filterCustomProjectsByQuery } from '@/contexts/saved-tabs/presentation/lib/custom-project-search'
import {
  toCustomProjectFromViewModel,
  toSavedTabsCustomProjectViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

const domainCount = 200
const groupCount = 20
const projectId = 'read-project'
const searchMarker = 'quartzlycanthrope'

const createFixture = (urlCount: number): PersistenceV2Snapshot => {
  const perDomain = urlCount / domainCount
  const collections = Array.from({ length: domainCount }, (_, index) => ({
    ...createDomainCollectionFixture(
      `domain-${index}`,
      `domain-${index}.example.test`,
      1,
      domainCount - index,
    ),
    definition: {
      domain: `domain-${index}.example.test`,
      type: 'domain' as const,
    },
    groupId: `group-${index % groupCount}`,
    uncategorizedCategoryPosition: 1,
  }))
  const allCollections = [
    ...collections,
    {
      ...createCustomCollectionFixture(projectId, 'Reference project', 1),
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom' as const,
      },
    },
  ]
  const categories = allCollections.flatMap((collection) =>
    ['Assigned', 'Empty'].map((name, index) => ({
      collectionId: collection.id,
      createdAt: 1,
      id: `${collection.id}-category-${index}`,
      keywords: index === 0 ? ['Document'] : [],
      name,
      sortOrder: index,
      updatedAt: 1,
    })),
  )
  const urls = Array.from({ length: urlCount }, (_, index) => ({
    ...createUrlFixture(
      `url-${index}`,
      `https://domain-${Math.floor(index / perDomain)}.example.test/${index}`,
      index === 0 ? searchMarker : `Document ${index}`,
      1,
    ),
    firstSavedAtProvenance: 'exact' as const,
    lastSavedAtProvenance: 'exact' as const,
  }))
  const membership = (
    collectionId: string,
    index: number,
    sortOrder: number,
  ) => ({
    ...createMembershipFixture(collectionId, `url-${index}`, 1, sortOrder),
    addedAtProvenance: 'exact' as const,
    ...(index % 2 === 0 ? { categoryId: `${collectionId}-category-0` } : {}),
    ...(index % 7 === 0 ? { notes: `Synthetic note ${index}` } : {}),
  })
  return {
    categories,
    collections: allCollections,
    groups: Array.from({ length: groupCount }, (_, index) => ({
      createdAt: 1,
      id: `group-${index}`,
      name: `Group ${index}`,
      sortOrder: groupCount - index,
      updatedAt: 1,
    })),
    memberships: [
      ...urls.map((_, index) =>
        membership(
          `domain-${Math.floor(index / perDomain)}`,
          index,
          perDomain - (index % perDomain),
        ),
      ),
      ...urls
        .slice(0, 100)
        .map((_, index) => membership(projectId, index, 100 - index)),
    ],
    urls,
  }
}

// Compare complete synthetic DTOs in the browser; only aggregate measurements
// cross into the Playwright report, including when equivalence fails.
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

const assertEquivalent = (actual: unknown, expected: unknown): void => {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error('Saved-tabs read differs from the synthetic fixture.')
  }
}

const expectedProjection = (fixture: PersistenceV2Snapshot) => {
  const urls = new Map(fixture.urls.map((url) => [url.id, url]))
  const categories = new Map(
    fixture.categories.map((category) => [category.id, category]),
  )
  const orderedCollections = fixture.collections.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  )
  const resolve = (collectionId: string) =>
    fixture.memberships
      .filter((membership) => membership.collectionId === collectionId)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((membership) => {
        const url = urls.get(membership.urlId)
        if (!url) {
          throw new Error('The synthetic fixture has a missing URL.')
        }
        const category = membership.categoryId
          ? categories.get(membership.categoryId)
          : undefined
        return {
          ...(category ? { category: category.name } : {}),
          id: url.id,
          ...(membership.notes ? { notes: membership.notes } : {}),
          savedAt: url.lastSavedAt,
          title: url.title,
          url: url.url,
        }
      })
  return {
    parentCategories: fixture.groups
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((group) => ({
        collections: orderedCollections.flatMap((collection) =>
          collection.groupId === group.id &&
          collection.definition.type === 'domain'
            ? [{ domain: collection.definition.domain, id: collection.id }]
            : [],
        ),
        id: group.id,
        name: group.name,
      })),
    projectUrls: resolve(projectId),
    tabGroups: orderedCollections
      .filter((collection) => collection.definition.type === 'domain')
      .map((collection) => ({
        collection,
        collectionCategories: fixture.categories
          .filter((category) => category.collectionId === collection.id)
          .toSorted((left, right) => left.sortOrder - right.sortOrder),
        id: collection.id,
        memberships: fixture.memberships
          .filter((membership) => membership.collectionId === collection.id)
          .toSorted((left, right) => left.sortOrder - right.sortOrder),
        resolvedUrls: resolve(collection.id),
        savedAt: collection.createdAt,
      })),
  }
}

const createSavedTabsReadBrowserHarness = (databaseName: string) => {
  let writes = 0
  Object.assign(globalThis, {
    chrome: {
      storage: {
        local: {
          get: async (key: string) => {
            if (key !== 'userSettings') {
              throw new Error('The read accessed non-settings Chrome storage.')
            }
            await Promise.resolve()
            return { userSettings: { enableCategories: true } }
          },
          remove: () => {
            throw new Error('A read removed Chrome storage.')
          },
          set: () => {
            throw new Error('A read wrote Chrome storage.')
          },
        },
      },
    },
  })
  const gate: PersistenceOperationGatePort = {
    runIndexedDbRead: async (operation) => operation(),
    runIndexedDbWrite: async (operation) => {
      writes += 1
      return operation()
    },
  }
  const manager = new IndexedDbConnectionManager({ databaseName })
  const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager, gate)
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: manager,
    operationGate: gate,
  })
  return {
    close: () => {
      manager.close()
    },
    seed: async (urlCount: number) => {
      const fixture = createFixture(urlCount)
      await unitOfWork.commit({
        categories: { put: fixture.categories },
        collections: { put: fixture.collections },
        groups: { put: fixture.groups },
        memberships: { put: fixture.memberships },
        urls: { put: fixture.urls },
      })
    },
    measure: async (urlCount: number) => {
      const fixture = createFixture(urlCount)
      const expected = expectedProjection(fixture)
      const project = (await useCases.getCustomProjects())[0]
      if (!project) {
        throw new Error('The synthetic project is missing.')
      }
      const revisionBefore = await unitOfWork.readRevision()
      const writesBefore = writes
      const pageQueryMs: number[] = []
      const projectQueryMs: number[] = []
      for (let iteration = 0; iteration < 3; iteration += 1) {
        const pageStart = performance.now()
        // eslint-disable-next-line no-await-in-loop -- sequential iterations measure individual reads
        const page = await useCases.getSavedTabsPageData()
        pageQueryMs.push(performance.now() - pageStart)
        assertEquivalent(page.tabGroups, expected.tabGroups)
        assertEquivalent(page.parentCategories, expected.parentCategories)
        const projectStart = performance.now()
        // eslint-disable-next-line no-await-in-loop -- sequential iterations measure individual reads
        const projectUrls = await useCases.getProjectUrls(project)
        projectQueryMs.push(performance.now() - projectStart)
        assertEquivalent(projectUrls, expected.projectUrls)
      }
      const search = await filterCustomProjectsByQuery({
        customProjects: [toSavedTabsCustomProjectViewModel(project)],
        loadProjectUrls: async (viewModel) =>
          useCases.getProjectUrls(toCustomProjectFromViewModel(viewModel)),
        searchQuery: searchMarker,
      })
      assertEquivalent(
        search.flatMap((match) =>
          (match.memberships ?? []).map(({ urlId }) => urlId),
        ),
        ['url-0'],
      )
      const revisionAfter = await unitOfWork.readRevision()
      return {
        counts: {
          categories: fixture.categories.length,
          domainCollections: domainCount,
          groups: groupCount,
          memberships: fixture.memberships.length,
          projectMemberships: project.memberships.length,
          searchMatches: search.length,
          urls: fixture.urls.length,
        },
        pageQueryMs,
        projectQueryMs,
        queryWrites: writes - writesBefore,
        revisionAfter,
        revisionBefore,
      }
    },
    mutateAndVerifyFresh: async () => {
      const before = await useCases.getSavedTabsPageData()
      const target = before.tabGroups[0]
      if (!target) {
        throw new Error('The synthetic collection is missing.')
      }
      await unitOfWork.commit({
        collections: {
          put: [
            { ...target.collection, name: 'Changed after read', updatedAt: 2 },
          ],
        },
      })
      const writesBefore = writes
      const after = await useCases.getSavedTabsPageData()
      if (after.tabGroups[0]?.collection.name !== 'Changed after read') {
        throw new Error('A new saved-tabs read returned stale persisted data.')
      }
      return { queryWrites: writes - writesBefore }
    },
  }
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- ambient Window extension requires interface merging
  interface Window {
    __savedTabsRead: ReturnType<typeof createSavedTabsReadBrowserHarness>
    __initializeSavedTabsRead: (databaseName: string) => void
  }
}

Object.assign(globalThis, {
  __initializeSavedTabsRead: (databaseName: string) => {
    window.__savedTabsRead = createSavedTabsReadBrowserHarness(databaseName)
  },
})
