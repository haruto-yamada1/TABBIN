import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

type MockStore = Record<string, unknown>

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const createChromeMock = () => {
  const listeners: StorageListener[] = []
  const store: MockStore = {
    savedTabs: [
      {
        id: 'group-1',
        domain: 'example.com',
        urls: [
          {
            url: 'https://example.com',
            title: 'Example Domain',
            savedAt: Date.now(),
          },
        ],
        subCategories: [],
        categoryKeywords: [],
        savedAt: Date.now(),
      },
    ],
    parentCategories: [],
    customProjects: [],
    customProjectOrder: [],
    viewMode: 'domain',
    urls: [],
    userSettings: {
      removeTabAfterOpen: false,
      removeTabAfterExternalDrop: true,
      excludePatterns: [],
      enableCategories: true,
      showSavedTime: true,
      clickBehavior: 'saveWindowTabs',
      excludePinnedTabs: true,
      openUrlInBackground: true,
      openAllInNewWindow: false,
      confirmDeleteAll: true,
      confirmDeleteEach: true,
    },
  }

  const clone = <T>(value: T): T => {
    if (value === undefined) {
      return value
    }
    return structuredClone(value) as T
  }

  // eslint-disable-next-line typescript/require-await
  const get = async (keys?: string | string[] | Record<string, unknown>) => {
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
      result[key] =
        store[key] === undefined ? clone(fallback) : clone(store[key])
    }
    return result
  }
  // eslint-disable-next-line typescript/require-await
  const set = async (next: Record<string, unknown>) => {
    const changes: Record<string, chrome.storage.StorageChange> = {}

    for (const [key, value] of Object.entries(next)) {
      changes[key] = {
        oldValue: clone(store[key]),
        newValue: clone(value),
      }
      store[key] = clone(value)
    }

    for (const listener of listeners.slice()) {
      listener(changes, 'local')
    }
  }

  return {
    storage: {
      local: {
        get,
        set,
      },
      onChanged: {
        addListener(listener: StorageListener) {
          listeners.push(listener)
        },
        removeListener(listener: StorageListener) {
          const index = listeners.indexOf(listener)
          if (index >= 0) {
            listeners.splice(index, 1)
          }
        },
      },
      // eslint-disable-next-line typescript/require-await
    },
    tabs: {
      // eslint-disable-next-line typescript/require-await
      create: vi.fn(async () => ({ id: 1 })),
    },
    windows: {
      create: vi.fn(async () => ({ id: 1 })), // eslint-disable-line typescript/require-await
    },
    runtime: {
      getManifest: () => ({ version: 'test' }),
      getURL: (path: string) => `chrome-extension://mock/${path}`,
      sendMessage: vi.fn(async () => ({})), // eslint-disable-line typescript/require-await
    },
  } as unknown as typeof chrome
}

describe('SavedTabs プロファイラのベースライン', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = '<div id="app"></div>'
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      createChromeMock()
    ;(
      globalThis as typeof globalThis & {
        enableSavedTabsProfiler?: boolean
        savedTabsProfiler?: { commits: number }
      }
    ).enableSavedTabsProfiler = true
    delete (
      globalThis as typeof globalThis & {
        savedTabsProfiler?: { commits: number }
      }
    ).savedTabsProfiler
    ;(globalThis as unknown as { open: typeof window.open }).open = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    ;(
      globalThis as typeof globalThis & {
        enableSavedTabsProfiler?: boolean
      }
    ).enableSavedTabsProfiler = false
  })

  it('検索操作中のコミット回数を記録する', async () => {
    const user = userEvent.setup()
    await import('@/entrypoints/saved-tabs/main.tsx')

    document.dispatchEvent(new Event('DOMContentLoaded'))

    const searchInput = await screen.findByPlaceholderText('検索')

    await waitFor(() => {
      expect(
        (
          globalThis as typeof globalThis & {
            savedTabsProfiler?: { commits: number }
          }
        ).savedTabsProfiler,
      ).toBeDefined()
    })

    const initialCommits =
      (
        globalThis as typeof globalThis & {
          savedTabsProfiler?: { commits: number }
        }
      ).savedTabsProfiler?.commits ?? 0

    await user.type(searchInput, 'exa')
    await user.clear(searchInput)
    await user.type(searchInput, 'example')
    await user.clear(searchInput)

    await waitFor(() => {
      const commits =
        (
          globalThis as typeof globalThis & {
            savedTabsProfiler?: { commits: number }
          }
        ).savedTabsProfiler?.commits ?? 0
      expect(commits).toBeGreaterThan(initialCommits)
    })

    const finalCommits =
      (
        globalThis as typeof globalThis & {
          savedTabsProfiler?: { commits: number }
        }
      ).savedTabsProfiler?.commits ?? 0

    console.log(
      JSON.stringify(
        {
          initialCommits,
          finalCommits,
          interactionCommits: finalCommits - initialCommits,
        },
        null,
        2,
      ),
    )
  })
})
