import { vi } from 'vitest'

import type { CustomProject } from '@/contexts/saved-tabs/public-api'
import type { UserSettings } from '@/types/storage'

type StorageStore = Record<string, unknown>

const clone = <T>(value: T): T => {
  if (value === undefined) {
    return value
  }
  return structuredClone(value)
}

const readStorageByKeys = (
  store: StorageStore,
  keys?: string | string[] | Record<string, unknown>,
) => {
  if (keys === undefined) {
    return clone(store)
  }

  if (typeof keys === 'string') {
    return { [keys]: clone(store[keys]) }
  }

  if (Array.isArray(keys)) {
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      result[key] = clone(store[key])
    }
    return result
  }

  const result: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(keys)) {
    result[key] = store[key] === undefined ? clone(fallback) : clone(store[key])
  }
  return result
}

const createChromeMock = (
  initialStore: StorageStore = {},
  options: {
    manifestVersion?: string
    failGet?: boolean
  } = {},
) => {
  const store = clone(initialStore)

  const get = vi.fn(
    async (keys?: string | string[] | Record<string, unknown>) => {
      await Promise.resolve()
      if (options.failGet) {
        throw new Error('storage get failed')
      }
      return readStorageByKeys(store, keys)
    },
  )

  const set = vi.fn(async (next: Record<string, unknown>) => {
    await Promise.resolve()
    for (const [key, value] of Object.entries(next)) {
      store[key] = clone(value)
    }
  })

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: { get, set },
      },
      i18n: {
        getUILanguage: () => 'ja',
      },
      runtime: {
        getManifest: () => ({ version: options.manifestVersion ?? '9.9.9' }),
      },
    },
  })

  return { store, get, set }
}

const buildFullUserSettings = (
  override: Partial<UserSettings> = {},
): UserSettings => ({
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: ['existing-pattern'],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
  ollamaModel: '',
  ...override,
})

const buildCustomProject = (
  override: Partial<CustomProject> = {},
): CustomProject => ({
  id: 'project-1',
  name: 'Project 1',
  projectKeywords: {
    titleKeywords: [],
    urlKeywords: [],
    domainKeywords: [],
  },
  urlIds: [],
  categories: [],
  createdAt: 1,
  updatedAt: 1,
  ...override,
})

export { buildCustomProject, buildFullUserSettings, createChromeMock }
export type { StorageStore }
