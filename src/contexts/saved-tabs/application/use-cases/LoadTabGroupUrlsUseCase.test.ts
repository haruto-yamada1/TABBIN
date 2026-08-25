import { describe, expect, it } from 'vitest'

import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createLoadTabGroupUrlsUseCase } from './LoadTabGroupUrlsUseCase'

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
    findAll: async () => records,
    findById: async (id) => records.find((record) => record.id === id) ?? null,
    removeByIds: async () => {},
    saveAll: async () => {},
  }
}

describe('LoadTabGroupUrlsUseCase', () => {
  it('空membershipなら空配列を返す', async () => {
    const useCase = createLoadTabGroupUrlsUseCase({
      urlRecordRepository: createRepository(),
    })
    await expect(
      useCase({ tabGroup: createTabGroup({ id: 'group-empty' }) }),
    ).resolves.toStrictEqual({ urls: [] })
  })

  it('membershipsをURL recordへ解決する', async () => {
    const useCase = createLoadTabGroupUrlsUseCase({
      urlRecordRepository: createRepository(),
    })
    const result = await useCase({
      tabGroup: createTabGroup({
        id: 'group-1',
        memberships: [{ urlId: 'url-1' }, { urlId: 'url-2' }],
      }),
    })

    expect(result.urls.map(({ id }) => id)).toStrictEqual(['url-1', 'url-2'])
  })

  it('membership categoryをsubCategoryへ投影し未解決URLをskipする', async () => {
    const useCase = createLoadTabGroupUrlsUseCase({
      urlRecordRepository: createRepository(),
    })
    const result = await useCase({
      tabGroup: createTabGroup({
        id: 'group-1',
        memberships: [
          { category: 'Tech', urlId: 'url-1' },
          { urlId: 'missing' },
        ],
        subCategories: ['Tech'],
      }),
    })

    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]?.subCategory).toBe('Tech')
  })
})
