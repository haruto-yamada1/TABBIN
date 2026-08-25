import { describe, expect, it, vi } from 'vitest'

import { toCustomProjectRawSnapshot } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
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
  removeTabAfterOpen: false,
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
    })
    repository.findOrder = vi.fn(async () => [project.id])

    const snapshot = await createGetCustomProjectUndoSnapshotQuery({
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
      customProjectRepository: repository,
    })

    await expect(query()).resolves.toStrictEqual({ customProjects: [project] })
    repository.findAll = vi.fn(async () => [])
    await expect(query()).resolves.toStrictEqual({})
  })

  it('application raw DTOをrepository snapshotへdeep copyする', () => {
    const raw = toCustomProjectRawSnapshot(project)
    expect(raw).toStrictEqual(project)
    expect(raw).not.toBe(project)
    expect(raw.memberships).not.toBe(project.memberships)
  })
})
