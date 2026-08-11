import { describe, expect, it, vi } from 'vitest'

import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createLoadTabGroupsWithUrlsUseCase } from './LoadTabGroupsWithUrlsUseCase'

const createRepository = (): UrlRecordRepository => {
  const records = [
    createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'One',
      url: 'https://example.com/1',
    }),
    createUrlRecord({
      id: 'url-2',
      savedAt: 2,
      title: 'Two',
      url: 'https://example.com/2',
    }),
  ]
  return {
    findAll: vi.fn(async () => records),
    findById: vi.fn(
      async (id) => records.find((record) => record.id === id) ?? null,
    ),
    removeByIds: vi.fn(async () => {}),
    saveAll: vi.fn(async () => {}),
  }
}

describe('LoadTabGroupsWithUrlsUseCase', () => {
  it('空のtabGroupsならrepositoryに触れず空配列を返す', async () => {
    const repository = createRepository()
    const useCase = createLoadTabGroupsWithUrlsUseCase({
      urlRecordRepository: repository,
    })

    await expect(useCase({ tabGroups: [] })).resolves.toStrictEqual({
      tabGroups: [],
    })
    expect(repository.findAll).not.toHaveBeenCalled()
  })

  it('membershipsをURL recordへ解決してresolvedUrlsを組み立てる', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase({
      urlRecordRepository: createRepository(),
    })
    const group = createTabGroup({
      id: 'group-1',
      memberships: [{ urlId: 'url-1' }, { urlId: 'url-2' }],
    })

    const result = await useCase({ tabGroups: [group] })

    expect(result.tabGroups[0]?.resolvedUrls).toStrictEqual([
      expect.objectContaining({ id: 'url-1', url: 'https://example.com/1' }),
      expect.objectContaining({ id: 'url-2', url: 'https://example.com/2' }),
    ])
  })

  it('membership categoryをresolved URLのsubCategoryへ投影する', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase({
      urlRecordRepository: createRepository(),
    })
    const group = createTabGroup({
      id: 'group-1',
      memberships: [{ category: 'Docs', urlId: 'url-1' }],
      subCategories: ['Docs'],
    })

    const result = await useCase({ tabGroups: [group] })

    expect(result.tabGroups[0]?.resolvedUrls?.[0]?.subCategory).toBe('Docs')
  })

  it('空membershipと未解決membershipはresolvedUrlsへ追加しない', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase({
      urlRecordRepository: createRepository(),
    })
    const empty = createTabGroup({ id: 'group-empty' })
    const partial = createTabGroup({
      id: 'group-partial',
      memberships: [{ urlId: 'url-1' }, { urlId: 'missing' }],
    })

    const result = await useCase({ tabGroups: [empty, partial] })

    expect(result.tabGroups[0]?.resolvedUrls).toStrictEqual([])
    expect(
      result.tabGroups[1]?.resolvedUrls?.map(({ id }) => id),
    ).toStrictEqual(['url-1'])
  })
})
