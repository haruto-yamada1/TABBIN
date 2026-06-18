import { beforeEach, describe, expect, it } from 'vitest' // eslint-disable-line

import type { TabGroupDto } from '../../domain/dto/TabGroupDto'
import type { UrlRecord } from '../../domain/entities/UrlRecord'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createLoadTabGroupsWithUrlsUseCase } from './LoadTabGroupsWithUrlsUseCase'
import type { LoadTabGroupsWithUrlsUseCaseDeps } from './LoadTabGroupsWithUrlsUseCase'

const createUrlRecord = (overrides: Partial<UrlRecord>): UrlRecord => ({
  favIconUrl: undefined,
  id: 'url-1' as never,
  savedAt: 1 as never,
  title: 'Title',
  url: 'https://example.com' as never,
  ...overrides,
})

const createTabGroup = (overrides: Partial<TabGroupDto>): TabGroupDto => ({
  domain: 'example.com',
  id: 'group-1',
  urlIds: [],
  ...overrides,
})

const createInMemoryUrlRecordRepository = (
  records: readonly UrlRecord[],
): UrlRecordRepository => ({
  findAll: async () => records,

  findById: async (id) => records.find((record) => record.id === id) ?? null,

  saveAll: async () => undefined,

  removeByIds: async () => undefined,
})

describe('LoadTabGroupsWithUrlsUseCase', () => {
  let deps: LoadTabGroupsWithUrlsUseCaseDeps

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

  it('空の tabGroups に対しては storage に触れず空配列を返す', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase(deps)
    const result = await useCase({ tabGroups: [] })
    expect(result.tabGroups).toStrictEqual([])
  })

  it('urlIds から urlRecord を引き当てて urls を組み立てる', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase(deps)
    const result = await useCase({
      tabGroups: [
        createTabGroup({
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
        }),
      ],
    })
    expect(result.tabGroups[0]?.urls).toStrictEqual([
      expect.objectContaining({
        id: 'url-1',
        url: 'https://example.com/1',
      }),
      expect.objectContaining({
        id: 'url-2',
        url: 'https://example.com/2',
      }),
    ])
  })

  it('urlSubCategories があれば subCategory が引き継がれる', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase(deps)
    const result = await useCase({
      tabGroups: [
        createTabGroup({
          id: 'group-1',
          urlIds: ['url-1'],
          urlSubCategories: { 'url-1': 'Docs' },
        }),
      ],
    })
    expect(result.tabGroups[0]?.urls?.[0]?.subCategory).toBe('Docs')
  })

  it('urlIds が空のグループは urls: [] として返す', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase(deps)
    const result = await useCase({
      tabGroups: [createTabGroup({ id: 'group-empty' })],
    })
    expect(result.tabGroups[0]?.urls).toStrictEqual([])
  })

  it('urlRecord が見つからない urlId はスキップする', async () => {
    const useCase = createLoadTabGroupsWithUrlsUseCase(deps)
    const result = await useCase({
      tabGroups: [
        createTabGroup({
          id: 'group-1',
          urlIds: ['url-1', 'missing'],
        }),
      ],
    })
    expect(result.tabGroups[0]?.urls).toHaveLength(1)
    expect(result.tabGroups[0]?.urls?.[0]?.id).toBe('url-1')
  })
})
