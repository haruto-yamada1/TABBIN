import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as chromeStorageModule from '@/lib/browser/chrome-storage'

import { createSavedTabsUseCases } from './createSavedTabsUseCases'

vi.mock('@/lib/browser/chrome-storage', async () => {
  const actual = await vi.importActual<typeof chromeStorageModule>(
    '@/lib/browser/chrome-storage',
  )
  return {
    ...actual,
    getChromeStorageLocal: vi.fn(),
  }
})

const getChromeStorageLocal = chromeStorageModule.getChromeStorageLocal

const setChromeApi = (api: unknown) => {
  ;(globalThis as { chrome?: unknown }).chrome = api
}

const restoreChromeApi = () => {
  delete (globalThis as { chrome?: unknown }).chrome
}

const buildChromeStorageLocal = (state: Record<string, unknown>) =>
  ({
    get: async (key: string) => ({ [key]: state[key] }),
    remove: async (key: string) => {
      delete state[key]
    },
    set: async (value: Record<string, unknown>) => {
      Object.assign(state, value)
    },
    // eslint-disable-next-line typescript/no-explicit-any
  }) as any

describe('createSavedTabsUseCases (app/composition)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreChromeApi()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreChromeApi()
  })

  it('5 つの use-case 関数を持つバンドルを返す', () => {
    vi.mocked(getChromeStorageLocal).mockReturnValue(
      buildChromeStorageLocal({}),
    )
    setChromeApi({
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      tabs: { create: vi.fn(async () => ({ url: 'https://example.com' })) },
    })

    const useCases = createSavedTabsUseCases()

    expect(useCases.openSavedUrl).toBeTypeOf('function')
    expect(useCases.deleteTabGroup).toBeTypeOf('function')
    expect(useCases.restoreOpenedUrlsSnapshot).toBeTypeOf('function')
    expect(useCases.syncCategoryAssignments).toBeTypeOf('function')
    expect(useCases.removeUnreferencedUrlRecords).toBeTypeOf('function')
  })

  it('removeUnreferencedUrlRecords のような副作用無しの use-case は何もせずに正常終了する', async () => {
    const state: Record<string, unknown> = {
      'tabbin:savedTabs': [],
      'tabbin:urls': [],
      'tabbin:parentCategories': [],
      'tabbin:customProjects': [],
    }
    vi.mocked(getChromeStorageLocal).mockReturnValue(
      buildChromeStorageLocal(state),
    )
    setChromeApi({
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      tabs: { create: vi.fn(async () => ({ url: 'https://example.com' })) },
    })

    const useCases = createSavedTabsUseCases()
    const result = await useCases.removeUnreferencedUrlRecords()

    expect(result).toStrictEqual({ removedCount: 0, removedUrlRecordIds: [] })
  })

  it('chrome.storage.local 不在環境でバンドル生成が chrome.storage.local 由来のエラーを投げる (eager 検出)', () => {
    vi.mocked(getChromeStorageLocal).mockReturnValue(null)
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    setChromeApi({})

    try {
      expect(() => createSavedTabsUseCases()).toThrow(/chrome\.storage\.local/)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('options.resolveActive を渡すと openSavedUrl が active 設定を反映する', async () => {
    const state: Record<string, unknown> = {
      customProjects: [],
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'A',
          url: 'https://example.com/a',
        },
      ],
    }
    vi.mocked(getChromeStorageLocal).mockReturnValue(
      buildChromeStorageLocal(state),
    )
    const create = vi.fn(
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      async ({ url }: { active?: boolean; url: string }) => ({ url }),
    )
    setChromeApi({ tabs: { create } })

    const useCases = createSavedTabsUseCases({
      resolveActive: () => false,
    })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const urlRecordId = 'url-1' as unknown as Parameters<
      typeof useCases.openSavedUrl
    >[0]['urlRecordId']
    await useCases.openSavedUrl({
      origin: 'click',
      settings: {
        removeTabAfterExternalDrop: false,
        removeTabAfterOpen: false,
      },
      urlRecordId,
    })

    expect(create).toHaveBeenCalledWith({
      active: false,
      url: 'https://example.com/a',
    })
  })
})
