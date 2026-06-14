import { beforeEach, describe, expect, it } from 'vitest' // eslint-disable-line

import type { TabGroup } from '@/types/storage'

import type { UrlRecord } from '../../domain/entities/UrlRecord'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createLoadTabGroupUrlsUseCase } from './LoadTabGroupUrlsUseCase'
import type { LoadTabGroupUrlsUseCaseDeps } from './LoadTabGroupUrlsUseCase'

const createUrlRecord = (overrides: Partial<UrlRecord>): UrlRecord => ({
  favIconUrl: undefined,
  id: 'url-1' as never,
  savedAt: 1 as never,
  title: 'Title',
  url: 'https://example.com' as never,
  ...overrides,
})

const createTabGroup = (overrides: Partial<TabGroup>): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  urlIds: [],
  ...overrides,
})

const createInMemoryUrlRecordRepository = (
  records: readonly UrlRecord[],
): UrlRecordRepository => ({
  // eslint-disable-next-line typescript/require-await
  findAll: async () => records,
  // eslint-disable-next-line typescript/require-await
  findById: async (id) => records.find((record) => record.id === id) ?? null,
  // eslint-disable-next-line typescript/require-await
  saveAll: async () => undefined,
  // eslint-disable-next-line typescript/require-await
  removeByIds: async () => undefined,
})

describe('LoadTabGroupUrlsUseCase', () => {
  let deps: LoadTabGroupUrlsUseCaseDeps

  beforeEach(() => {
    deps = {
      urlRecordRepository: createInMemoryUrlRecordRepository([
        createUrlRecord({
          id: 'url-1' as never,
          url: 'https://example.com/1' as never,
        }),
        createUrlRecord({
          id: 'url-2' as never,
          url: 'https://example.com/2' as never,
        }),
      ]),
    }
  })

  it('urlIds がないグループは空配列を返す', async () => {
    const useCase = createLoadTabGroupUrlsUseCase(deps)
    const result = await useCase({
      tabGroup: createTabGroup({ id: 'group-empty' }),
    })
    expect(result.urls).toStrictEqual([])
  })

  it('urlIds から urlRecord を引き当てて urls 配列を返す', async () => {
    const useCase = createLoadTabGroupUrlsUseCase(deps)
    const result = await useCase({
      tabGroup: createTabGroup({
        id: 'group-1',
        urlIds: ['url-1', 'url-2'],
      }),
    })
    expect(result.urls).toHaveLength(2)
    expect(result.urls[0]?.id).toBe('url-1')
    expect(result.urls[1]?.id).toBe('url-2')
  })

  it('urlSubCategories の subCategory が引き継がれる', async () => {
    const useCase = createLoadTabGroupUrlsUseCase(deps)
    const result = await useCase({
      tabGroup: createTabGroup({
        id: 'group-1',
        urlIds: ['url-1'],
        urlSubCategories: { 'url-1': 'Tech' },
      }),
    })
    expect(result.urls[0]?.subCategory).toBe('Tech')
  })

  it('urlRecord が見つからない urlId はスキップする', async () => {
    const useCase = createLoadTabGroupUrlsUseCase(deps)
    const result = await useCase({
      tabGroup: createTabGroup({
        id: 'group-1',
        urlIds: ['url-1', 'missing'],
      }),
    })
    expect(result.urls).toHaveLength(1)
  })
})
