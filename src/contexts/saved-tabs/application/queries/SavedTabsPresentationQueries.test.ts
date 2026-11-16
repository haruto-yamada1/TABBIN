import { describe, expect, it, vi } from 'vitest'

import { toCustomProjectRawSnapshot } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { UserSettingsRepository } from '@/contexts/saved-tabs/domain/repositories/UserSettingsRepository'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'
import { createMockParentCategoryRepository } from '@/contexts/saved-tabs/testing/createMockParentCategoryRepository'
import { createMockTabGroupRepository } from '@/contexts/saved-tabs/testing/createMockTabGroupRepository'

import { createGetCustomProjectRawsQuery } from './GetCustomProjectRawsQuery'
import { createGetCustomProjectsQuery } from './GetCustomProjectsQuery'
import { createGetCustomProjectUndoSnapshotQuery } from './GetCustomProjectUndoSnapshotQuery'
import { createGetSavedTabsPageDataQuery } from './GetSavedTabsPageDataQuery'
import { createGetSavedTabsQuery } from './GetSavedTabsQuery'

const settings = {
  clickBehavior: 'saveCurrentTab' as const,
  confirmDeleteAll: true,
  confirmDeleteEach: false,
  enableCategories: true,
  excludePatterns: [],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: true,
  removeTabAfterExternalDrop: false,
  protectFavoriteFromAutoRemoval: true,
  removeTabAfterOpen: false,
  showRelativeSavedTime: false,
  showSavedTime: true,
}

const project = createCustomProject({
  categories: ['Docs'],
  createdAt: 1,
  id: 'project-1',
  memberships: [{ category: 'Docs', notes: 'memo', urlId: 'url-1' }],
  name: 'Project',
  updatedAt: 2,
})

const createProjectRepository = (
  options: {
    readonly findAllRaw?: CustomProjectRepository['findAllRaw']
    readonly projects?: readonly (typeof project)[]
  } = {},
): CustomProjectRepository => ({
  findAll: vi.fn(async () => options.projects ?? []),
  ...(options.findAllRaw ? { findAllRaw: options.findAllRaw } : {}),
  findById: vi.fn(async () => null),
  findOrder: vi.fn(async () => []),
  removeByIds: vi.fn(async () => {}),
  saveAll: vi.fn(async () => {}),
  saveOrder: vi.fn(async () => {}),
})

const createUndoRepositories = () => ({
  parentCategoryRepository: createMockParentCategoryRepository({
    parentCategories: [],
  }),
  tabGroupRepository: createMockTabGroupRepository({ savedTabs: [] }),
  urlRecordRepository: {
    findAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    removeByIds: vi.fn(async () => {}),
    saveAll: vi.fn(async () => {}),
  },
})

describe('saved-tabs presentation queries', () => {
  it('page/query repository entitiesをcurrent projectionのdeep copyで返す', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      memberships: [{ urlId: 'url-1' }],
    })
    const category = createParentCategory({
      collections: [{ domain: 'example.com', id: 'group-1' }],
      id: 'category-1',
      name: 'Docs',
    })
    const userSettingsRepository: UserSettingsRepository = {
      findAll: vi.fn(async () => settings),
      save: vi.fn(async () => {}),
    }

    const pageData = await createGetSavedTabsPageDataQuery({
      parentCategoryRepository: createMockParentCategoryRepository({
        parentCategories: [category],
      }),
      tabGroupReadPort: { findAll: vi.fn(async () => [group]) },
      userSettingsRepository,
    })()
    const groups = await createGetSavedTabsQuery({
      tabGroupRepository: createMockTabGroupRepository({ savedTabs: [group] }),
    })()
    const projects = await createGetCustomProjectsQuery({
      customProjectRepository: createProjectRepository({ projects: [project] }),
    })()

    expect(pageData).toStrictEqual({
      parentCategories: [category],
      tabGroups: [group],
      userSettings: settings,
    })
    expect(groups).toStrictEqual([group])
    expect(projects).toStrictEqual([project])
    expect(groups[0]).not.toBe(group)
    expect(projects[0]).not.toBe(project)
  })

  it('raw queryはcurrent repository snapshotをdeep copyする', async () => {
    const raws = await createGetCustomProjectRawsQuery({
      customProjectRepository: createProjectRepository({
        findAllRaw: vi.fn(async () => [project]),
      }),
    })()

    expect(raws).toStrictEqual([project])
    expect(raws[0]).not.toBe(project)
    expect(raws[0]?.collectionCategories).not.toBe(project.collectionCategories)
    expect(raws[0]?.memberships).not.toBe(project.memberships)
  })

  it('raw queryはraw port未実装時にentity queryを使う', async () => {
    await expect(
      createGetCustomProjectRawsQuery({
        customProjectRepository: createProjectRepository({
          projects: [project],
        }),
      })(),
    ).resolves.toStrictEqual([project])
  })

  it('undo snapshotはorder・current entity・current rawを返す', async () => {
    const repository = createProjectRepository({
      findAllRaw: vi.fn(async () => [project]),
      projects: [project],
    })
    repository.findOrder = vi.fn(async () => [project.id])

    const snapshot = await createGetCustomProjectUndoSnapshotQuery({
      ...createUndoRepositories(),
      customProjectRepository: repository,
    })()

    expect(snapshot).toStrictEqual({
      customProjectOrder: ['project-1'],
      customProjects: [project],
      customProjectsRaw: [project],
    })
    expect(snapshot.customProjectsRaw?.[0]).not.toBe(project)
  })

  it('undo snapshotはraw port未実装と空repositoryを扱う', async () => {
    const repository = createProjectRepository({ projects: [project] })
    const query = createGetCustomProjectUndoSnapshotQuery({
      ...createUndoRepositories(),
      customProjectRepository: repository,
    })

    await expect(query()).resolves.toMatchObject({ customProjects: [project] })
    repository.findAll = vi.fn(async () => [])
    await expect(query()).resolves.toStrictEqual({})
  })

  it('custom deletion Undo captures domain memberships, categories and URL metadata together', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'domain',
      subCategories: ['Docs'],
      memberships: [{ category: 'Docs', notes: 'domain memo', urlId: 'url-1' }],
    })
    const category = createParentCategory({
      collections: [{ domain: 'example.com', id: 'domain' }],
      id: 'parent',
      name: 'Work',
    })
    const url = createUrlRecord({
      id: 'url-1',
      isFavorite: true,
      savedAt: 123,
      title: 'Saved title',
      url: 'https://example.com/docs',
    })
    const repositories = createUndoRepositories()
    const query = createGetCustomProjectUndoSnapshotQuery({
      ...repositories,
      customProjectRepository: createProjectRepository({ projects: [project] }),
      parentCategoryRepository: createMockParentCategoryRepository({
        parentCategories: [category],
      }),
      tabGroupRepository: createMockTabGroupRepository({ savedTabs: [group] }),
      urlRecordRepository: {
        ...repositories.urlRecordRepository,
        findAll: vi.fn(async () => [url]),
      },
    })

    const snapshot = await query({ includeSavedUrls: true })

    expect(snapshot).toMatchObject({
      openedUrlsSnapshot: {
        customProjects: [project],
        parentCategories: [category],
        savedTabs: [group],
        urlRecords: [url],
      },
    })
    expect(snapshot.openedUrlsSnapshot?.savedTabs?.[0]).not.toBe(group)
    expect(snapshot.openedUrlsSnapshot?.urlRecords?.[0]).not.toBe(url)
  })

  it('rejects an incomplete shared snapshot when a domain read fails', async () => {
    const repositories = createUndoRepositories()
    const failure = new Error('domain storage unavailable')
    repositories.tabGroupRepository.findAll = vi.fn(async () => {
      throw failure
    })
    const query = createGetCustomProjectUndoSnapshotQuery({
      ...repositories,
      customProjectRepository: createProjectRepository({ projects: [project] }),
    })

    await expect(query({ includeSavedUrls: true })).rejects.toBe(failure)
  })

  it.each([undefined, { includeSavedUrls: false }])(
    'project-only Undo does not read or restore shared URLs (%s)',
    async (options) => {
      const repositories = createUndoRepositories()
      const forbiddenRead = vi.fn(async () => {
        throw new Error('Project-only Undo must not capture shared saved URLs')
      })
      const query = createGetCustomProjectUndoSnapshotQuery({
        ...repositories,
        customProjectRepository: createProjectRepository({
          projects: [project],
        }),
        parentCategoryRepository: {
          ...repositories.parentCategoryRepository,
          findAll: forbiddenRead,
        },
        tabGroupRepository: {
          ...repositories.tabGroupRepository,
          findAll: forbiddenRead,
        },
        urlRecordRepository: {
          ...repositories.urlRecordRepository,
          findAll: forbiddenRead,
          findAllRaw: forbiddenRead,
        },
      })

      await expect(query(options)).resolves.toEqual({
        customProjects: [project],
      })
      expect(forbiddenRead).not.toHaveBeenCalled()
    },
  )

  it('URL Undo captures only target URLs owned by the source project across both modes', async () => {
    const selected = createUrlRecord({
      id: 'selected',
      savedAt: 2,
      title: 'Selected',
      url: 'https://example.com/a',
    })
    const unrelated = createUrlRecord({
      id: 'unrelated',
      savedAt: 2,
      title: 'Unrelated',
      url: 'https://other.example/b',
    })
    const source = createCustomProject({
      id: 'source',
      memberships: [{ urlId: selected.id }],
      name: 'Source',
    })
    const shared = createCustomProject({
      id: 'shared',
      memberships: [{ urlId: selected.id }, { urlId: unrelated.id }],
      name: 'Shared',
    })
    const unrelatedProject = createCustomProject({
      id: 'unrelated-project',
      memberships: [{ urlId: unrelated.id }],
      name: 'Unrelated',
    })
    const raws = [selected, unrelated].map((record) => ({
      firstSavedAt: 1,
      id: record.id,
      lastSavedAt: 2,
      normalizedUrl: record.url,
      title: record.title,
      updatedAt: 3,
      url: record.url,
    }))
    const repositories = createUndoRepositories()
    const query = createGetCustomProjectUndoSnapshotQuery({
      ...repositories,
      customProjectRepository: createProjectRepository({
        projects: [source, shared, unrelatedProject],
        findAllRaw: vi.fn(async () => [source, shared, unrelatedProject]),
      }),
      tabGroupRepository: createMockTabGroupRepository({
        savedTabs: [
          createTabGroup({
            id: 'domain',
            domain: 'example.com',
            memberships: [{ urlId: selected.id }],
          }),
          createTabGroup({
            id: 'other-domain',
            domain: 'other.example',
            memberships: [{ urlId: unrelated.id }],
          }),
        ],
      }),
      parentCategoryRepository: createMockParentCategoryRepository({
        parentCategories: [
          createParentCategory({
            id: 'parent',
            name: 'Work',
            collections: [
              { id: 'domain', domain: 'example.com' },
              { id: 'other-domain', domain: 'other.example' },
            ],
          }),
        ],
      }),
      urlRecordRepository: {
        ...repositories.urlRecordRepository,
        findAll: vi.fn(async () => [selected, unrelated]),
        findAllRaw: vi.fn(async () => raws),
      },
    })

    const snapshot = await query({
      includeSavedUrls: true,
      targets: [{ projectId: 'source', urls: [selected.url, unrelated.url] }],
    })

    expect(snapshot.openedUrlsSnapshot?.urlRecords).toEqual([selected])
    expect(snapshot.urlRecordsRaw).toEqual([raws[0]])
    expect(snapshot.openedUrlsSnapshot?.savedTabs?.map(({ id }) => id)).toEqual(
      ['domain'],
    )
    expect(snapshot.openedUrlsSnapshot?.parentCategories).toMatchObject([
      { id: 'parent', collections: [{ id: 'domain' }] },
    ])
    expect(
      snapshot.customProjects?.map(({ id, memberships }) => ({
        id,
        urlIds: memberships.map(({ urlId }) => urlId),
      })),
    ).toEqual([
      { id: 'source', urlIds: ['selected'] },
      { id: 'shared', urlIds: ['selected'] },
    ])
    expect(snapshot.customProjectsRaw).toEqual(snapshot.customProjects)
  })

  it('application raw DTOをrepository snapshotへdeep copyする', () => {
    const raw = toCustomProjectRawSnapshot(project)
    expect(raw).toStrictEqual(project)
    expect(raw).not.toBe(project)
    expect(raw.memberships).not.toBe(project.memberships)
  })
})
