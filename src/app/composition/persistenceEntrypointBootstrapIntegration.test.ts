import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBackgroundSavedTabsDataPlaneForTesting } from '@/app/composition/backgroundSavedTabsDataPlane'
import {
  getPersistenceBootstrapRuntime,
  resetPersistenceBootstrapRuntimeForTesting,
} from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { exportSettings } from '@/features/options/lib/import-export/legacy/LegacyImportExportFlows.fixture'
import { removeUrlRecordsFromStorage } from '@/lib/background/url-storage'

type StorageState = Record<string, unknown>

const createChromeStorage = (events: string[]) => {
  const state: StorageState = {}
  const get = vi.fn(async (keys?: unknown) => {
    let requestedKeys: string[] = []
    if (typeof keys === 'string') {
      requestedKeys = [keys]
    } else if (Array.isArray(keys)) {
      requestedKeys = keys.map(String)
    } else if (keys && typeof keys === 'object') {
      requestedKeys = Object.keys(keys)
    }
    events.push(
      requestedKeys.length === 1 && requestedKeys[0] === 'userSettings'
        ? 'settings-get'
        : 'domain-get',
    )
    if (typeof keys === 'string') {
      return { [keys]: state[keys] }
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, state[String(key)]]))
    }
    if (keys && typeof keys === 'object') {
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          key in state ? state[key] : fallback,
        ]),
      )
    }
    return { ...state }
  })
  const set = vi.fn(async (values: StorageState) => {
    events.push('storage-set')
    Object.assign(state, values)
  })

  return {
    local: {
      clear: vi.fn(async () => {
        for (const key of Object.keys(state)) {
          delete state[key]
        }
      }),
      get,
      getBytesInUse: vi.fn(async () => 0),
      getKeys: vi.fn(async () => Object.keys(state)),
      remove: vi.fn(async (keys: string | readonly string[]) => {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          delete state[key]
        }
      }),
      set,
    },
  }
}

const setupRuntime = (events: string[]) => {
  const storage = createChromeStorage(events)
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: 'test' }) },
    storage,
  })
  resetBackgroundSavedTabsDataPlaneForTesting()
  resetPersistenceBootstrapRuntimeForTesting()
  const runtime = getPersistenceBootstrapRuntime()
  const ready = vi.spyOn(runtime.bootstrap, 'ready')
  ready.mockImplementation(async () => {
    events.push('ready')
  })
  return { ready, storage }
}

describe('production entrypoint persistence readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetBackgroundSavedTabsDataPlaneForTesting()
    resetPersistenceBootstrapRuntimeForTesting()
    vi.unstubAllGlobals()
  })

  it('background-first URL mutation enters PersistenceBootstrap before raw storage', async () => {
    const events: string[] = []
    const { ready, storage } = setupRuntime(events)

    await expect(removeUrlRecordsFromStorage(['missing-url'])).resolves.toBe(0)

    expect(ready).toHaveBeenCalled()
    expect(storage.local.get).toHaveBeenCalled()
    expect(events.indexOf('ready')).toBeLessThan(events.indexOf('domain-get'))
  })

  it('options-first export enters PersistenceBootstrap before domain storage reads', async () => {
    const events: string[] = []
    const { ready, storage } = setupRuntime(events)

    await expect(exportSettings()).resolves.toMatchObject({
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })

    expect(ready).toHaveBeenCalled()
    expect(storage.local.get).toHaveBeenCalled()
    expect(events.indexOf('ready')).toBeLessThan(events.indexOf('domain-get'))
  })
})
