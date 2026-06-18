import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

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

    await expect(getUserSettings()).resolves.toStrictEqual(defaultSettings)
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

  it('保存済みの excludePatterns に既定の内部ページ除外を補完し、既存の手動追加は保持する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          excludePatterns: ['custom-pattern', 'chrome://'],
        },
      })),

      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toMatchObject({
      excludePatterns: expect.arrayContaining([
        'about:',
        'chrome-extension://',
        'chrome://',
        'custom-pattern',
      ]),
      normalized: true,
    })
    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        excludePatterns: expect.arrayContaining([
          'about:',
          'custom-pattern',
          'chrome://',
        ]),
      }),
    })
  })

  it('保存済みの excludePatterns から空白と非文字列を除外する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          excludePatterns: [' custom-pattern ', '   ', 123, null],
        },
      })),

      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toMatchObject({
      excludePatterns: expect.arrayContaining([
        'about:',
        'chrome-extension://',
        'chrome://',
        'custom-pattern',
      ]),
      normalized: true,
    })
    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        excludePatterns: expect.not.arrayContaining(['   ', 123, null]),
      }),
    })
  })

  it('保存済み設定に excludePatterns が無い場合は既定値を補完して保存する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          language: 'system',
        },
      })),

      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toMatchObject({
      excludePatterns: ['about:', 'chrome-extension://', 'chrome://'],
      language: 'system',
      normalized: true,
    })
    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        excludePatterns: ['about:', 'chrome-extension://', 'chrome://'],
      }),
    })
  })

  it('保存済み設定が既に正規化済みなら再保存しない', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          excludePatterns: ['about:', 'chrome-extension://', 'chrome://'],
          language: 'system',
        },
      })),

      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    await expect(getUserSettings()).resolves.toMatchObject({
      excludePatterns: ['about:', 'chrome-extension://', 'chrome://'],
      language: 'system',
      normalized: true,
    })
    expect(storageLocal.set).not.toHaveBeenCalled()
  })

  it('保存時も excludePatterns に既定の内部ページ除外を補完する', async () => {
    const storageLocal = {
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { saveUserSettings } = await loadModule()

    await saveUserSettings({
      activeAiSystemPromptId: 'default-id',
      aiSystemPrompts: [],
      autoDeletePeriod: 'never',
      clickBehavior: 'saveSameDomainTabs',
      colors: {},
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: ['custom-pattern'],
      excludePinnedTabs: true,
      fontSizePercent: 100,
      language: 'system',
      ollamaModel: '',
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: true,
      removeTabAfterOpen: true,
      showSavedTime: false,
    })

    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        excludePatterns: expect.arrayContaining([
          'about:',
          'custom-pattern',
          'chrome://',
        ]),
        normalized: true,
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

    await expect(getUserSettings()).resolves.toStrictEqual({
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

    await expect(getUserSettings()).resolves.toStrictEqual({
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
