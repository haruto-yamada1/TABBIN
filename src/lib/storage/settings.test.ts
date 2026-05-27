import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getChromeStorageLocal: vi.fn(),
  normalizeAiSystemPromptSettings: vi.fn((settings: object) => ({
    ...settings,
    normalized: true,
  })),
  warnMissingChromeStorage: vi.fn(),
}))

vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageLocal: mocks.getChromeStorageLocal,
  warnMissingChromeStorage: mocks.warnMissingChromeStorage,
}))

vi.mock('@/features/ai-chat/lib/systemPromptPresets', () => ({
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID: 'default-id',
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE: 'default template',
  normalizeAiSystemPromptSettings: mocks.normalizeAiSystemPromptSettings,
}))

const loadModule = async () => {
  vi.resetModules()
  return import('./settings')
}

describe('settings storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chrome.storage が無い場合はデフォルト設定を返す', async () => {
    mocks.getChromeStorageLocal.mockReturnValue(null)

    const { defaultSettings, getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toEqual(defaultSettings)
    expect(defaultSettings.fontSizePercent).toBe(100)
    expect(defaultSettings.language).toBe('system')
    expect(mocks.warnMissingChromeStorage).toHaveBeenCalledWith('設定読み込み')
  })

  it('保存済み設定があればデフォルトとマージして返す', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          aiChatEnabled: true,
          aiProvider: 'ollama',
          excludePinnedTabs: false,
          fontSizePercent: 125,
          language: 'en',
        },
      })),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toMatchObject({
      excludePinnedTabs: false,
      fontSizePercent: 125,
      language: 'en',
      normalized: true,
    })
    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.not.objectContaining({
        aiChatEnabled: true,
        aiProvider: 'ollama',
      }),
    })
  })

  it('保存済み設定がない場合は正規化したデフォルト設定を返す', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { defaultSettings, getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toEqual({
      ...defaultSettings,
      normalized: true,
    })
    expect(storageLocal.set).not.toHaveBeenCalled()
  })

  it('設定取得エラー時はデフォルトへフォールバックする', async () => {
    const storageLocal = {
      get: vi.fn(async () => {
        throw new Error('read failed')
      }),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)
    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { defaultSettings, getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toEqual({
      ...defaultSettings,
      normalized: true,
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('設定保存時に正規化した値を書き込む', async () => {
    const storageLocal = {
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { defaultSettings, saveUserSettings } = await loadModule()

    await saveUserSettings(defaultSettings)

    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: {
        ...defaultSettings,
        normalized: true,
      },
    })
  })

  it('保存先が無い場合は警告して終了し、保存失敗時は再送出する', async () => {
    mocks.getChromeStorageLocal.mockReturnValueOnce(null)

    const { defaultSettings, saveUserSettings } = await loadModule()

    await expect(saveUserSettings(defaultSettings)).resolves.toBeUndefined()
    expect(mocks.warnMissingChromeStorage).toHaveBeenCalledWith('設定保存')

    const storageLocal = {
      set: vi.fn(async () => {
        throw new Error('write failed')
      }),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)
    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(saveUserSettings(defaultSettings)).rejects.toThrow(
      'write failed',
    )
    expect(errorSpy).toHaveBeenCalled()
  })
})
