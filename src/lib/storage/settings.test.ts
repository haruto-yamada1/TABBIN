import { assert, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

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
  it('今開いているタブは初期ONで、明示OFFも保存して再読み込みできる', async () => {
    const { defaultSettings, getUserSettings, saveUserSettings } =
      await loadModule()
    let storedValue: unknown = {}
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({ userSettings: storedValue })),
      set: vi.fn(async ({ userSettings }: { userSettings: unknown }) => {
        storedValue = userSettings
      }),
    })
    expect(defaultSettings).toHaveProperty('showOpenTabs', true)
    await expect(getUserSettings()).resolves.toMatchObject({
      showOpenTabs: true,
    })
    const verifySavedSetting = async (showOpenTabs: boolean) => {
      await saveUserSettings({ ...defaultSettings, showOpenTabs })
      await expect(getUserSettings()).resolves.toMatchObject({ showOpenTabs })
    }
    await verifySavedSetting(true)
    await verifySavedSetting(false)
    storedValue = { showOpenTabs: 'true' }
    await expect(getUserSettings()).resolves.toMatchObject({
      showOpenTabs: true,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('相対保存日時は未設定で無効になり、親設定と独立して保存・再読み込みできる', async () => {
    const { defaultSettings, getUserSettings, saveUserSettings } =
      await loadModule()
    let storedValue: unknown = { showSavedTime: true }
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({ userSettings: storedValue })),
      set: vi.fn(async ({ userSettings }: { userSettings: unknown }) => {
        storedValue = userSettings
      }),
    })

    await expect(getUserSettings()).resolves.toMatchObject({
      showRelativeSavedTime: false,
      showSavedTime: true,
    })
    await saveUserSettings({
      ...defaultSettings,
      showRelativeSavedTime: true,
      showSavedTime: false,
    })
    await expect(getUserSettings()).resolves.toMatchObject({
      showRelativeSavedTime: true,
      showSavedTime: false,
    })
  })

  it.each(['http://localhost:11434', 'http://127.0.0.1:11434'])(
    'Ollama 接続先 %s を保存して再読み込みできる',
    async (ollamaBaseUrl) => {
      const { defaultSettings, getUserSettings, saveUserSettings } =
        await loadModule()
      let storedValue: unknown
      const storageLocal = {
        get: vi.fn(async () => ({ userSettings: storedValue })),
        set: vi.fn(async ({ userSettings }: { userSettings: unknown }) => {
          storedValue = userSettings
        }),
      }
      mocks.getChromeStorageLocal.mockReturnValue(storageLocal)
      const settings = { ...defaultSettings }
      Reflect.set(settings, 'ollamaBaseUrl', ollamaBaseUrl)

      await saveUserSettings(settings)

      await expect(getUserSettings()).resolves.toMatchObject({ ollamaBaseUrl })
    },
  )

  it.each([
    'https://example.com',
    'http://localhost:11435',
    'http://localhost:11434/api',
    'http://user:password@localhost:11434',
    'http://localhost:11434/',
    null,
    123,
  ])('許可外の Ollama 接続先 %s は保存しない', async (value) => {
    const storageLocal = { set: vi.fn(async () => undefined) }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)
    const { defaultSettings, saveUserSettings } = await loadModule()
    const settings = { ...defaultSettings }
    Reflect.set(settings, 'ollamaBaseUrl', value)
    using _errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(saveUserSettings(settings)).rejects.toThrow(/Invalid option/u)
    expect(storageLocal.set).not.toHaveBeenCalled()
  })

  it.each([undefined, 'https://example.com'])(
    '未設定または不正な保存済み接続先 %s は localhost に戻す',
    async (ollamaBaseUrl) => {
      mocks.getChromeStorageLocal.mockReturnValue({
        get: vi.fn(async () => ({
          userSettings: { ollamaBaseUrl, language: 'en' },
        })),
        set: vi.fn(async () => undefined),
      })
      const { getUserSettings } = await loadModule()

      await expect(getUserSettings()).resolves.toMatchObject({
        language: 'en',
        ollamaBaseUrl: 'http://localhost:11434',
      })
    },
  )

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
    expect(storageLocal.set).not.toHaveBeenCalled()
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

  it('read-only backup export 用の読み込みでは設定を正規化しても再保存しない', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          aiChatEnabled: true,
          aiProvider: 'ollama',
          excludePatterns: ['custom-pattern'],
          language: 'en',
        },
      })),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    const settings = await getUserSettings({ repairStoredSettings: false })

    expect(settings).toMatchObject({
      excludePatterns: expect.arrayContaining([
        'about:',
        'chrome-extension://',
        'chrome://',
        'custom-pattern',
      ]),
      language: 'en',
      normalized: true,
    })
    expect(storageLocal.set).not.toHaveBeenCalled()
  })

  it('保存時も excludePatterns に既定の内部ページ除外を補完する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({})),
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
      showRelativeSavedTime: false,
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
      get: vi.fn(async () => ({})),
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

  it('保存先が無い場合は拒否し、保存失敗時は再送出する', async () => {
    mocks.getChromeStorageLocal.mockReturnValueOnce(null)

    const { defaultSettings, saveUserSettings } = await loadModule()

    await expect(saveUserSettings(defaultSettings)).rejects.toThrow(
      'Settings could not be verified',
    )

    const storageLocal = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {
        throw new Error('write failed')
      }),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)
    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(saveUserSettings(defaultSettings)).rejects.toThrow(
      'write failed',
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('clickBehavior が enum 外れなら default に fallback する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          clickBehavior: 'invalid-behavior',
          language: 'system',
        },
      })),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    const settings = await getUserSettings()
    expect(settings.clickBehavior).toBe('saveSameDomainTabs')
  })

  it('autoDeletePeriod が enum 外れなら default に fallback する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          autoDeletePeriod: 'invalid-period',
        },
      })),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    const settings = await getUserSettings()
    expect(settings.autoDeletePeriod).toBe('never')
  })

  it('boolean field が型不正なら default に fallback する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          excludePinnedTabs: 'not-boolean',
          openUrlInBackground: 1,
        },
      })),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    const settings = await getUserSettings()
    expect(settings.excludePinnedTabs).toBe(true)
    expect(settings.openUrlInBackground).toBe(true)
  })

  it('aiSystemPrompts は無効要素だけ除外し、有効な preset を保持する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({
        userSettings: {
          aiSystemPrompts: [
            {
              id: 'valid',
              name: 'Valid',
              template: 't',
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: '',
              name: 'Empty',
              template: 't',
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        },
      })),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { getUserSettings } = await loadModule()

    const settings = await getUserSettings()
    expect(settings.aiSystemPrompts).toHaveLength(1)
    assert.isDefined(settings.aiSystemPrompts?.[0])
    expect(settings.aiSystemPrompts?.[0].id).toBe('valid')
  })

  it('saveUserSettings は未正規化の clickBehavior を default に正規化して保存する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { defaultSettings, saveUserSettings } = await loadModule()

    await saveUserSettings({
      ...defaultSettings,
      clickBehavior: 'invalid-behavior' as never,
    })

    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        clickBehavior: 'saveSameDomainTabs',
      }),
    })
  })

  it('saveUserSettings は未正規化の autoDeletePeriod を default に正規化して保存する', async () => {
    const storageLocal = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    }
    mocks.getChromeStorageLocal.mockReturnValue(storageLocal)

    const { defaultSettings, saveUserSettings } = await loadModule()

    await saveUserSettings({
      ...defaultSettings,
      autoDeletePeriod: 'invalid-period' as never,
    })

    expect(storageLocal.set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        autoDeletePeriod: 'never',
      }),
    })
  })
})

describe('settings read safety regressions', () => {
  it('repair失敗でも読み取れた明示的な削除OFFを維持する', async () => {
    using _errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getUserSettings } = await loadModule()
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({
        userSettings: { aiProvider: 'legacy', removeTabAfterOpen: false },
      })),
      set: vi.fn(async () => {
        throw new Error('repair failed')
      }),
    })
    await expect(getUserSettings()).resolves.toMatchObject({
      removeTabAfterOpen: false,
    })
  })

  it('不正設定の表示fallbackは保存値を修復・上書きしない', async () => {
    const { getUserSettings } = await loadModule()
    const set = vi.fn()
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({
        userSettings: { removeTabAfterOpen: 'false' },
      })),
      set,
    })
    await getUserSettings()
    expect(set).not.toHaveBeenCalled()
  })

  it('読込障害中には設定を書き込まず安全なエラーを返す', async () => {
    const { defaultSettings, saveUserSettings } = await loadModule()
    const set = vi.fn()
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => {
        throw new Error('private prompt')
      }),
      set,
    })
    await expect(saveUserSettings(defaultSettings)).rejects.toThrow(
      'Settings could not be verified',
    )
    expect(set).not.toHaveBeenCalled()
  })
})

describe('strict settings states and recovery', () => {
  it('未保存はmissingとして正規のデフォルトを使い、書き戻さない', async () => {
    const { defaultSettings, readUserSettingsStrict, requireUserSettings } =
      await loadModule()
    const set = vi.fn()
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({})),
      set,
    })
    await expect(readUserSettingsStrict()).resolves.toMatchObject({
      status: 'missing',
      settings: defaultSettings,
    })
    await expect(requireUserSettings()).resolves.toMatchObject(defaultSettings)
    expect(set).not.toHaveBeenCalled()
  })

  it('API不在とget rejectはunavailableで例外内容を公開しない', async () => {
    const { readUserSettingsStrict, requireUserSettings } = await loadModule()
    mocks.getChromeStorageLocal.mockReturnValue(null)
    await expect(readUserSettingsStrict()).resolves.toEqual({
      status: 'unavailable',
    })
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => {
        throw new Error('secret prompt')
      }),
    })
    await expect(readUserSettingsStrict()).resolves.toEqual({
      status: 'unavailable',
    })
    await expect(requireUserSettings()).rejects.toThrow(
      'Settings could not be verified',
    )
  })

  it.each([
    null,
    [],
    'private prompt',
    { removeTabAfterOpen: 'false' },
    { excludePatterns: ['private', 123] },
    { autoDeletePeriod: 'invalid' },
    { aiSystemPrompts: [{ template: 'private' }] },
  ])('不正値%jはinvalidでrepairもしない', async (userSettings) => {
    const {
      readUserSettingsStrict,
      requireUserSettings,
      defaultSettings,
      saveUserSettings,
    } = await loadModule()
    const set = vi.fn()
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({ userSettings })),
      set,
    })
    await expect(readUserSettingsStrict()).resolves.toEqual({
      status: 'invalid',
    })
    await expect(requireUserSettings()).rejects.toMatchObject({
      status: 'invalid',
    })
    await expect(saveUserSettings(defaultSettings)).rejects.toMatchObject({
      status: 'invalid',
    })
    expect(set).not.toHaveBeenCalled()
  })

  it('旧形式の省略fieldとlegacy keyを移行し、strict readではrepair失敗の影響を受けない', async () => {
    const { readUserSettingsStrict } = await loadModule()
    const set = vi.fn(async () => {
      throw new Error('repair failed')
    })
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({
        userSettings: {
          aiProvider: 'old',
          removeTabAfterOpen: false,
          excludePatterns: [' custom '],
        },
      })),
      set,
    })
    await expect(readUserSettingsStrict()).resolves.toMatchObject({
      status: 'available',
      settings: {
        removeTabAfterOpen: false,
        excludePatterns: expect.arrayContaining(['custom', 'about:']),
      },
    })
    expect(set).not.toHaveBeenCalled()
  })

  it('不正値の明示的リセットだけがデフォルトを保存し、読込不能ならリセットしない', async () => {
    const { resetInvalidUserSettings } = await loadModule()
    const set = vi.fn()
    const get = vi.fn(async (): Promise<Record<string, unknown>> => ({
      userSettings: null,
    }))
    mocks.getChromeStorageLocal.mockReturnValue({ get, set })
    await resetInvalidUserSettings()
    expect(set).toHaveBeenCalledOnce()
    set.mockClear()
    get.mockResolvedValue({})
    await resetInvalidUserSettings()
    expect(set).not.toHaveBeenCalled()
    get.mockRejectedValue(new Error('unavailable'))
    await expect(resetInvalidUserSettings()).rejects.toMatchObject({
      status: 'unavailable',
    })
    expect(set).not.toHaveBeenCalled()
  })
})
