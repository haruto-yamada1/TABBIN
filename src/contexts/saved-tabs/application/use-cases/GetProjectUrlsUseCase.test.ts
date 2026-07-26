import { describe, expect, it, vi } from 'vitest'

import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createSavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import { createUrl } from '@/contexts/saved-tabs/domain/value-objects/Url'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

import { createGetProjectUrlsUseCase } from './GetProjectUrlsUseCase'

const createUrlRecordRepository = (
  records: readonly UrlRecord[],
): UrlRecordRepository => ({
  findAll: vi.fn(async () => records),
  findById: vi.fn(
    async (id) => records.find((record) => record.id === id) ?? null,
  ),
  removeByIds: vi.fn(async () => {}),
  saveAll: vi.fn(async () => {}),
})

const createCustomProjectRepository = (
  raws: Awaited<ReturnType<NonNullable<CustomProjectRepository['findAllRaw']>>>,
): CustomProjectRepository => ({
  findAll: vi.fn(async () => []),
  findAllRaw: vi.fn(async () => raws),
  findById: vi.fn(async () => null),
  findOrder: vi.fn(async () => []),
  removeByIds: vi.fn(async () => {}),
  saveAll: vi.fn(async () => {}),
  saveOrder: vi.fn(async () => {}),
})

describe('GetProjectUrlsUseCase', () => {
  it('urlIds が空の場合は空配列を返す', async () => {
    const project: CustomProject = {
      categories: [],
      createdAt: 1,
      id: 'project-empty',
      name: 'Empty',
      updatedAt: 1,
      urlIds: [],
    }
    const useCase = createGetProjectUrlsUseCase({
      customProjectRepository: createCustomProjectRepository([]),
      urlRecordRepository: createUrlRecordRepository([]),
    })

    await expect(useCase(project)).resolves.toStrictEqual([])
  })

  it('UrlRecord が未解決でも import raw の urls から custom project 一覧を復元する (issue #548)', async () => {
    const project: CustomProject = {
      categories: ['Reading'],
      createdAt: 1,
      id: 'project-1',
      name: 'Research',
      updatedAt: 2,
      urlIds: ['url-imported-a', 'url-imported-b'],
    }
    const useCase = createGetProjectUrlsUseCase({
      customProjectRepository: createCustomProjectRepository([
        {
          categories: ['Reading'],
          categoryOrder: ['Reading'],
          createdAt: 1,
          id: 'project-1',
          name: 'Research',
          updatedAt: 2,
          urlIds: ['url-imported-a', 'url-imported-b'],
          urlMetadata: {
            'url-imported-a': { category: 'Reading', notes: 'A memo' },
            'url-imported-b': { category: 'Reading', notes: 'B memo' },
          },
          urls: [
            {
              id: 'url-imported-a',
              savedAt: 10,
              title: 'Imported A',
              url: 'https://imported.example.com/a',
            },
            {
              id: 'url-imported-b',
              savedAt: 11,
              title: 'Imported B',
              url: 'https://imported.example.com/b',
            },
          ],
        },
      ]),
      urlRecordRepository: createUrlRecordRepository([]),
    })

    await expect(useCase(project)).resolves.toStrictEqual([
      {
        category: 'Reading',
        id: 'url-imported-a',
        notes: 'A memo',
        savedAt: 10,
        title: 'Imported A',
        url: 'https://imported.example.com/a',
      },
      {
        category: 'Reading',
        id: 'url-imported-b',
        notes: 'B memo',
        savedAt: 11,
        title: 'Imported B',
        url: 'https://imported.example.com/b',
      },
    ])
  })

  it('UrlRecord が解決できる場合は UrlRecordRepository の値を優先する', async () => {
    const project: CustomProject = {
      categories: ['Reading'],
      createdAt: 1,
      id: 'project-1',
      name: 'Research',
      updatedAt: 2,
      urlIds: ['url-existing'],
    }
    const record: UrlRecord = {
      id: createUrlRecordId('url-existing'),
      savedAt: createSavedAt(20),
      title: 'Current title',
      url: createUrl('https://current.example.com'),
    }
    const useCase = createGetProjectUrlsUseCase({
      customProjectRepository: createCustomProjectRepository([
        {
          categories: ['Reading'],
          createdAt: 1,
          id: 'project-1',
          name: 'Research',
          updatedAt: 2,
          urlIds: ['url-existing'],
          urls: [
            {
              id: 'url-existing',
              savedAt: 10,
              title: 'Stale title',
              url: 'https://stale.example.com',
            },
          ],
        },
      ]),
      urlRecordRepository: createUrlRecordRepository([record]),
    })

    await expect(useCase(project)).resolves.toStrictEqual([
      {
        id: 'url-existing',
        savedAt: 20,
        title: 'Current title',
        url: 'https://current.example.com',
      },
    ])
  })
})
