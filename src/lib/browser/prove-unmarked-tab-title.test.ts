import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SAVED_TAB_TITLE_ENABLED_KEY } from '@/constants/savedTabTitleIndicator'

import { proveCapturedTitleUnowned } from './prove-unmarked-tab-title'
import { isCapturedTabTitleUnowned } from './saved-tab-title'

const tab = { id: 1, url: 'https://example.test/old', title: '✓ Site title' }
const executeScript = vi.fn()
const get = vi.fn()
const getAll = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('browser', undefined)
  vi.stubGlobal('chrome', {
    scripting: { executeScript },
    storage: { local: { get } },
    permissions: { getAll },
  })
  executeScript.mockResolvedValue([{ frameId: 0, result: true }])
  get.mockResolvedValue({})
  getAll.mockResolvedValue({ permissions: [], origins: [] })
})
afterEach(() => vi.unstubAllGlobals())

it('uses a read-only same-document ownership proof', async () => {
  expect(await proveCapturedTitleUnowned(tab)).toBe(true)
  expect(executeScript).toHaveBeenCalledExactlyOnceWith({
    target: { tabId: 1 },
    func: isCapturedTabTitleUnowned,
    args: [tab.url, tab.title],
  })
  expect(get).not.toHaveBeenCalled()
})

it.each([
  [],
  [{ frameId: 0, result: false }],
  [{ frameId: 1, result: true }],
  [{ result: true }],
  null,
])(
  'rejects an unsuccessful or malformed live document proof: %j',
  async (result) => {
    executeScript.mockResolvedValue(result)
    expect(await proveCapturedTitleUnowned(tab)).toBe(false)
    expect(get).not.toHaveBeenCalled()
  },
)

it('proves never-used when the preference is absent and optional rights are absent', async () => {
  executeScript.mockRejectedValue(new Error('No scripting permission'))
  expect(await proveCapturedTitleUnowned(tab)).toBe(true)
  expect(get).toHaveBeenCalledWith([SAVED_TAB_TITLE_ENABLED_KEY])
})

it.each([
  [{ [SAVED_TAB_TITLE_ENABLED_KEY]: false }, { permissions: [], origins: [] }],
  [{ [SAVED_TAB_TITLE_ENABLED_KEY]: true }, { permissions: [], origins: [] }],
  [{}, { permissions: ['scripting'], origins: [] }],
  [{}, { permissions: [], origins: ['https://*/*'] }],
  [{}, { permissions: [], origins: ['http://*/*'] }],
  [{}, { permissions: [], origins: ['<all_urls>'] }],
  [null, { permissions: [], origins: [] }],
  [{}, {}],
  [{}, { permissions: [], origins: null }],
])(
  'rejects used or unknown history without scripting proof: %j',
  async (settings, permissions) => {
    executeScript.mockRejectedValue(new Error('Denied'))
    get.mockResolvedValue(settings)
    getAll.mockResolvedValue(permissions)
    expect(await proveCapturedTitleUnowned(tab)).toBe(false)
  },
)

it('rejects storage and permission read errors without exposing them', async () => {
  executeScript.mockRejectedValue(new Error('Closed document'))
  get.mockRejectedValue(new Error('private URL'))
  expect(await proveCapturedTitleUnowned(tab)).toBe(false)
  get.mockResolvedValue({})
  getAll.mockRejectedValue(new Error('private permissions'))
  expect(await proveCapturedTitleUnowned(tab)).toBe(false)
})

it('rejects when all native APIs are unavailable', async () => {
  vi.stubGlobal('chrome', undefined)
  expect(await proveCapturedTitleUnowned(tab)).toBe(false)
})
