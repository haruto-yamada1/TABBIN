import { describe, expect, it, vi } from 'vitest'

import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createCustomProject } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createGetProjectUrlsUseCase } from './GetProjectUrlsUseCase'

const createCustomProjectRepository = (): CustomProjectRepository => ({
  findAll: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findOrder: vi.fn(async () => []),
  removeByIds: vi.fn(async () => {}),
  saveAll: vi.fn(async () => {}),
  saveOrder: vi.fn(async () => {}),
})

const createUrlRecordRepository = (
  records: readonly ReturnType<typeof createUrlRecord>[],
): UrlRecordRepository => ({
  findAll: vi.fn(async () => records),
  findById: vi.fn(
    async (id) => records.find((record) => record.id === id) ?? null,
  ),
  removeByIds: vi.fn(async () => {}),
  saveAll: vi.fn(async () => {}),
})

describe('GetProjectUrlsUseCase', () => {
  it('current membershipをsortOrder順にURL・category・notesへ解決する', async () => {
    const project = createCustomProject({
      categories: ['Reading'],
      id: 'project-1',
      memberships: [
        { category: 'Reading', notes: 'second', urlId: 'url-b' },
        { notes: 'first', urlId: 'url-a' },
      ],
      name: 'Research',
    })
    const [second, first] = project.memberships
    if (!(first && second)) {
      throw new Error('expected two membership fixtures')
    }
    const reversedMemberships = [
      { ...second, sortOrder: 1 },
      { ...first, sortOrder: 0 },
    ]
    const currentProject = { ...project, memberships: reversedMemberships }
    const useCase = createGetProjectUrlsUseCase({
      customProjectRepository: createCustomProjectRepository(),
      urlRecordRepository: createUrlRecordRepository([
        createUrlRecord({
          id: 'url-a',
          savedAt: 10,
          title: 'A',
          url: 'https://example.com/a',
        }),
        createUrlRecord({
          favIconUrl: 'https://example.com/b.ico',
          id: 'url-b',
          savedAt: 11,
          title: 'B',
          url: 'https://example.com/b',
        }),
      ]),
    })

    await expect(useCase(currentProject)).resolves.toStrictEqual([
      {
        id: 'url-a',
        notes: 'first',
        savedAt: 10,
        title: 'A',
        url: 'https://example.com/a',
      },
      {
        category: 'Reading',
        favIconUrl: 'https://example.com/b.ico',
        id: 'url-b',
        notes: 'second',
        savedAt: 11,
        title: 'B',
        url: 'https://example.com/b',
      },
    ])
  })

  it('URL recordが存在しないmembershipをsilent legacy fallbackせずskipする', async () => {
    const project = createCustomProject({
      id: 'project-1',
      memberships: [{ urlId: 'missing' }],
    })
    const useCase = createGetProjectUrlsUseCase({
      customProjectRepository: createCustomProjectRepository(),
      urlRecordRepository: createUrlRecordRepository([]),
    })

    await expect(useCase(project)).resolves.toStrictEqual([])
  })

  it('membershipが空なら空配列を返す', async () => {
    const useCase = createGetProjectUrlsUseCase({
      customProjectRepository: createCustomProjectRepository(),
      urlRecordRepository: createUrlRecordRepository([]),
    })

    await expect(
      useCase(createCustomProject({ id: 'project-empty' })),
    ).resolves.toStrictEqual([])
  })
})
