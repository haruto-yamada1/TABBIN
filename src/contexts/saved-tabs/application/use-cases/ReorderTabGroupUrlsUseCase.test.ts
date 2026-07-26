import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { TabGroup as DomainTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

import { createReorderTabGroupUrlsUseCase } from './ReorderTabGroupUrlsUseCase'
import type { ReorderTabGroupUrlsUseCaseDeps } from './ReorderTabGroupUrlsUseCase'

const createUrlRecord = (overrides: Partial<UrlRecord>): UrlRecord => ({
  favIconUrl: undefined,
  id: 'url-1' as never,
  savedAt: 1 as never,
  title: 'Title',
  url: 'https://example.com' as never,
  ...overrides,
})

const createDomainTabGroup = (
  overrides: Partial<DomainTabGroup>,
): DomainTabGroup => ({
  domain: 'example.com' as never,
  id: 'group-1' as never,
  urlIds: [],
  ...overrides,
})

const createInMemoryUrlRecordRepository = (
  records: readonly UrlRecord[],
): UrlRecordRepository => {
  let stored = [...records]
  return {
    findAll: async () => stored,

    findById: async (id) => stored.find((record) => record.id === id) ?? null,

    saveAll: async (next) => {
      stored = [...next]
    },

    removeByIds: async () => undefined,
  }
}

const createInMemoryTabGroupRepository = (
  groups: readonly DomainTabGroup[],
): TabGroupRepository & {
  saveAllCalls: readonly DomainTabGroup[][]
} => {
  let stored = [...groups]
  const saveAllCalls: DomainTabGroup[][] = []
  const repo: TabGroupRepository & {
    saveAllCalls: readonly DomainTabGroup[][]
  } = {
    findAll: async () => stored,

    findById: async (id) => stored.find((group) => group.id === id) ?? null,

    findRawDomainById: async () => null,

    findRawTabGroupById: async () => null,

    saveAll: async (next) => {
      stored = [...next]
      saveAllCalls.push([...next])
    },

    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      stored = stored.filter((group) => !idSet.has(group.id))
    },
    saveAllCalls,
  }
  return repo
}

describe('ReorderTabGroupUrlsUseCase', () => {
  let deps: ReorderTabGroupUrlsUseCaseDeps

  beforeEach(() => {
    deps = {
      urlRecordRepository: createInMemoryUrlRecordRepository([
        createUrlRecord({
          id: 'url-1' as never,
          url: 'https://a.example.com' as never,
        }),
        createUrlRecord({
          id: 'url-2' as never,
          url: 'https://b.example.com' as never,
        }),
        createUrlRecord({
          id: 'url-3' as never,
          url: 'https://c.example.com' as never,
        }),
      ]),
      tabGroupRepository: createInMemoryTabGroupRepository([
        createDomainTabGroup({
          id: 'group-1' as never,
          urlIds: ['url-1' as never, 'url-2' as never, 'url-3' as never],
        }),
        createDomainTabGroup({
          domain: 'other.com' as never,
          id: 'group-2' as never,
          urlIds: ['url-1' as never],
        }),
      ]),
    }
  })

  it('指定した URL 順に urlIds を並び替える', async () => {
    const useCase = createReorderTabGroupUrlsUseCase(deps)
    await useCase({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: 'group-1' as never,
      newUrlOrder: ['https://c.example.com', 'https://a.example.com'],
    })
    const updated = await deps.tabGroupRepository.findAll()
    const target = updated.find((group) => group.id === ('group-1' as never))
    expect(target?.urlIds).toStrictEqual(['url-3', 'url-1', 'url-2'])
  })

  it('newUrlOrder に含まれない urlId は末尾に残る', async () => {
    const useCase = createReorderTabGroupUrlsUseCase(deps)
    await useCase({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: 'group-1' as never,
      newUrlOrder: ['https://c.example.com'],
    })
    const updated = await deps.tabGroupRepository.findAll()
    const target = updated.find((group) => group.id === ('group-1' as never))
    expect(target?.urlIds).toStrictEqual(['url-3', 'url-1', 'url-2'])
  })

  it('newUrlOrder に存在しない URL は無視される', async () => {
    const useCase = createReorderTabGroupUrlsUseCase(deps)
    await useCase({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: 'group-1' as never,
      newUrlOrder: ['https://c.example.com', 'https://unknown.example.com'],
    })
    const updated = await deps.tabGroupRepository.findAll()
    const target = updated.find((group) => group.id === ('group-1' as never))
    expect(target?.urlIds).toStrictEqual(['url-3', 'url-1', 'url-2'])
  })

  it('存在しない tabGroupId の場合は SavedTabsDomainError を投げる', async () => {
    const useCase = createReorderTabGroupUrlsUseCase(deps)
    await expect(
      useCase({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        tabGroupId: 'missing' as never,
        newUrlOrder: ['https://a.example.com'],
      }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })

  it('newUrlOrder が空なら urlIds はそのまま', async () => {
    const useCase = createReorderTabGroupUrlsUseCase(deps)
    await useCase({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: 'group-1' as never,
      newUrlOrder: [],
    })
    const updated = await deps.tabGroupRepository.findAll()
    const target = updated.find((group) => group.id === ('group-1' as never))
    expect(target?.urlIds).toStrictEqual(['url-1', 'url-2', 'url-3'])
  })

  it('他の TabGroup は変更されない', async () => {
    const useCase = createReorderTabGroupUrlsUseCase(deps)
    await useCase({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: 'group-1' as never,
      newUrlOrder: ['https://c.example.com'],
    })
    const updated = await deps.tabGroupRepository.findAll()
    const other = updated.find((group) => group.id === ('group-2' as never))
    expect(other?.urlIds).toStrictEqual(['url-1'])
  })
})
