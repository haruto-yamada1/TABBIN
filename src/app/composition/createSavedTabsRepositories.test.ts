import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as persistenceRuntimeModule from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import type { ChromeStorageLocalPort } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUrlRecordRepository'
import * as chromeStorageModule from '@/lib/browser/chrome-storage'

import { createSavedTabsRepositories } from './createSavedTabsRepositories'

vi.mock(
  '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime',
  async () => {
    const actual = await vi.importActual<typeof persistenceRuntimeModule>(
      '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime',
    )
    return {
      ...actual,
      getPersistenceStorageLocal: vi.fn(),
    }
  },
)

vi.mock('@/lib/browser/chrome-storage', async () => {
  const actual = await vi.importActual<typeof chromeStorageModule>(
    '@/lib/browser/chrome-storage',
  )
  return {
    ...actual,
    getChromeStorageLocal: vi.fn(),
  }
})

const getPersistenceStorageLocal =
  persistenceRuntimeModule.getPersistenceStorageLocal
const getChromeStorageLocal = chromeStorageModule.getChromeStorageLocal

type StorageState = Record<string, unknown>

const createPort = (state: StorageState): ChromeStorageLocalPort => {
  /* eslint-disable typescript/require-await */
  return {
    get: vi.fn(async (key: string) => ({ [key]: state[key] })),
    remove: vi.fn(async (key: string) => {
      // dynamic key 削除は storage エミュレーション上不可避免

      delete state[key]
    }),
    set: vi.fn(async (value: Record<string, unknown>) => {
      Object.assign(state, value)
    }),
  }
  /* eslint-enable typescript/require-await */
}

const buildChromeStorageLocal = (state: StorageState) =>
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

describe('createSavedTabsRepositories (app/composition)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('chrome.storage.local が利用可能な環境', () => {
    it('4 つの repository interface を返し、それぞれが 4 関数を持つ', () => {
      const state: StorageState = {}
      const local = buildChromeStorageLocal(state)
      vi.mocked(getPersistenceStorageLocal).mockReturnValue(local)
      vi.mocked(getChromeStorageLocal).mockReturnValue(local)

      const repositories = createSavedTabsRepositories()

      expect(repositories.tabGroupRepository.findAll).toBeTypeOf('function')
      expect(repositories.tabGroupRepository.findById).toBeTypeOf('function')
      expect(repositories.tabGroupRepository.saveAll).toBeTypeOf('function')
      expect(repositories.tabGroupRepository.removeByIds).toBeTypeOf('function')

      expect(repositories.urlRecordRepository.findAll).toBeTypeOf('function')
      expect(repositories.urlRecordRepository.findById).toBeTypeOf('function')
      expect(repositories.urlRecordRepository.saveAll).toBeTypeOf('function')
      expect(repositories.urlRecordRepository.removeByIds).toBeTypeOf(
        'function',
      )

      expect(repositories.parentCategoryRepository.findAll).toBeTypeOf(
        'function',
      )
      expect(repositories.parentCategoryRepository.findById).toBeTypeOf(
        'function',
      )
      expect(repositories.parentCategoryRepository.saveAll).toBeTypeOf(
        'function',
      )
      expect(repositories.parentCategoryRepository.removeByIds).toBeTypeOf(
        'function',
      )

      expect(repositories.customProjectRepository.findAll).toBeTypeOf(
        'function',
      )
      expect(repositories.customProjectRepository.findById).toBeTypeOf(
        'function',
      )
      expect(repositories.customProjectRepository.saveAll).toBeTypeOf(
        'function',
      )
      expect(repositories.customProjectRepository.removeByIds).toBeTypeOf(
        'function',
      )
    })

    it('findAll / saveAll を通じて chrome.storage.local の get / set を使う', async () => {
      const state: StorageState = {
        'tabbin:savedTabs': [],
        'tabbin:urls': [],
        'tabbin:parentCategories': [],
        'tabbin:customProjects': [],
      }
      const port = createPort(state)
      const local = {
        get: port.get,
        remove: port.remove,
        set: port.set,
        // eslint-disable-next-line typescript/no-explicit-any
      } as any
      vi.mocked(getPersistenceStorageLocal).mockReturnValue(local)
      vi.mocked(getChromeStorageLocal).mockReturnValue(local)

      const repositories = createSavedTabsRepositories()

      await Promise.all([
        repositories.tabGroupRepository.findAll(),
        repositories.urlRecordRepository.findAll(),
        repositories.parentCategoryRepository.findAll(),
        repositories.customProjectRepository.findAll(),
      ])
      await repositories.tabGroupRepository.saveAll([])

      expect(port.get).toHaveBeenCalled()
      expect(port.set).toHaveBeenCalled()
    })

    it('cutover 後も userSettings は domain legacy gate ではなく raw settings port を使う', async () => {
      const gatedPort = createPort({})
      vi.mocked(gatedPort.get).mockRejectedValueOnce(
        new Error('legacy route is unavailable after cutover'),
      )
      const settingsPort = createPort({})
      vi.mocked(getPersistenceStorageLocal).mockReturnValue({
        get: gatedPort.get,
        remove: gatedPort.remove,
        set: gatedPort.set,
        // eslint-disable-next-line typescript/no-explicit-any
      } as any)
      vi.mocked(getChromeStorageLocal).mockReturnValue({
        get: settingsPort.get,
        remove: settingsPort.remove,
        set: settingsPort.set,
        // eslint-disable-next-line typescript/no-explicit-any
      } as any)

      const repositories = createSavedTabsRepositories()

      await expect(
        repositories.userSettingsRepository.findAll(),
      ).resolves.toBeDefined()
      expect(settingsPort.get).toHaveBeenCalledWith('userSettings')
      expect(gatedPort.get).not.toHaveBeenCalled()
    })
  })

  describe('chrome.storage.local が利用できない環境', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      vi.mocked(getPersistenceStorageLocal).mockReturnValue(null)
      vi.mocked(getChromeStorageLocal).mockReturnValue(null)
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('createSavedTabsRepositories 呼び出しが SavedTabsRepositoryUnavailableError を投げる (eager 検出)', () => {
      expect(() => createSavedTabsRepositories()).toThrow(
        SavedTabsRepositoryUnavailableError,
      )
    })
  })
})
