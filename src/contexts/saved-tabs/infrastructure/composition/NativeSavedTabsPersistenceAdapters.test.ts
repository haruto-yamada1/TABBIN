import { describe, expect, it, vi } from 'vitest'

import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

import type { IndexedDbSavedTabsMutableState } from './IndexedDbSavedTabsSessionService'
import { createNativeSavedTabsPersistenceAdapters } from './NativeSavedTabsPersistenceAdapters'

const createState = (): IndexedDbSavedTabsMutableState => ({
  categories: [],
  collections: [],
  groups: [],
  memberships: [],
  urls: [],
})

const createExternalDeps = () => {
  let nextId = 0
  return {
    browserTabPort: { open: vi.fn() },
    browserWindowPort: { openWithUrls: vi.fn() },
    clock: { now: () => 100 },
    idGenerator: { generate: () => `generated-${nextId++}` },
    messagingPort: { send: vi.fn() },
    notificationPort: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    },
    storageChangePort: { subscribe: vi.fn() },
    userSettingsRepository: {
      findAll: vi.fn(),
      save: vi.fn(),
    },
  } satisfies Parameters<typeof createNativeSavedTabsPersistenceAdapters>[1]
}

const createCustomCollection = (id: string) => ({
  createdAt: 1,
  definition: {
    projectKeywords: {
      domainKeywords: [],
      titleKeywords: [],
      urlKeywords: [],
    },
    type: 'custom' as const,
  },
  id,
  name: id,
  sortOrder: 0,
  updatedAt: 1,
})

describe('createNativeSavedTabsPersistenceAdapters timestamp provenance', () => {
  it.each([
    [
      'single-project single URL removal',
      async (service: CustomProjectsCommandService) =>
        service.removeUrlFromCustomProject(
          'project',
          'https://selected.example/',
        ),
    ],
    [
      'single-project multi URL removal',
      async (service: CustomProjectsCommandService) =>
        service.removeUrlsFromCustomProject('project', [
          'https://selected.example/',
        ]),
    ],
    [
      'all-project URL ID removal',
      async (service: CustomProjectsCommandService) =>
        service.removeUrlIdsFromAllCustomProjects(['selected-url']),
    ],
  ])(
    '%s removes only selected URLs and preserves unrelated legacy orphans',
    async (_name, removeSelectedUrl) => {
      const state = createState()
      state.collections = [createCustomCollection('project')]
      state.urls = [
        {
          firstSavedAt: 1,
          id: 'legacy-orphan',
          lastSavedAt: 1,
          normalizedUrl: 'https://orphan.example/',
          title: 'Legacy orphan',
          updatedAt: 1,
          url: 'https://orphan.example/',
        },
        {
          firstSavedAt: 1,
          id: 'selected-url',
          lastSavedAt: 1,
          normalizedUrl: 'https://selected.example/',
          title: 'Selected URL',
          updatedAt: 1,
          url: 'https://selected.example/',
        },
      ]
      state.memberships = [
        {
          addedAt: 1,
          collectionId: 'project',
          sortOrder: 0,
          updatedAt: 1,
          urlId: 'selected-url',
        },
      ]
      const adapters = createNativeSavedTabsPersistenceAdapters(
        state,
        createExternalDeps(),
      )

      await removeSelectedUrl(adapters.customProjectsCommandService)

      expect(state.urls.map(({ id }) => id)).toStrictEqual(['legacy-orphan'])
      expect(state.memberships).toStrictEqual([])
    },
  )

  it('preserves exact URL markers and materializes missing legacy markers conservatively', async () => {
    const state = createState()
    state.urls = [
      {
        firstSavedAt: 1,
        firstSavedAtProvenance: 'exact',
        id: 'exact',
        lastSavedAt: 2,
        lastSavedAtProvenance: 'exact',
        normalizedUrl: 'https://exact.example/',
        title: 'exact',
        updatedAt: 2,
        url: 'https://exact.example/',
      },
      {
        firstSavedAt: 3,
        id: 'legacy',
        lastSavedAt: 4,
        normalizedUrl: 'https://legacy.example/',
        title: 'legacy',
        updatedAt: 4,
        url: 'https://legacy.example/',
      },
    ]
    const adapters = createNativeSavedTabsPersistenceAdapters(
      state,
      createExternalDeps(),
    )

    await adapters.urlRecordRepository.saveAll(
      await adapters.urlRecordRepository.findAll(),
    )

    expect(state.urls).toEqual([
      expect.objectContaining({
        firstSavedAtProvenance: 'exact',
        id: 'exact',
        lastSavedAtProvenance: 'exact',
      }),
      expect.objectContaining({
        firstSavedAtProvenance: 'legacy-fallback',
        id: 'legacy',
        lastSavedAtProvenance: 'legacy-fallback',
      }),
    ])
  })

  it('marks new and genuinely updated URL timestamps as exact', async () => {
    const state = createState()
    state.urls = [
      {
        firstSavedAt: 1,
        id: 'legacy',
        lastSavedAt: 2,
        normalizedUrl: 'https://legacy.example/',
        title: 'legacy',
        updatedAt: 2,
        url: 'https://legacy.example/',
      },
    ]
    const adapters = createNativeSavedTabsPersistenceAdapters(
      state,
      createExternalDeps(),
    )

    await adapters.urlRecordRepository.saveAll([
      createUrlRecord({
        id: 'legacy',
        savedAt: 5,
        title: 'updated',
        url: 'https://legacy.example/',
      }),
      createUrlRecord({
        id: 'new',
        savedAt: 6,
        title: 'new',
        url: 'https://new.example/',
      }),
    ])

    expect(state.urls).toEqual([
      expect.objectContaining({
        firstSavedAt: 1,
        firstSavedAtProvenance: 'legacy-fallback',
        id: 'legacy',
        lastSavedAt: 5,
        lastSavedAtProvenance: 'exact',
      }),
      expect.objectContaining({
        firstSavedAt: 6,
        firstSavedAtProvenance: 'exact',
        id: 'new',
        lastSavedAt: 6,
        lastSavedAtProvenance: 'exact',
      }),
    ])
  })

  it('marks URLs and memberships created by custom-project commands as exact', async () => {
    const state = createState()
    state.collections = [
      createCustomCollection('source'),
      createCustomCollection('target'),
    ]
    const adapters = createNativeSavedTabsPersistenceAdapters(
      state,
      createExternalDeps(),
    )

    await adapters.customProjectsCommandService.addUrlToCustomProject(
      'source',
      'https://example.com/',
      'example',
    )

    expect(state.urls[0]).toEqual(
      expect.objectContaining({
        firstSavedAtProvenance: 'exact',
        lastSavedAtProvenance: 'exact',
      }),
    )
    expect(state.memberships[0]).toEqual(
      expect.objectContaining({ addedAtProvenance: 'exact' }),
    )

    await adapters.customProjectsCommandService.moveUrlBetweenCustomProjects(
      'source',
      'target',
      'https://example.com/',
    )

    expect(state.memberships).toEqual([
      expect.objectContaining({
        addedAt: 100,
        addedAtProvenance: 'exact',
        collectionId: 'target',
        updatedAt: 100,
      }),
    ])
  })
})
