import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserSettingsReadError } from '@/lib/storage/settings'
import type { UserSettings } from '@/types/storage'

vi.mock('wxt/browser', () => ({
  get browser() {
    return globalThis.chrome
  },
}))

const mocked = vi.hoisted(() => ({
  saveTabs: vi.fn(),
  removeUrl: vi.fn(),
  removeExpiredUrls: vi.fn(),
  updateTabTimestamps: vi.fn(),
  showNotification: vi.fn(),
  openSavedTabsPage: vi.fn(),
}))

vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    saveTabs: mocked.saveTabs,
    removeUrl: mocked.removeUrl,
    removeExpiredUrls: mocked.removeExpiredUrls,
    updateTabTimestamps: mocked.updateTabTimestamps,
  }),
}))
vi.mock('./notification', () => ({
  showNotification: mocked.showNotification,
}))
vi.mock('./saved-tabs-page', () => ({
  openSavedTabsPage: mocked.openSavedTabsPage,
}))

import { TabFilteringError } from './capture-plan'
import { checkAndRemoveExpiredTabs, updateTabTimestamps } from './expired-tabs'
import {
  handleExtensionActionClick,
  handleSaveAllWindowsTabs,
  handleSaveCurrentTab,
  handleSaveSameDomainTabs,
  handleSaveWindowTabs,
} from './extension-actions'
import {
  clearDraggedUrlInfo,
  handleUrlDragStarted,
  handleUrlDropped,
} from './url-storage'

const sourceUrl = 'https://example.test/article'
const source = {
  id: 12,
  url: sourceUrl,
  title: 'Article',
  pinned: false,
  active: true,
} as chrome.tabs.Tab

const mutations = [
  mocked.saveTabs,
  mocked.removeUrl,
  mocked.removeExpiredUrls,
  mocked.updateTabTimestamps,
]

const failures = ['missing API', 'get rejection', 'invalid settings'] as const

const directCaptures = [
  ['saveCurrentTab', handleSaveCurrentTab],
  ['saveWindowTabs', handleSaveWindowTabs],
  ['saveSameDomainTabs', handleSaveSameDomainTabs],
  ['saveAllWindowsTabs', handleSaveAllWindowsTabs],
] as const

const captureEntries = directCaptures.flatMap(([behavior, capture]) => [
  { name: `direct ${behavior}`, behavior, capture, direct: true },
  {
    name: `toolbar ${behavior}`,
    behavior,
    capture: handleExtensionActionClick,
    direct: false,
  },
])

const localizedFailureFeedback = {
  en: {
    settingsTitle: 'Settings could not be verified',
    settingsRecovery: 'Reload or recover your settings in Options',
    filterTitle: 'Tabs were not saved',
    filterRecovery: 'No tabs were saved or closed',
  },
  ja: {
    settingsTitle: '設定を確認できません',
    settingsRecovery: '設定画面で設定を再読み込み・復旧してから再試行',
    filterTitle: 'タブを保存できませんでした',
    filterRecovery: 'タブの保存やクローズは行っていません',
  },
} as const

describe('settings safety at background operation boundaries', () => {
  let get: ReturnType<typeof vi.fn>
  let set: ReturnType<typeof vi.fn>
  let remove: ReturnType<typeof vi.fn>
  let query: ReturnType<typeof vi.fn>
  let getAllWindows: ReturnType<typeof vi.fn>
  let liveTabs: chrome.tabs.Tab[]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    get = vi.fn(async () => ({}))
    set = vi.fn(async () => undefined)
    remove = vi.fn(async () => undefined)
    query = vi.fn(async () => [source])
    getAllWindows = vi.fn(async () => [{ tabs: [source] }])
    liveTabs = [source]
    vi.stubGlobal('browser', undefined)
    vi.stubGlobal('chrome', {
      storage: { local: { get, set } },
      tabs: {
        query,
        get: async (id: number) => {
          const tab = liveTabs.find((candidate) => candidate.id === id)
          if (!tab) {
            throw new Error('Tab not found')
          }
          return tab
        },
        remove,
      },
      windows: {
        getAll: getAllWindows,
      },
      i18n: { getUILanguage: () => 'en' },
    })
    mocked.saveTabs.mockImplementation(async (tabs: { url: string }[]) => ({
      savedUrls: tabs.map(({ url }) => url),
    }))
    mocked.removeExpiredUrls.mockResolvedValue({
      sourceCount: 0,
      removedCount: 0,
    })
    mocked.updateTabTimestamps.mockResolvedValue({ success: true })
    mocked.openSavedTabsPage.mockResolvedValue(999)
    clearDraggedUrlInfo()
  })

  afterEach(() => {
    clearDraggedUrlInfo()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const failSettings = (failure: (typeof failures)[number]) => {
    if (failure === 'missing API') {
      Reflect.deleteProperty(chrome, 'storage')
    } else if (failure === 'get rejection') {
      get.mockRejectedValue(new Error('private storage payload'))
    } else {
      get.mockResolvedValue({ userSettings: { removeTabAfterOpen: 'broken' } })
    }
  }

  const setCaptureTabs = (tabs: chrome.tabs.Tab[]) => {
    liveTabs = tabs
    query.mockResolvedValue(tabs)
    getAllWindows.mockResolvedValue([{ tabs }])
  }

  const configureCapture = (
    behavior: UserSettings['clickBehavior'],
    settings: Partial<UserSettings> = {},
  ) => {
    get.mockResolvedValue({
      userSettings: { clickBehavior: behavior, ...settings },
    })
  }

  const expectNoCaptureEffects = () => {
    expect(mocked.saveTabs).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
  }

  const expectCaptureFailure = async (
    capture: () => Promise<unknown>,
    direct: boolean,
    error: Readonly<Record<string, string>>,
  ) => {
    const [outcome] = await Promise.allSettled([capture()])
    expect(outcome).toMatchObject(
      direct
        ? { status: 'rejected', reason: error }
        : { status: 'fulfilled', value: undefined },
    )
  }

  it.each(['filter', 'persistence'] as const)(
    '%s failure feedback does not repair a legacy policy',
    async (failure) => {
      get.mockResolvedValue({
        userSettings: { language: 'en', excludePatterns: ['legacy.example'] },
      })
      if (failure === 'filter') {
        setCaptureTabs([
          {
            ...source,
            get pinned(): boolean {
              throw new Error('filter fault')
            },
          },
        ])
      } else {
        mocked.saveTabs.mockRejectedValueOnce(new Error('persistence fault'))
      }
      await expect(handleSaveCurrentTab()).rejects.toBeInstanceOf(Error)
      expect(set).not.toHaveBeenCalled()
      expect(remove).not.toHaveBeenCalled()
      expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
    },
  )

  describe.each(['en', 'ja'] as const)(
    '%s capture failure feedback',
    (language) => {
      it.each(captureEntries)(
        '$name: invalid stored exclusions reject the operation without repair',
        async ({ behavior, capture, direct }) => {
          vi.spyOn(chrome.i18n, 'getUILanguage').mockReturnValue(language)
          get.mockResolvedValue({
            userSettings: {
              clickBehavior: behavior,
              language,
              excludePatterns: ['private exclusion', 42],
            },
          })

          await expectCaptureFailure(capture, direct, {
            name: UserSettingsReadError.name,
            status: 'invalid',
          })

          expectNoCaptureEffects()
          expect(set).not.toHaveBeenCalled()
          expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
            localizedFailureFeedback[language].settingsTitle,
            expect.stringContaining(
              localizedFailureFeedback[language].settingsRecovery,
            ),
          )
          expect(
            JSON.stringify(mocked.showNotification.mock.calls),
          ).not.toContain('private exclusion')
        },
      )

      it.each(captureEntries)(
        '$name: unavailable settings stay observable and preserve source tabs',
        async ({ capture, direct }) => {
          vi.spyOn(chrome.i18n, 'getUILanguage').mockReturnValue(language)
          get.mockRejectedValue(new Error('private storage payload'))

          await expectCaptureFailure(capture, direct, {
            name: UserSettingsReadError.name,
            status: 'unavailable',
          })

          expectNoCaptureEffects()
          expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
            localizedFailureFeedback[language].settingsTitle,
            expect.stringContaining(
              localizedFailureFeedback[language].settingsRecovery,
            ),
          )
          expect(
            JSON.stringify(mocked.showNotification.mock.calls),
          ).not.toContain('private storage payload')
        },
      )

      it.each(captureEntries)(
        '$name: filter evaluation failure reports one safe retry notification',
        async ({ behavior, capture, direct }) => {
          configureCapture(behavior, { language, excludePinnedTabs: true })
          const unreadableTab = {
            ...source,
            get pinned(): boolean {
              throw new Error('private filtering payload')
            },
          }
          setCaptureTabs([unreadableTab])

          await expectCaptureFailure(capture, direct, {
            name: TabFilteringError.name,
            reason: 'evaluation-failed',
          })

          expectNoCaptureEffects()
          expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
            localizedFailureFeedback[language].filterTitle,
            expect.stringContaining(
              localizedFailureFeedback[language].filterRecovery,
            ),
          )
          expect(
            JSON.stringify(mocked.showNotification.mock.calls),
          ).not.toContain('private filtering payload')
        },
      )
    },
  )

  describe.each([
    { reason: 'no source tabs', tabs: [] },
    { reason: 'pinned source', tabs: [{ ...source, pinned: true }] },
    { reason: 'excluded source', tabs: [source] },
    { reason: 'malformed source URL', tabs: [{ ...source, url: 'not a URL' }] },
  ])('ordinary empty capture: $reason', ({ reason, tabs }) => {
    it.each(captureEntries)(
      '$name: resolves without saving, closing, or opening a page',
      async ({ behavior, capture, direct }) => {
        configureCapture(behavior, {
          excludePatterns: reason === 'excluded source' ? ['example.test'] : [],
          excludePinnedTabs: true,
        })
        setCaptureTabs(tabs)

        await expect(capture()).resolves.toStrictEqual(direct ? [] : undefined)

        expectNoCaptureEffects()
        // 対象が 0 件でも、対処できる除外理由がある場合は理由を通知する
        // (issue #892)。タブ自体がない場合と、同ドメイン判定ができない
        // 不正な URL の場合は従来どおり通知しない。
        const expectsSilence =
          reason === 'no source tabs' ||
          (reason === 'malformed source URL' &&
            behavior === 'saveSameDomainTabs')
        const expectedNotificationCalls = expectsSilence
          ? []
          : [
              [
                'No tabs saved',
                reason === 'pinned source'
                  ? 'All of the target tabs are pinned. Pinned tabs are skipped while the setting to exclude pinned tabs is on.'
                  : 'None of the target tabs can be saved. Check the URLs or your exclusion patterns.',
              ],
            ]
        expect(mocked.showNotification.mock.calls).toEqual(
          expectedNotificationCalls,
        )
      },
    )
  })

  it.each(captureEntries)(
    '$name: explicitly disabled pinned exclusion saves pinned tabs and leaves them open',
    async ({ behavior, capture }) => {
      configureCapture(behavior, { excludePinnedTabs: false })
      const pinnedTab = { ...source, pinned: true }
      setCaptureTabs([pinnedTab])

      await capture()

      expect(mocked.saveTabs).toHaveBeenCalledExactlyOnceWith([pinnedTab])
      expect(remove).not.toHaveBeenCalled()
    },
  )

  it.each(
    captureEntries.filter(({ behavior }) => behavior !== 'saveCurrentTab'),
  )(
    '$name: a valid target does not cause excluded, pinned, or malformed tabs to close',
    async ({ behavior, capture }) => {
      configureCapture(behavior, {
        excludePatterns: ['blocked'],
        excludePinnedTabs: true,
      })
      setCaptureTabs([
        source,
        { ...source, id: 13, url: 'https://example.test/pinned', pinned: true },
        { ...source, id: 14, url: 'https://example.test/blocked' },
        { ...source, id: 15, url: 'not a URL' },
      ])

      await capture()

      expect(mocked.saveTabs).toHaveBeenCalledExactlyOnceWith([source])
      expect(remove).toHaveBeenCalledExactlyOnceWith(source.id)
    },
  )

  it('all-windows capture opens the saved page only after persistence fulfills', async () => {
    const saving = Promise.withResolvers<{ savedUrls: string[] }>()
    const saveStarted = new Promise<void>((resolve) => {
      mocked.saveTabs.mockImplementationOnce(async () => {
        resolve()
        return saving.promise
      })
    })

    const operation = handleSaveAllWindowsTabs()
    await saveStarted
    try {
      expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
      expect(remove).not.toHaveBeenCalled()
      expect(mocked.showNotification).not.toHaveBeenCalled()
    } finally {
      saving.resolve({ savedUrls: [sourceUrl] })
    }
    await expect(operation).resolves.toStrictEqual([
      { title: source.title, url: source.url },
    ])
    expect(mocked.openSavedTabsPage).toHaveBeenCalledExactlyOnceWith({
      closeDuplicates: false,
    })
    expect(remove).toHaveBeenCalledWith(source.id)
  })

  it('preserves new, navigated, and newly pinned tabs when other sources disappear during saving', async () => {
    const removed = { ...source, id: 13 }
    const navigated = { ...source, id: 14 }
    const pinned = { ...source, id: 15 }
    const pending = { ...source, id: 16 }
    const added = { ...source, id: 17 }
    const loading = { ...source, id: 18 }
    setCaptureTabs([source, removed, navigated, pinned, pending, loading])
    const saving = Promise.withResolvers<{ savedUrls: string[] }>()
    const started = Promise.withResolvers<undefined>()
    mocked.saveTabs.mockImplementationOnce(async () => {
      started.resolve(undefined)
      return saving.promise
    })

    const operation = handleSaveAllWindowsTabs()
    await started.promise
    // The open tabs change while the saved URL receipt is still pending.
    liveTabs = [
      source,
      { ...navigated, url: 'https://example.test/unsaved' },
      { ...pinned, pinned: true },
      { ...pending, pendingUrl: 'https://example.test/pending' },
      { ...loading, status: 'loading' },
      added,
    ]
    saving.resolve({ savedUrls: [sourceUrl] })
    await operation

    expect(remove).toHaveBeenCalledExactlyOnceWith(source.id)
  })

  it.each([
    ['window', handleSaveWindowTabs],
    ['all windows', handleSaveAllWindowsTabs],
    ['toolbar', handleExtensionActionClick],
  ] as const)(
    '%s: freezes source candidates while the settings read is pending',
    async (_name, capture) => {
      const settings = Promise.withResolvers<{
        userSettings: { clickBehavior: 'saveAllWindowsTabs' }
      }>()
      get.mockReturnValueOnce(settings.promise)

      const operation = capture()
      await vi.waitFor(() => expect(get).toHaveBeenCalledOnce())
      setCaptureTabs([source, { ...source, id: 13 }])
      settings.resolve({
        userSettings: { clickBehavior: 'saveAllWindowsTabs' },
      })
      await operation

      expect(mocked.saveTabs).toHaveBeenCalledExactlyOnceWith([source])
      expect(remove).toHaveBeenCalledExactlyOnceWith(source.id)
    },
  )

  it.each(failures)(
    '%s: every capture entry preserves source tabs',
    async (failure) => {
      failSettings(failure)
      await Promise.allSettled(
        [
          handleExtensionActionClick,
          handleSaveCurrentTab,
          handleSaveWindowTabs,
          handleSaveSameDomainTabs,
          handleSaveAllWindowsTabs,
        ].map(async (capture) => capture()),
      )
      expect(remove).not.toHaveBeenCalled()
      expect(mocked.saveTabs).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledWith(
        'Settings could not be verified',
        expect.stringContaining('Options'),
      )
    },
  )

  it.each(failures)(
    '%s: external drop and open preserve saved URLs',
    async (failure) => {
      failSettings(failure)
      handleUrlDragStarted(sourceUrl, 'source-id', undefined, 'settings-drag')
      await Promise.allSettled([
        handleUrlDropped(sourceUrl, true, {
          urlRecordId: 'source-id',
          dragId: 'settings-drag',
        }),
      ])
      expect(mocked.removeUrl).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledWith(
        'Settings could not be verified',
        expect.stringContaining('Options'),
      )
    },
  )

  it.each(failures)(
    '%s: expiry and timestamp updates do not mutate data',
    async (failure) => {
      failSettings(failure)
      await checkAndRemoveExpiredTabs()
      await Promise.allSettled([updateTabTimestamps('30sec')])
      for (const mutation of mutations) {
        expect(mutation).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    ['window', handleSaveWindowTabs],
    ['domain', handleSaveSameDomainTabs],
  ])(
    '%s: the first policy still applies when a subsequent read would fail',
    async (_name, capture) => {
      get
        .mockResolvedValueOnce({})
        .mockRejectedValue(new Error('storage failed'))
      await expect(capture()).resolves.toEqual([
        { url: sourceUrl, title: source.title },
      ])
      expect(get).toHaveBeenCalledOnce()
      expect(mocked.saveTabs).toHaveBeenCalledWith([source])
      expect(remove).toHaveBeenCalled()
    },
  )

  it.each(captureEntries)(
    '$name: an updated policy only applies to the next capture',
    async ({ behavior, capture }) => {
      const nextSettings = {
        userSettings: { clickBehavior: behavior, excludePatterns: ['article'] },
      }
      get
        .mockResolvedValueOnce({ userSettings: { clickBehavior: behavior } })
        .mockResolvedValue(nextSettings)

      await capture()
      expect(mocked.saveTabs).toHaveBeenCalledExactlyOnceWith([source])
      expect(remove).toHaveBeenCalledOnce()

      await capture()
      expect(mocked.saveTabs).toHaveBeenCalledOnce()
      expect(remove).toHaveBeenCalledOnce()
      expect(get).toHaveBeenCalledTimes(2)
    },
  )

  it('all windows: closes only exact URLs confirmed by the persistence receipt', async () => {
    const unsaved = { ...source, id: 13, url: `${sourceUrl}#other` }
    const savedDuplicate = { ...source, id: 14 }
    const extensionPage = {
      ...source,
      id: 15,
      url: 'moz-extension://tabbin/saved-tabs.html',
    }
    setCaptureTabs([source, unsaved, savedDuplicate, extensionPage])
    mocked.saveTabs.mockResolvedValueOnce({ savedUrls: [sourceUrl] })

    await expect(handleSaveAllWindowsTabs()).resolves.toEqual([
      { url: sourceUrl, title: source.title },
      { url: sourceUrl, title: source.title },
    ])
    expect(mocked.saveTabs).toHaveBeenCalledExactlyOnceWith([
      source,
      unsaved,
      savedDuplicate,
    ])
    expect(remove.mock.calls.flat()).toEqual([source.id, savedDuplicate.id])
  })

  it('first use without a saved value still allows the existing capture defaults', async () => {
    await handleSaveCurrentTab()
    expect(mocked.saveTabs).toHaveBeenCalledWith([source])
    expect(remove).toHaveBeenCalledWith(source.id)
  })

  it('strict read does not write repairs and keeps an explicit no-delete policy', async () => {
    get.mockResolvedValue({
      userSettings: { aiProvider: 'ollama', removeTabAfterExternalDrop: false },
    })
    await expect(
      handleUrlDropped(sourceUrl, true, {
        urlRecordId: 'source-id',
        dragId: 'settings-drag',
      }),
    ).resolves.toBe('skipped')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })
})
