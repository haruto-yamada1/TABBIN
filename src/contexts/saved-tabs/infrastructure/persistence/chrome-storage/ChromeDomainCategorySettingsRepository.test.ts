import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChromeDomainCategorySettingsRepository } from './ChromeDomainCategorySettingsRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import { DOMAIN_CATEGORY_SETTINGS_KEY } from './savedTabsStorageKeys'

const createPort = (value: unknown): ChromeStorageLocalPort => ({
  get: vi.fn(async (key) => ({ [key]: value })),
  remove: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
})

const settings = {
  categoryKeywords: [
    { categoryName: 'Docs', keywords: ['guide', 'reference'] },
  ],
  domain: 'example.com',
  subCategories: ['Docs'],
}

describe('ChromeDomainCategorySettingsRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('有効な settings だけを deep copy して読み出す', async () => {
    const stored = [settings, { domain: 'invalid.example' }, null]
    const port = createPort(stored)
    const repository = createChromeDomainCategorySettingsRepository(port)

    const result = await repository.findAll()

    expect(result).toStrictEqual([settings])
    expect(result[0]).not.toBe(settings)
    expect(result[0]?.subCategories).not.toBe(settings.subCategories)
    expect(result[0]?.categoryKeywords[0]).not.toBe(
      settings.categoryKeywords[0],
    )
    expect(result[0]?.categoryKeywords[0]?.keywords).not.toBe(
      settings.categoryKeywords[0]?.keywords,
    )
    expect(port.get).toHaveBeenCalledWith(DOMAIN_CATEGORY_SETTINGS_KEY)
  })

  it('配列でない保存値は空配列として扱う', async () => {
    const repository = createChromeDomainCategorySettingsRepository(
      createPort('invalid'),
    )

    await expect(repository.findAll()).resolves.toStrictEqual([])
  })

  it('settings DTO を storage 形式で保存する', async () => {
    const port = createPort([])
    const repository = createChromeDomainCategorySettingsRepository(port)

    await repository.saveAll([settings])

    expect(port.set).toHaveBeenCalledWith({
      [DOMAIN_CATEGORY_SETTINGS_KEY]: [settings],
    })
  })

  it('null port では利用不能エラーを投げる', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => createChromeDomainCategorySettingsRepository(null)).toThrow(
      SavedTabsRepositoryUnavailableError,
    )
  })

  it('既定 port は chrome.storage.local に委譲する', async () => {
    const local = createPort([settings])
    vi.stubGlobal('chrome', { storage: { local } })
    const repository = createChromeDomainCategorySettingsRepository()

    await expect(repository.findAll()).resolves.toHaveLength(1)
    await repository.saveAll([])

    expect(local.get).toHaveBeenCalledWith(DOMAIN_CATEGORY_SETTINGS_KEY)
    expect(local.set).toHaveBeenCalledWith({
      [DOMAIN_CATEGORY_SETTINGS_KEY]: [],
    })
  })
})
