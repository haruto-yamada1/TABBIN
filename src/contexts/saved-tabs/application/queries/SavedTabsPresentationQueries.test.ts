import { describe, expect, it, vi } from 'vitest'

import { toCustomProjectRawSnapshot } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { UserSettingsRepository } from '@/contexts/saved-tabs/domain/repositories/UserSettingsRepository'
import { createMockParentCategoryRepository } from '@/contexts/saved-tabs/testing/createMockParentCategoryRepository'
import { createMockTabGroupRepository } from '@/contexts/saved-tabs/testing/createMockTabGroupRepository'

import { createGetCustomProjectRawsQuery } from './GetCustomProjectRawsQuery'
import { createGetCustomProjectsQuery } from './GetCustomProjectsQuery'
import { createGetCustomProjectUndoSnapshotQuery } from './GetCustomProjectUndoSnapshotQuery'
import { createGetSavedTabsPageDataQuery } from './GetSavedTabsPageDataQuery'
import { createGetSavedTabsQuery } from './GetSavedTabsQuery'

const createSettings = () => ({
  clickBehavior: 'saveCurrentTab' as const,
  confirmDeleteAll: true,
  confirmDeleteEach: false,
  enableCategories: true,
  excludePatterns: [],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: true,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showSavedTime: true,
})

describe('saved-tabs presentation queries', () => {
  it('repository entityをapplication DTOへ変換して返す', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const category = createParentCategory({
      domainNames: ['example.com'],
      domains: ['group-1'],
      id: 'category-1',
      name: 'Docs',
    })
    const project = createCustomProject({
      categories: [],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 2,
      urlIds: ['url-1'],
    })
    const settings = createSettings()
    const tabGroupRepository = createMockTabGroupRepository({
      savedTabs: [group],
    })
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [category],
    })
    const customProjectRepository: CustomProjectRepository = {
      findAll: vi.fn(async () => [project]),
      findById: vi.fn(async () => project),
      saveAll: vi.fn(async () => {}),
      removeByIds: vi.fn(async () => {}),
      findOrder: vi.fn(async () => []),
      saveOrder: vi.fn(async () => {}),
    }
    const userSettingsRepository: UserSettingsRepository = {
      findAll: vi.fn(async () => settings),
      save: vi.fn(async () => {}),
    }

    const pageData = await createGetSavedTabsPageDataQuery({
      parentCategoryRepository,
      tabGroupReadPort: {
        findAll: vi.fn(async () => [
          { domain: 'example.com', id: 'group-1', urlIds: ['url-1'] },
        ]),
      },
      userSettingsRepository,
    })()
    const groups = await createGetSavedTabsQuery({ tabGroupRepository })()
    const projects = await createGetCustomProjectsQuery({
      customProjectRepository,
    })()

    expect(pageData.tabGroups).toStrictEqual([
      { domain: 'example.com', id: 'group-1', urlIds: ['url-1'] },
    ])
    expect(pageData.parentCategories).toStrictEqual([
      {
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'category-1',
        name: 'Docs',
      },
    ])
    expect(pageData.userSettings).toStrictEqual(settings)
    expect(groups).toStrictEqual(pageData.tabGroups)
    expect(projects).toStrictEqual([
      {
        categories: [],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 2,
        urlIds: ['url-1'],
      },
    ])
    expect(pageData.tabGroups[0]).not.toBe(group)
    expect(pageData.parentCategories[0]).not.toBe(category)
    expect(pageData.userSettings).not.toBe(settings)
    expect(groups[0]).not.toBe(group)
    expect(projects[0]).not.toBe(project)
  })

  it('repository raw snapshotをrich field付きapplication DTOへコピーする', async () => {
    const raw = {
      categories: ['Docs'],
      categoryOrder: ['Docs'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      projectKeywords: {
        domainKeywords: ['example.com'],
        titleKeywords: ['reference'],
        urlKeywords: ['docs'],
      },
      updatedAt: 2,
      urlIds: ['url-1'],
      urlMetadata: {
        'https://example.com': { category: 'Docs', notes: 'memo' },
      },
      urls: [
        {
          id: 'url-1',
          savedAt: 3,
          title: 'Example',
          url: 'https://example.com',
        },
      ],
    }
    const customProjectRepository: CustomProjectRepository = {
      findAll: vi.fn(async () => []),
      findAllRaw: vi.fn(async () => [raw]),
      findById: vi.fn(async () => null),
      findOrder: vi.fn(async () => []),
      removeByIds: vi.fn(async () => {}),
      saveAll: vi.fn(async () => {}),
      saveOrder: vi.fn(async () => {}),
    }

    const [dto] = await createGetCustomProjectRawsQuery({
      customProjectRepository,
    })()

    expect(dto).toStrictEqual(raw)
    expect(dto).not.toBe(raw)
    expect(dto?.urls).not.toBe(raw.urls)
    expect(dto?.urlMetadata).not.toBe(raw.urlMetadata)
    expect(dto?.projectKeywords).not.toBe(raw.projectKeywords)
  })

  it('raw読取未実装ならentityをapplication raw DTOへ変換する', async () => {
    const project = createCustomProject({
      categories: ['Docs'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 2,
      urlIds: ['url-1'],
    })
    const customProjectRepository: CustomProjectRepository = {
      findAll: vi.fn(async () => [project]),
      findById: vi.fn(async () => project),
      findOrder: vi.fn(async () => []),
      removeByIds: vi.fn(async () => {}),
      saveAll: vi.fn(async () => {}),
      saveOrder: vi.fn(async () => {}),
    }

    const raws = await createGetCustomProjectRawsQuery({
      customProjectRepository,
    })()

    expect(raws).toStrictEqual([
      {
        categories: ['Docs'],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 2,
        urlIds: ['url-1'],
      },
    ])
  })

  it('undo snapshotはorder・entity・rich rawをapplication DTOで返す', async () => {
    const raw = {
      categories: ['Docs'],
      categoryOrder: ['Docs'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      projectKeywords: {
        domainKeywords: ['example.com'],
        titleKeywords: ['Example'],
        urlKeywords: ['docs'],
      },
      updatedAt: 2,
      urlIds: ['url-1'],
      urlMetadata: { 'url-1': { category: 'Docs' } },
      urls: [
        {
          id: 'url-1',
          title: 'Example',
          url: 'https://example.com',
        },
      ],
    }
    const customProjectRepository: CustomProjectRepository = {
      findAll: vi.fn(async () => []),
      findAllRaw: vi.fn(async () => [raw]),
      findById: vi.fn(async () => null),
      findOrder: vi.fn(async () => ['project-1' as never]),
      removeByIds: vi.fn(async () => {}),
      saveAll: vi.fn(async () => {}),
      saveOrder: vi.fn(async () => {}),
    }

    const snapshot = await createGetCustomProjectUndoSnapshotQuery({
      customProjectRepository,
    })()

    expect(snapshot.customProjectOrder).toStrictEqual(['project-1'])
    expect(snapshot.customProjects).toStrictEqual([
      {
        categories: ['Docs'],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 2,
        urlIds: ['url-1'],
      },
    ])
    expect(snapshot.customProjectsRaw).toStrictEqual([raw])
    expect(snapshot.customProjectsRaw?.[0]).not.toBe(raw)
  })

  it('undo snapshotはraw未実装と空repositoryを扱う', async () => {
    const project = createCustomProject({
      categories: [],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 2,
      urlIds: [],
    })
    const customProjectRepository: CustomProjectRepository = {
      findAll: vi
        .fn<CustomProjectRepository['findAll']>()
        .mockResolvedValueOnce([project])
        .mockResolvedValueOnce([]),
      findById: vi.fn(async () => null),
      findOrder: vi.fn(async () => []),
      removeByIds: vi.fn(async () => {}),
      saveAll: vi.fn(async () => {}),
      saveOrder: vi.fn(async () => {}),
    }
    const getSnapshot = createGetCustomProjectUndoSnapshotQuery({
      customProjectRepository,
    })

    await expect(getSnapshot()).resolves.toStrictEqual({
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 2,
          urlIds: [],
        },
      ],
    })
    await expect(getSnapshot()).resolves.toStrictEqual({})
  })

  it('application raw DTOをrepository rawへdeep copyする', () => {
    const dto = {
      categories: ['Docs'],
      categoryOrder: ['Docs'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      projectKeywords: {
        domainKeywords: ['example.com'],
        titleKeywords: ['title'],
        urlKeywords: ['url'],
      },
      updatedAt: 2,
      urlIds: ['url-1'],
      urlMetadata: { 'url-1': { notes: 'memo' } },
      urls: [{ title: 'Example', url: 'https://example.com' }],
    }

    const raw = toCustomProjectRawSnapshot(dto)

    expect(raw).toStrictEqual(dto)
    expect(raw.categories).not.toBe(dto.categories)
    expect(raw.urls).not.toBe(dto.urls)
    expect(raw.urlMetadata).not.toBe(dto.urlMetadata)
  })

  it('application raw DTOのoptional field省略を保持する', () => {
    expect(
      toCustomProjectRawSnapshot({
        categories: [],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 2,
      }),
    ).toStrictEqual({
      categories: [],
      categoryOrder: undefined,
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      projectKeywords: undefined,
      updatedAt: 2,
      urlIds: undefined,
      urlMetadata: undefined,
      urls: undefined,
    })
  })
})
