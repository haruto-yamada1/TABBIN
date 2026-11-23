import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { UserSettingsReadError } from '@/lib/storage/settings'
import type * as UserSettingsModule from '@/lib/storage/settings'
import type { UserSettings } from '@/types/storage'

const mocked = vi.hoisted(() => ({
  dataPlaneSaveTabs: vi.fn(),
  getUserSettings: vi.fn(),
  openSavedTabsPage: vi.fn(),
  showNotification: vi.fn(),
  proveCapturedTitleUnowned: vi.fn(),
}))
vi.mock('@/lib/browser/prove-unmarked-tab-title', () => ({
  proveCapturedTitleUnowned: mocked.proveCapturedTitleUnowned,
}))
vi.mock('wxt/browser', () => ({
  get browser() {
    return globalThis.chrome
  },
}))
vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    saveTabs: mocked.dataPlaneSaveTabs,
  }),
}))
vi.mock('@/lib/storage/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof UserSettingsModule>()),
  getUserSettings: mocked.getUserSettings,
  requireUserSettings: mocked.getUserSettings,
}))
vi.mock('./saved-tabs-page', () => ({
  openSavedTabsPage: mocked.openSavedTabsPage,
}))
vi.mock('./notification', () => ({
  showNotification: mocked.showNotification,
}))

import {
  handleExtensionActionClick,
  handleSaveAllWindowsTabs,
  handleSaveCurrentTab,
  handleSaveLink,
  handleSaveSameDomainTabs,
  handleSaveWindowTabs,
} from './extension-actions'

type SendTabMessage = (
  id: number,
  message: unknown,
  options?: { frameId: number },
) => Promise<unknown>

type TabsHarness = {
  query: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  getAllWindows: ReturnType<typeof vi.fn>
  sendMessage: ReturnType<typeof vi.fn<SendTabMessage>>
}
const createChromeTabsHarness = (): TabsHarness => {
  const query = vi.fn()

  const remove = vi.fn(async () => undefined)

  const get = vi.fn(async (id: number) => {
    const queried = query.mock.results.at(-1)?.value as
      | Promise<chrome.tabs.Tab[]>
      | undefined
    const windows = getAllWindows.mock.results.at(-1)?.value as
      | Promise<{ tabs?: chrome.tabs.Tab[] }[]>
      | undefined
    const tabs = queried
      ? await queried
      : (await windows)?.flatMap((window) => window.tabs ?? [])
    const found = tabs?.find((tab) => tab.id === id)
    if (!found) {
      throw new Error('Tab not found')
    }
    return found
  })

  const getAllWindows = vi.fn<() => Promise<{ tabs?: chrome.tabs.Tab[] }[]>>(
    async () => [],
  )
  const sendMessage = vi.fn<SendTabMessage>(async () => undefined)
  ;(
    globalThis as {
      chrome?: typeof chrome
    }
  ).chrome = {
    tabs: {
      query,
      get,
      remove,
      sendMessage,
    },
    windows: {
      getAll: getAllWindows,
    },
  } as unknown as typeof chrome
  return {
    query,
    remove,
    getAllWindows,
    sendMessage,
  }
}
const buildSettings = (override: Partial<UserSettings> = {}): UserSettings => ({
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  protectFavoriteFromAutoRemoval: true,
  excludePatterns: ['about:', 'chrome://', 'ignore.example'],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showRelativeSavedTime: false,
  showSavedTime: false,
  clickBehavior: 'saveWindowTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
  ...override,
})
const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: partial.id,
    url: partial.url,
    title: partial.title,
    pinned: partial.pinned ?? false,
    active: partial.active ?? true,
  }) as chrome.tabs.Tab
describe('extension-actions モジュール', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocked.getUserSettings.mockResolvedValue(buildSettings())
    mocked.openSavedTabsPage.mockResolvedValue(9999)
    mocked.showNotification.mockResolvedValue(undefined)
    mocked.proveCapturedTitleUnowned.mockResolvedValue(false)
    mocked.dataPlaneSaveTabs.mockImplementation(
      async (tabs: { url: string }[]) => ({
        savedUrls: tabs.map(({ url }) => url),
      }),
    )
  })

  describe('リンク先の保存', () => {
    it('リンク先を1回だけ保存し、タブを閉じずに成功通知する', async () => {
      const chromeTabs = createChromeTabsHarness()
      const url = 'https://example.test/docs/start?x=1#part'

      await expect(handleSaveLink(url)).resolves.toEqual([
        { title: 'example.test/docs/start?x=1', url },
      ])

      expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledExactlyOnceWith(
        [{ title: 'example.test/docs/start?x=1', url }],
        { preserveExistingTitle: true },
      )
      expect(chromeTabs.remove).not.toHaveBeenCalled()
      expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'リンク保存',
        'リンク先をTABBINに保存しました',
      )
    })

    it.each([
      undefined,
      '',
      'not a url',
      ['java', 'script:alert(1)'].join(''),
      'data:text/html,<h1>x</h1>',
      'file:///tmp/example.txt',
      'https://user:password@example.test/private',
    ])(
      '保存できないリンク (%s) は保存もタブ操作もせず通知する',
      async (url) => {
        const chromeTabs = createChromeTabsHarness()

        await expect(handleSaveLink(url)).resolves.toEqual([])

        expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
        expect(chromeTabs.remove).not.toHaveBeenCalled()
        expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
        expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
          'リンクを保存できません',
          'このリンクは保存できません。URLまたは除外パターンを確認してください。',
        )
      },
    )

    it('除外パターンに一致するリンクは保存しない', async () => {
      createChromeTabsHarness()

      await expect(
        handleSaveLink('https://ignore.example/article'),
      ).resolves.toEqual([])

      expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'リンクを保存できません',
        'このリンクは保存できません。URLまたは除外パターンを確認してください。',
      )
    })

    it('保存失敗時はタブを閉じず、失敗を通知して reject する', async () => {
      const chromeTabs = createChromeTabsHarness()
      const error = new Error('private persistence detail')
      mocked.dataPlaneSaveTabs.mockRejectedValueOnce(error)

      await expect(handleSaveLink('https://example.test/a')).rejects.toThrow(
        error,
      )

      expect(chromeTabs.remove).not.toHaveBeenCalled()
      expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'リンク保存に失敗しました',
        '今回のリンク保存を完了できませんでした。もう一度お試しください。',
      )
    })

    it('通知の言語判定に失敗しても見出しと本文を同じ言語で表示する', async () => {
      createChromeTabsHarness()
      mocked.getUserSettings
        .mockResolvedValue(buildSettings({ language: 'en' }))
        .mockResolvedValueOnce(buildSettings({ language: 'en' }))
        .mockRejectedValueOnce(new UserSettingsReadError('unavailable'))

      await expect(handleSaveLink('not a url')).resolves.toEqual([])

      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'リンクを保存できません',
        'このリンクは保存できません。URLまたは除外パターンを確認してください。',
      )
    })

    it('設定を読めない場合は保存せず安全に中止する', async () => {
      const chromeTabs = createChromeTabsHarness()
      mocked.getUserSettings.mockRejectedValueOnce(
        new UserSettingsReadError('unavailable'),
      )

      await expect(handleSaveLink('https://example.test/a')).rejects.toThrow(
        UserSettingsReadError,
      )

      expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
      expect(chromeTabs.remove).not.toHaveBeenCalled()
    })
  })

  const captureActions = [
    ['current', handleSaveCurrentTab],
    ['window', handleSaveWindowTabs],
    ['domain', handleSaveSameDomainTabs],
    ['all windows', handleSaveAllWindowsTabs],
  ] as const

  describe.each(captureActions)(
    '%s capture failure boundary',
    (_name, save) => {
      it.each(['query', 'persistence'] as const)(
        '%s failure rejects, keeps source tabs and gives retry feedback',
        async (failure) => {
          const chromeTabs = createChromeTabsHarness()
          const source = tab({ id: 10, url: 'https://example.test/article' })
          chromeTabs.query.mockResolvedValue([source])
          chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [source] }])
          const error = new Error('private failure detail')
          if (failure === 'query') {
            chromeTabs.getAllWindows.mockRejectedValueOnce(error)
            chromeTabs.query.mockRejectedValueOnce(error)
          } else {
            mocked.dataPlaneSaveTabs.mockRejectedValueOnce(error)
          }

          await expect(save()).rejects.toThrow(error)
          expect(chromeTabs.remove).not.toHaveBeenCalled()
          expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledTimes(
            failure === 'persistence' ? 1 : 0,
          )
          expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
          expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
            'タブの保存を完了できませんでした',
            'タブは閉じていません。保存状態を確認してから、もう一度保存してください。',
          )
        },
      )

      it('保存が完了するまで成功通知もタブ閉鎖もしない', async () => {
        const chromeTabs = createChromeTabsHarness()
        const source = tab({ id: 10, url: 'https://example.test/article' })
        chromeTabs.query.mockResolvedValue([source])
        chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [source] }])
        const completion = Promise.withResolvers<{ savedUrls: string[] }>()
        mocked.dataPlaneSaveTabs.mockReturnValueOnce(completion.promise)
        const saving = save()
        await vi.waitFor(() =>
          expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledOnce(),
        )
        expect(chromeTabs.remove).not.toHaveBeenCalled()
        expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
        expect(mocked.showNotification).not.toHaveBeenCalled()
        completion.resolve({ savedUrls: [source.url ?? ''] })
        await saving
        expect(chromeTabs.remove).toHaveBeenCalledOnce()
      })
    },
  )

  it.each([
    ['window', handleSaveWindowTabs],
    ['all windows', handleSaveAllWindowsTabs],
  ])(
    '%s: 保存画面IDが不明なら保存結果を返して全タブを保全する',
    async (_name, save) => {
      const chromeTabs = createChromeTabsHarness()
      const source = tab({
        id: 10,
        url: 'https://example.test/article',
        title: 'Article',
      })
      chromeTabs.query.mockResolvedValue([source])
      chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [source] }])
      mocked.openSavedTabsPage.mockResolvedValueOnce(null)

      await expect(save()).resolves.toEqual([
        { url: source.url, title: source.title },
      ])

      expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledWith([source])
      expect(chromeTabs.remove).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['current', handleSaveCurrentTab],
    ['window', handleSaveWindowTabs],
    ['domain', handleSaveSameDomainTabs],
    ['all windows', handleSaveAllWindowsTabs],
  ])(
    '保存前の元タイトルを保存結果と返却結果で共有する: %s',
    async (_name, save) => {
      const chromeTabs = createChromeTabsHarness()
      const markedTab = {
        ...tab({
          id: 10,
          url: 'https://example.test/article',
          title: '✓ ✓ Site-owned title',
        }),
        incognito: false,
      }
      chromeTabs.query.mockResolvedValue([markedTab])
      chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [markedTab] }])
      chromeTabs.sendMessage.mockResolvedValue({
        baseTitle: '✓ Site-owned title',
        displayTitle: markedTab.title,
        url: markedTab.url,
      })

      expect(await save()).toStrictEqual([
        { url: markedTab.url, title: '✓ Site-owned title' },
      ])
      expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledExactlyOnceWith([
        { ...markedTab, title: '✓ Site-owned title' },
      ])
      expect(chromeTabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
        10,
        { action: 'tabbinNativeSavedTitle', command: 'read' },
        { frameId: 0 },
      )
      expect(markedTab.title).toBe('✓ ✓ Site-owned title')
      expect(chromeTabs.remove).toHaveBeenCalledOnce()
    },
  )

  it('保存対象から除外されたタブのタイトルは問い合わせない', async () => {
    const chromeTabs = createChromeTabsHarness()
    chromeTabs.query.mockResolvedValue([
      { ...tab({ id: 10, url: 'https://example.test' }), incognito: false },
    ])
    mocked.getUserSettings.mockResolvedValueOnce(
      buildSettings({
        excludePatterns: ['example.test'],
      }),
    )

    expect(await handleSaveWindowTabs()).toEqual([])
    expect(chromeTabs.sendMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['current', handleSaveCurrentTab],
    ['window', handleSaveWindowTabs],
    ['domain', handleSaveSameDomainTabs],
    ['all windows', handleSaveAllWindowsTabs],
  ])(
    '元タイトルが確認できないcaptureは保存もcloseも成功通知もしない: %s',
    async (_name, save) => {
      const chromeTabs = createChromeTabsHarness()
      const marked = {
        ...tab({
          id: 10,
          url: 'https://example.test/old',
          title: '✓ Old document',
        }),
        incognito: false,
      }
      chromeTabs.query.mockResolvedValue([marked])
      chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [marked] }])
      chromeTabs.sendMessage.mockRejectedValue(new Error('closed private URL'))
      await save().catch(() => undefined)
      expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
      expect(chromeTabs.remove).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'タブを保存できませんでした',
        'タブのタイトルを確認できませんでした。タブの保存やクローズは行っていません。もう一度保存してください。',
      )
    },
  )

  it.each([
    ['current', handleSaveCurrentTab],
    ['window', handleSaveWindowTabs],
    ['domain', handleSaveSameDomainTabs],
    ['all windows', handleSaveAllWindowsTabs],
  ])(
    '移動先のowned titleを別URLへ保存せずcloseも成功通知もしない: %s',
    async (_name, save) => {
      const chromeTabs = createChromeTabsHarness()
      const marked = {
        ...tab({
          id: 10,
          url: 'https://example.test/old',
          title: '✓ Old document',
        }),
        incognito: false,
      }
      chromeTabs.query.mockResolvedValue([marked])
      chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [marked] }])
      chromeTabs.sendMessage.mockResolvedValue({
        baseTitle: 'New document',
        displayTitle: '✓ New document',
        url: 'https://example.test/new',
      })
      await save().catch(() => undefined)
      expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
      expect(chromeTabs.remove).not.toHaveBeenCalled()
      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'タブを保存できませんでした',
        'タブのタイトルを確認できませんでした。タブの保存やクローズは行っていません。もう一度保存してください。',
      )
    },
  )

  it.each([
    'saveCurrentTab',
    'saveWindowTabs',
    'saveSameDomainTabs',
    'saveAllWindowsTabs',
  ] as const)(
    'toolbar capture failure gives one localized retry notification without saving or closing: %s',
    async (clickBehavior) => {
      mocked.getUserSettings.mockResolvedValue(
        buildSettings({ language: 'en', clickBehavior }),
      )
      const tabs = createChromeTabsHarness()
      const marked = {
        ...tab({
          id: 10,
          url: 'https://example.test/old',
          title: '✓ Private title',
        }),
        incognito: false,
      }
      tabs.query.mockResolvedValue([marked])
      tabs.getAllWindows.mockResolvedValue([{ tabs: [marked] }])
      tabs.sendMessage.mockRejectedValue(
        new Error('private browser diagnostic'),
      )
      await handleExtensionActionClick()
      expect(mocked.showNotification).toHaveBeenCalledExactlyOnceWith(
        'Tabs were not saved',
        'Could not confirm a tab title. No tabs were saved or closed by TABBIN. Retry saving the tab.',
      )
      expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
      expect(tabs.remove).not.toHaveBeenCalled()
      expect(JSON.stringify(mocked.showNotification.mock.calls)).not.toContain(
        'Private title',
      )
      expect(JSON.stringify(mocked.showNotification.mock.calls)).not.toContain(
        'https:',
      )
    },
  )

  it('one uncertain title aborts the whole batch with one retry notice and a later retry can succeed', async () => {
    mocked.getUserSettings.mockResolvedValue(buildSettings({ language: 'en' }))
    const tabs = createChromeTabsHarness()
    const captures = [
      {
        ...tab({
          id: 10,
          url: 'https://example.test/first',
          title: 'First document',
        }),
        incognito: false,
      },
      {
        ...tab({
          id: 11,
          url: 'https://example.test/second',
          title: '✓ Second document',
        }),
        incognito: false,
      },
    ]
    tabs.query.mockResolvedValue(captures)
    tabs.sendMessage.mockImplementation(async (id: number) =>
      id === 10
        ? {
            baseTitle: 'First document',
            displayTitle: 'First document',
            url: captures[0]?.url,
          }
        : undefined,
    )
    await expect(handleSaveWindowTabs()).rejects.toThrow('Retry saving the tab')
    expect(mocked.showNotification).toHaveBeenCalledTimes(1)
    expect(mocked.dataPlaneSaveTabs).not.toHaveBeenCalled()
    expect(tabs.remove).not.toHaveBeenCalled()
    tabs.sendMessage.mockImplementation(async (id: number) => ({
      baseTitle: id === 10 ? 'First document' : 'Second document',
      displayTitle: captures[id === 10 ? 0 : 1]?.title,
      url: captures[id === 10 ? 0 : 1]?.url,
    }))
    expect(await handleSaveWindowTabs()).toEqual([
      { url: captures[0]?.url, title: 'First document' },
      { url: captures[1]?.url, title: 'Second document' },
    ])
    expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledTimes(1)
    expect(tabs.remove.mock.calls.flat()).toEqual([10, 11])
    expect(mocked.showNotification).toHaveBeenCalledTimes(2)
  })

  it.each(['empty', 'unavailable'] as const)(
    'all windows falls back to tabs.query when windows are %s',
    async (state) => {
      const chromeTabs = createChromeTabsHarness()
      const source = tab({ id: 10, url: 'https://example.test/article' })
      if (state === 'unavailable') {
        chromeTabs.getAllWindows.mockRejectedValueOnce(
          new Error('windows unavailable'),
        )
      }
      chromeTabs.query.mockResolvedValueOnce([source])

      await expect(handleSaveAllWindowsTabs()).resolves.toEqual([
        { url: source.url, title: '' },
      ])
      expect(chromeTabs.query).toHaveBeenCalledExactlyOnceWith({})
      expect(chromeTabs.remove).toHaveBeenCalledExactlyOnceWith(10)
    },
  )

  it.each([handleSaveWindowTabs, handleSaveAllWindowsTabs])(
    '%p preserves saved source tabs until a Saved Tabs page is confirmed',
    async (save) => {
      const chromeTabs = createChromeTabsHarness()
      const source = tab({ id: 10, url: 'https://example.test/article' })
      chromeTabs.query.mockResolvedValue([source])
      chromeTabs.getAllWindows.mockResolvedValue([{ tabs: [source] }])
      mocked.openSavedTabsPage.mockResolvedValueOnce(null)
      await expect(save()).resolves.toEqual([{ title: '', url: source.url }])
      expect(chromeTabs.remove).not.toHaveBeenCalled()
    },
  )

  it('toolbar dispatches current-window capture and tolerates a close rejection', async () => {
    const chromeTabs = createChromeTabsHarness()
    const source = {
      ...tab({ id: 10, url: 'https://example.test/article' }),
      windowId: 1,
    }
    chromeTabs.getAllWindows.mockResolvedValue([
      { tabs: [source] },
      { tabs: [{ ...source, id: 11, windowId: 2 }] },
    ])
    chromeTabs.remove.mockRejectedValueOnce(new Error('Source tab closed'))
    mocked.getUserSettings.mockResolvedValue(
      buildSettings({ clickBehavior: 'saveWindowTabs' }),
    )
    await handleExtensionActionClick(source)
    expect(mocked.dataPlaneSaveTabs).toHaveBeenCalledExactlyOnceWith([source])
    expect(chromeTabs.query).not.toHaveBeenCalled()
    expect(chromeTabs.remove).toHaveBeenCalledExactlyOnceWith(10)
    expect(console.error).toHaveBeenCalledWith(
      'タブを閉じる際にエラー:',
      expect.any(Error),
    )
  })
})
