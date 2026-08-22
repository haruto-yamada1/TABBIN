import { beforeEach, describe, expect, it } from 'vitest' // eslint-disable-line

import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

import { createFindUrlRecordByUrlUseCase } from './FindUrlRecordByUrlUseCase'
import type { FindUrlRecordByUrlUseCaseDeps } from './FindUrlRecordByUrlUseCase'

const createUrlRecord = (overrides: Partial<UrlRecord>): UrlRecord => ({
  id: 'url-1' as never,
  savedAt: 1 as never,
  title: 'Title',
  url: 'https://example.com' as never,
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

describe('FindUrlRecordByUrlUseCase', () => {
  let deps: FindUrlRecordByUrlUseCaseDeps

  beforeEach(() => {
    deps = {
      urlRecordRepository: createInMemoryUrlRecordRepository([
        createUrlRecord({
          id: 'url-1' as never,
          title: 'Example',
          url: 'https://example.com' as never,
        }),
        createUrlRecord({
          id: 'url-2' as never,
          title: 'Docs',
          url: 'https://docs.example.com' as never,
        }),
      ]),
    }
  })

  it('URL に一致する UrlRecord が見つかれば record を返す', async () => {
    const useCase = createFindUrlRecordByUrlUseCase(deps)
    const result = await useCase({ url: 'https://docs.example.com' })
    expect(result.record).toStrictEqual({
      id: 'url-2',
      title: 'Docs',
      url: 'https://docs.example.com',
    })
  })

  it('URL に一致する UrlRecord が見つからなければ null を返す', async () => {
    const useCase = createFindUrlRecordByUrlUseCase(deps)
    const result = await useCase({ url: 'https://missing.example.com' })
    expect(result.record).toBeNull()
  })
})
