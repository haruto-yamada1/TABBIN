import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChromeDomainCategoryMappingRepository } from './ChromeDomainCategoryMappingRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import { DOMAIN_CATEGORY_MAPPINGS_KEY } from './savedTabsStorageKeys'

const createPort = (value: unknown): ChromeStorageLocalPort => ({
  get: vi.fn(async (key) => ({ [key]: value })),
  remove: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
})

describe('ChromeDomainCategoryMappingRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('有効な mapping だけを読み出す', async () => {
    const port = createPort([
      { categoryId: 'category-1', domain: 'example.com' },
      { categoryId: 42, domain: 'invalid.example' },
      null,
    ])
    const repository = createChromeDomainCategoryMappingRepository(port)

    await expect(repository.findAll()).resolves.toStrictEqual([
      { categoryId: 'category-1', domain: 'example.com' },
    ])
    expect(port.get).toHaveBeenCalledWith(DOMAIN_CATEGORY_MAPPINGS_KEY)
  })

  it('配列でない保存値は空配列として扱う', async () => {
    const repository = createChromeDomainCategoryMappingRepository(
      createPort({ invalid: true }),
    )

    await expect(repository.findAll()).resolves.toStrictEqual([])
  })

  it('mapping DTO を storage 形式で保存する', async () => {
    const port = createPort([])
    const repository = createChromeDomainCategoryMappingRepository(port)

    await repository.saveAll([
      { categoryId: 'category-1', domain: 'example.com' },
    ])

    expect(port.set).toHaveBeenCalledWith({
      [DOMAIN_CATEGORY_MAPPINGS_KEY]: [
        { categoryId: 'category-1', domain: 'example.com' },
      ],
    })
  })

  it('null port では利用不能エラーを投げる', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => createChromeDomainCategoryMappingRepository(null)).toThrow(
      SavedTabsRepositoryUnavailableError,
    )
  })

  it('注入 port に read/write を委譲する', async () => {
    const local = createPort([
      { categoryId: 'category-1', domain: 'example.com' },
    ])
    vi.stubGlobal('chrome', { storage: { local } })
    const repository = createChromeDomainCategoryMappingRepository(local)

    await expect(repository.findAll()).resolves.toHaveLength(1)
    await repository.saveAll([])

    expect(local.get).toHaveBeenCalledWith(DOMAIN_CATEGORY_MAPPINGS_KEY)
    expect(local.set).toHaveBeenCalledWith({
      [DOMAIN_CATEGORY_MAPPINGS_KEY]: [],
    })
  })
})
