import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'

import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import { createChromeUserSettingsRepository } from './ChromeUserSettingsRepository'
import { USER_SETTINGS_KEY } from './savedTabsStorageKeys'

const createPort = (value: unknown) => ({
  get: vi.fn(async (key: string) => ({ [key]: value })),
  set: vi.fn(async () => undefined),
})

describe('ChromeUserSettingsRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('保存値を正規化し、legacy keys を返さない', async () => {
    const port = createPort({
      aiChatEnabled: true,
      aiProvider: 'legacy',
      language: 'en',
    })
    const repository = createChromeUserSettingsRepository(port)

    const result = await repository.findAll()

    expect(result.language).toBe('en')
    expect(result).not.toHaveProperty('aiChatEnabled')
    expect(result).not.toHaveProperty('aiProvider')
    expect(port.get).toHaveBeenCalledWith(USER_SETTINGS_KEY)
  })

  it('設定を正規化して USER_SETTINGS_KEY へ保存する', async () => {
    const port = createPort(undefined)
    const repository = createChromeUserSettingsRepository(port)

    await repository.save({
      ...defaultUserSettings,
      excludePatterns: [' example.com '],
    })

    expect(port.set).toHaveBeenCalledWith({
      [USER_SETTINGS_KEY]: expect.objectContaining({
        excludePatterns: [
          'about:',
          'chrome-extension://',
          'chrome://',
          'example.com',
        ],
      }),
    })
  })

  it('null port では利用不能エラーを投げる', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => createChromeUserSettingsRepository(null)).toThrow(
      SavedTabsRepositoryUnavailableError,
    )
  })

  it('既定 port は chrome.storage.local に委譲する', async () => {
    const local = createPort({ language: 'ja' })
    vi.stubGlobal('chrome', { storage: { local } })
    const repository = createChromeUserSettingsRepository()

    await expect(repository.findAll()).resolves.toMatchObject({
      language: 'ja',
    })
    await repository.save(defaultUserSettings)

    expect(local.get).toHaveBeenCalledWith(USER_SETTINGS_KEY)
    expect(local.set).toHaveBeenCalled()
  })
})
