import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import {
  toSavedTabsCustomProjectDto,
  toSavedTabsParentCategoryDto,
  toSavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'

import type { RestoreOpenedUrlsSnapshotUseCase } from './RestoreOpenedUrlsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotViewUseCase } from './RestoreOpenedUrlsSnapshotViewUseCase'

describe('RestoreOpenedUrlsSnapshotViewUseCase', () => {
  it('use-case に snapshot を渡し、storage 形 payload へ変換して返す', async () => {
    const restoreOpenedUrlsSnapshot = vi.fn(async () => ({
      restoredCustomProjectOrder: undefined,
      restoredCustomProjects: [],
      restoredParentCategories: [],
      restoredTabGroups: [],
      restoredUrlRecords: [],
    }))
    const useCase = createRestoreOpenedUrlsSnapshotViewUseCase({
      restoreOpenedUrlsSnapshot:
        restoreOpenedUrlsSnapshot as unknown as RestoreOpenedUrlsSnapshotUseCase,
    })

    const snapshot: OpenedUrlsRestoreSnapshot = {
      customProjects: [
        toSavedTabsCustomProjectDto(
          createCustomProject({
            categories: ['cat-1'],
            createdAt: 1,
            id: 'project-1',
            name: 'Reading',
            updatedAt: 2,
            urlIds: ['url-1'],
          }),
        ),
      ],
      customProjectOrder: ['project-1'],
      parentCategories: [
        toSavedTabsParentCategoryDto(
          createParentCategory({
            domains: ['group-1'],
            domainNames: ['example.com'],
            id: 'cat-1',
            name: 'Reading',
          }),
        ),
      ],
      savedTabs: [
        toSavedTabsTabGroupDto(
          createTabGroup({
            domain: 'example.com',
            id: 'group-1',
            parentCategoryId: 'cat-1',
            savedAt: 10,
            urlIds: ['url-1'],
          }),
        ),
      ],
      urlRecords: [],
    }

    const result = await useCase({ snapshot })

    expect(restoreOpenedUrlsSnapshot).toHaveBeenCalledWith({ snapshot })
    expect(result).toStrictEqual({
      customProjects: [
        {
          categories: ['cat-1'],
          createdAt: 1,
          id: 'project-1',
          name: 'Reading',
          updatedAt: 2,
          urlIds: ['url-1'],
        },
      ],
      parentCategories: [
        {
          domains: ['group-1'],
          domainNames: ['example.com'],
          id: 'cat-1',
          name: 'Reading',
        },
      ],
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          parentCategoryId: 'cat-1',
          savedAt: 10,
          urlIds: ['url-1'],
        },
      ],
    })
  })

  it('snapshot の customProjects / parentCategories が undefined のとき payload も undefined のまま', async () => {
    const restoreOpenedUrlsSnapshot = vi.fn(async () => ({
      restoredCustomProjects: [],
      restoredParentCategories: [],
      restoredTabGroups: [],
      restoredUrlRecords: [],
    }))
    const useCase = createRestoreOpenedUrlsSnapshotViewUseCase({
      restoreOpenedUrlsSnapshot:
        restoreOpenedUrlsSnapshot as unknown as RestoreOpenedUrlsSnapshotUseCase,
    })

    const result = await useCase({
      snapshot: { savedTabs: [] } as OpenedUrlsRestoreSnapshot,
    })

    expect(result).toStrictEqual({
      customProjects: undefined,
      parentCategories: undefined,
      savedTabs: [],
    })
  })

  it('use-case が例外を投げた場合は呼び出し元へそのまま伝搬する', async () => {
    const restoreOpenedUrlsSnapshot = vi.fn(async () => {
      throw new Error('restore failed')
    })
    const useCase = createRestoreOpenedUrlsSnapshotViewUseCase({
      restoreOpenedUrlsSnapshot:
        restoreOpenedUrlsSnapshot as unknown as RestoreOpenedUrlsSnapshotUseCase,
    })

    await expect(useCase({ snapshot: { savedTabs: [] } })).rejects.toThrow(
      'restore failed',
    )
  })
})
