import { describe, expect, it, vi } from 'vitest'

import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'
import { createMockParentCategoryRepository } from '@/contexts/saved-tabs/testing/createMockParentCategoryRepository'
import { createMockTabGroupRepository } from '@/contexts/saved-tabs/testing/createMockTabGroupRepository'

import { createRestoreCustomProjectsSnapshotUseCase } from './RestoreCustomProjectsSnapshotUseCase'

const makeRepository = (options: {
  readonly restoreAllRaw?: (
    raws: readonly CustomProjectRawSnapshot[],
  ) => Promise<void>
  readonly saveAll?: (projects: readonly CustomProject[]) => Promise<void>
  readonly saveOrder?: (order: readonly CustomProjectId[]) => Promise<void>
}): CustomProjectRepository => ({
  findAll: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findOrder: vi.fn(async () => []),
  removeByIds: vi.fn(async () => {}),
  saveAll: options.saveAll ?? vi.fn(async () => {}),
  saveOrder: options.saveOrder ?? vi.fn(async () => {}),
  ...(options.restoreAllRaw ? { restoreAllRaw: options.restoreAllRaw } : {}),
})

const projects = [
  createCustomProject({
    categories: ['Reading'],
    createdAt: 1,
    id: 'project-1',
    memberships: [{ category: 'Reading', urlId: 'url-1' }],
    name: 'Project A',
    updatedAt: 2,
  }),
]
const raws: readonly CustomProjectRawSnapshot[] = projects

const createSnapshotRepositories = () => ({
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

describe('RestoreCustomProjectsSnapshotUseCase', () => {
  it('raw snapshotとrestoreAllRawがあればそのcurrent snapshotを復元する', async () => {
    const restoreAllRaw = vi.fn(async () => {})
    const saveAll = vi.fn(async () => {})
    const saveOrder = vi.fn(async () => {})
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      ...createSnapshotRepositories(),
      customProjectRepository: makeRepository({
        restoreAllRaw,
        saveAll,
        saveOrder,
      }),
    })

    await useCase({
      payload: {
        customProjectOrder: ['project-1'],
        customProjects: projects,
        customProjectsRaw: raws,
      },
    })

    expect(restoreAllRaw).toHaveBeenCalledWith(raws)
    expect(saveAll).not.toHaveBeenCalled()
    expect(saveOrder).toHaveBeenCalledWith(['project-1'])
  })

  it.each([
    ['snapshotなし', undefined],
    ['restore portなし', raws],
  ] as const)(
    '%sならnormalized projectsをsaveAllする',
    async (_, rawSnapshot) => {
      const saveAll = vi.fn(async () => {})
      const useCase = createRestoreCustomProjectsSnapshotUseCase({
        ...createSnapshotRepositories(),
        customProjectRepository: makeRepository({ saveAll }),
      })

      await useCase({
        payload: {
          customProjects: projects,
          ...(rawSnapshot ? { customProjectsRaw: rawSnapshot } : {}),
        },
      })

      expect(saveAll).toHaveBeenCalledWith(projects)
    },
  )

  it('order省略時は空orderを書き戻す', async () => {
    const saveOrder = vi.fn(async () => {})
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      ...createSnapshotRepositories(),
      customProjectRepository: makeRepository({ saveOrder }),
    })

    await useCase({ payload: { customProjects: projects } })

    expect(saveOrder).toHaveBeenCalledWith([])
  })

  it('空membershipをそのままcurrent projectとして保存する', async () => {
    const saveAll = vi.fn(async () => {})
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      ...createSnapshotRepositories(),
      customProjectRepository: makeRepository({ saveAll }),
    })
    const emptyProject = createCustomProject({ id: 'project-empty' })

    await useCase({ payload: { customProjects: [emptyProject] } })

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'project-empty', memberships: [] }),
    ])
  })

  it('restores deleted domain, URL metadata and category links alongside raw custom data', async () => {
    const repositories = createSnapshotRepositories()
    const restoreAllRaw = vi.fn(async () => {})
    const saveOrder = vi.fn(async () => {})
    const group = createTabGroup({
      domain: 'example.com',
      id: 'domain',
      parentCategoryId: 'parent',
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
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      ...repositories,
      customProjectRepository: makeRepository({ restoreAllRaw, saveOrder }),
    })

    await useCase({
      payload: {
        customProjectOrder: ['project-1'],
        customProjects: projects,
        customProjectsRaw: raws,
        openedUrlsSnapshot: {
          savedTabs: [group],
          urlRecords: [url],
          parentCategories: [category],
        },
      },
    })

    await expect(repositories.tabGroupRepository.findAll()).resolves.toEqual([
      group,
    ])
    await expect(
      repositories.parentCategoryRepository.findAll(),
    ).resolves.toEqual([category])
    expect(repositories.urlRecordRepository.saveAll).toHaveBeenCalledWith([url])
    expect(restoreAllRaw).toHaveBeenCalledWith(raws)
    expect(saveOrder).toHaveBeenLastCalledWith(['project-1'])
  })

  it('preserves current membership edits and restores only memberships absent from current collections', async () => {
    const previousGroup = createTabGroup({
      id: 'domain',
      domain: 'example.com',
      subCategories: ['Docs'],
      memberships: [
        { category: 'Docs', notes: 'Old domain memo', urlId: 'url-1' },
      ],
    })
    const currentGroup = createTabGroup({
      id: 'domain',
      domain: 'example.com',
      subCategories: ['Edited'],
      memberships: [
        { category: 'Edited', notes: 'Latest domain memo', urlId: 'url-1' },
      ],
    })
    const currentProject = createCustomProject({
      id: 'project-1',
      categories: ['Edited'],
      memberships: [
        { category: 'Edited', notes: 'Latest project memo', urlId: 'url-1' },
      ],
    })
    const absentProject = createCustomProject({
      id: 'project-restored',
      categories: ['Reading'],
      memberships: [
        {
          category: 'Reading',
          notes: 'Restore deleted membership',
          urlId: 'url-1',
        },
      ],
    })
    const repositories = {
      ...createSnapshotRepositories(),
      tabGroupRepository: createMockTabGroupRepository({
        savedTabs: [currentGroup],
      }),
    }
    const saveAll = vi.fn(async (_projects: readonly CustomProject[]) => {})
    const customProjectRepository = makeRepository({ saveAll })
    customProjectRepository.findAll = vi.fn(async () => [currentProject])
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      ...repositories,
      customProjectRepository,
    })

    await useCase({
      payload: {
        customProjects: [...projects, absentProject],
        openedUrlsSnapshot: { savedTabs: [previousGroup] },
      },
    })

    expect(
      (await repositories.tabGroupRepository.findAll())[0]?.memberships,
    ).toEqual(currentGroup.memberships)
    expect(saveAll).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 'project-1',
        memberships: currentProject.memberships,
      }),
      expect.objectContaining({
        id: 'project-restored',
        memberships: absentProject.memberships,
      }),
    ])
  })
})
