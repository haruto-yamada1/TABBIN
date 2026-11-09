import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  handleTabCreated,
  handleUrlDragStarted,
  handleUrlDropped,
} from './url-storage'

const sourceUrl = 'https://example.test/article'
const source = {
  id: 12,
  url: sourceUrl,
  title: 'Article',
  pinned: false,
} as chrome.tabs.Tab

const mutations = [
  mocked.saveTabs,
  mocked.removeUrl,
  mocked.removeExpiredUrls,
  mocked.updateTabTimestamps,
]

const failures = ['missing API', 'get rejection', 'invalid settings'] as const

describe('settings safety at background operation boundaries', () => {
  let get: ReturnType<typeof vi.fn>
  let set: ReturnType<typeof vi.fn>
  let remove: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    get = vi.fn(async () => ({}))
    set = vi.fn(async () => undefined)
    remove = vi.fn(async () => undefined)
    vi.stubGlobal('browser', undefined)
    vi.stubGlobal('chrome', {
      storage: { local: { get, set } },
      tabs: {
        query: vi.fn(async () => [source]),
        remove,
      },
      windows: {
        getAll: vi.fn(async () => [{ tabs: [source] }]),
      },
      i18n: { getUILanguage: () => 'en' },
    })
    mocked.saveTabs.mockResolvedValue(undefined)
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
      await Promise.allSettled([handleUrlDropped(sourceUrl, true)])
      handleUrlDragStarted(sourceUrl)
      await handleTabCreated(source)
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
    '%s: a later read failure preserves tabs even after a successful save',
    async (_name, capture) => {
      get
        .mockResolvedValueOnce({})
        .mockRejectedValue(new Error('storage failed'))
      await Promise.allSettled([capture()])
      expect(mocked.saveTabs).toHaveBeenCalledOnce()
      expect(remove).not.toHaveBeenCalled()
    },
  )

  it('first use without a saved value still allows the existing capture defaults', async () => {
    await handleSaveCurrentTab()
    expect(mocked.saveTabs).toHaveBeenCalledWith([source])
    expect(remove).toHaveBeenCalledWith(source.id)
  })

  it('strict read does not write repairs and keeps an explicit no-delete policy', async () => {
    get.mockResolvedValue({
      userSettings: { aiProvider: 'ollama', removeTabAfterExternalDrop: false },
    })
    await expect(handleUrlDropped(sourceUrl, true)).resolves.toBe('skipped')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })
})
