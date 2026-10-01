import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetPersistenceBootstrapRuntimeForTesting } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

import { createSavedTabsPresentationComposition } from './createSavedTabsUseCases'

afterEach(() => {
  resetPersistenceBootstrapRuntimeForTesting()
  vi.unstubAllGlobals()
})

describe('saved-tabs production composition', () => {
  it('loads settings through Chrome Storage and persists projects only in IndexedDB', async () => {
    const get = vi.fn(async (_key: string) => ({
      userSettings: { openUrlInBackground: true },
    }))
    const set = vi.fn()
    const create = vi.fn(async () => ({ url: 'https://example.com/' }))
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      },
    })
    vi.stubGlobal('chrome', {
      storage: { local: { get, set } },
      tabs: { create },
    })
    const { deps, useCases } = createSavedTabsPresentationComposition({
      resolveActive: () => false,
    })
    const page = await useCases.getSavedTabsPageData()
    expect(page.tabGroups).toEqual([])
    expect(page.userSettings.openUrlInBackground).toBe(true)
    await useCases.createCustomProject({ name: 'Research' })
    expect(await useCases.getCustomProjects()).toEqual([
      expect.objectContaining({ name: 'Research' }),
    ])
    await deps.browserTabPort.open({ url: 'https://example.com/' })
    expect(create).toHaveBeenCalledWith({
      active: false,
      url: 'https://example.com/',
    })
    expect(get.mock.calls.every(([key]) => key === 'userSettings')).toBe(true)
    expect(set).not.toHaveBeenCalled()
  })
})
