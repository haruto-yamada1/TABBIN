import { describe, expect, it, vi } from 'vitest'

import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'

import { createChromeSavedTabsSearchHistory } from './ChromeSavedTabsSearchHistory'

describe('search history storage', () => {
  it('persists recent searches, deduplicates and removes individual entries across pages', async () => {
    const values: Record<string, unknown> = {}
    let pending = Promise.resolve()
    const storage = {
      get: async (key: string) => ({ [key]: values[key] }),
      set: async (value: Record<string, unknown>) => {
        Object.assign(values, value)
      },
    }
    const runExclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
      const result = pending.then(operation)
      pending = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    }
    const first = createChromeSavedTabsSearchHistory({ storage, runExclusive })
    const second = createChromeSavedTabsSearchHistory({ storage, runExclusive })
    await Promise.all([
      first.record(' youtube ご飯 '),
      second.record('太郎 ご飯'),
    ])
    expect(await first.read()).toEqual(['太郎 ご飯', 'youtube ご飯'])
    await first.record('youtube ご飯')
    expect(await second.read()).toEqual(['youtube ご飯', '太郎 ご飯'])
    await second.remove('youtube ご飯')
    expect(await first.read()).toEqual(['太郎 ご飯'])
  })

  it('does not overwrite malformed history or hide storage failures', async () => {
    let raw: unknown = 'invalid'
    const storage = {
      get: async (key: string) => ({ [key]: raw }),
      set: async () => {
        throw new Error('write failed')
      },
    }
    const port = createChromeSavedTabsSearchHistory({
      storage,
      runExclusive: async (operation) => operation(),
    })
    await expect(port.read()).rejects.toBeInstanceOf(Error)
    await expect(port.record('new')).rejects.toBeInstanceOf(Error)
    expect(raw).toBe('invalid')
    raw = []
    await expect(port.record('new')).rejects.toThrow('write failed')
  })

  it('orders a deletion after a pending automatic save of a previously absent query', async () => {
    vi.useFakeTimers()
    try {
      const state: Record<string, unknown> = {}
      const storage = {
        get: async (key: string) => ({ [key]: state[key] }),
        set: async (value: Record<string, unknown>) => {
          Object.assign(state, value)
        },
      }
      const port = createChromeSavedTabsSearchHistory({
        storage,
        runExclusive: async (operation) => operation(),
      })
      const controller = new AbortController()
      const scheduled = port.schedule('youtube', controller.signal)
      const removal = port.remove('youtube')
      await vi.advanceTimersByTimeAsync(1200)
      await expect(scheduled).resolves.toEqual(['youtube'])
      await expect(removal).resolves.toEqual([])
      expect(state.savedTabsSearchHistory).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds the query lock until an in-flight write finishes before deleting', async () => {
    vi.useFakeTimers()
    try {
      const state: Record<string, unknown> = {}
      let releaseWrite!: () => void
      let reportWrite!: () => void
      const writeStarted = new Promise<void>((resolve) => {
        reportWrite = resolve
      })
      const writeGate = new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
      let firstWrite = true
      const storage = {
        get: async (key: string) => ({ [key]: state[key] }),
        set: async (value: Record<string, unknown>) => {
          if (firstWrite) {
            firstWrite = false
            reportWrite()
            await writeGate
          }
          Object.assign(state, value)
        },
      }
      const pending = new Map<string, Promise<void>>()
      const runForQuery = async <T>(
        query: string,
        _signal: AbortSignal | undefined,
        operation: () => Promise<T>,
      ): Promise<T> => {
        const previous = pending.get(query) ?? Promise.resolve()
        let release!: () => void
        const current = new Promise<void>((resolve) => {
          release = resolve
        })
        pending.set(query, current)
        await previous
        try {
          return await operation()
        } finally {
          release()
        }
      }
      const port = createChromeSavedTabsSearchHistory({
        storage,
        runForQuery,
        runExclusive: async (operation) => operation(),
      })
      const controller = new AbortController()
      const scheduled = port.schedule('youtube', controller.signal)
      await vi.advanceTimersByTimeAsync(1200)
      await writeStarted
      const removal = port.remove('youtube')
      controller.abort()
      releaseWrite()
      await expect(scheduled).resolves.toEqual(['youtube'])
      await expect(removal).resolves.toEqual([])
      expect(state.savedTabsSearchHistory).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('records an actively typed query even if it was evicted by the history limit', async () => {
    vi.useFakeTimers()
    try {
      const original = Array.from(
        { length: 50 },
        (_, index) => `query-${index}`,
      )
      const state: Record<string, unknown> = {
        savedTabsSearchHistory: original,
      }
      const storage = {
        get: async (key: string) => ({ [key]: state[key] }),
        set: async (value: Record<string, unknown>) => {
          Object.assign(state, value)
        },
      }
      const port = createChromeSavedTabsSearchHistory({
        storage,
        runForQuery: async (_query, _signal, operation) => operation(),
        runExclusive: async (operation) => operation(),
      })
      const controller = new AbortController()
      const scheduled = port.schedule('query-49', controller.signal)
      state.savedTabsSearchHistory = ['new query', ...original.slice(0, 49)]
      await vi.advanceTimersByTimeAsync(1200)
      expect(await scheduled).toContain('query-49')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores empty input, bounds history, and only responds to relevant storage changes', async () => {
    const state: Record<string, unknown> = {}
    let changed: ChromeOnChangedListener | undefined
    const changes = {
      addListener: (listener: ChromeOnChangedListener) => {
        changed = listener
      },
      removeListener: () => {
        changed = undefined
      },
    }
    const storage = {
      get: async (key: string) => ({ [key]: state[key] }),
      set: async (value: Record<string, unknown>) => {
        Object.assign(state, value)
      },
    }
    const port = createChromeSavedTabsSearchHistory({
      storage,
      changes,
      runExclusive: async (operation) => operation(),
    })
    await port.record('   ')
    expect(state).toEqual({})
    state.savedTabsSearchHistory = Array.from(
      { length: 50 },
      (_, index) => `query-${49 - index}`,
    )
    await port.record('query-50')
    expect(await port.read()).toHaveLength(50)
    expect(await port.read()).not.toContain('query-0')
    let notifications = 0
    let removed: readonly string[] = []
    const unsubscribe = port.subscribe((value) => {
      notifications++
      removed = value
    })
    changed?.({ savedTabsSearchHistory: {} }, 'sync')
    changed?.({ unrelated: {} }, 'local')
    changed?.(
      {
        savedTabsSearchHistory: {
          oldValue: ['old', 'keep'],
          newValue: ['keep'],
        },
      },
      'local',
    )
    expect(notifications).toBe(1)
    expect(removed).toEqual(['old'])
    const full = Array.from({ length: 50 }, (_, index) => `query-${index}`)
    changed?.(
      {
        savedTabsSearchHistory: {
          oldValue: full,
          newValue: ['new', ...full.slice(0, 49)],
        },
      },
      'local',
    )
    expect(removed).toEqual([])
    unsubscribe()
    expect(changed).toBeUndefined()
  })

  it('aborts a pending read before any write when a scheduled query is cancelled', async () => {
    vi.useFakeTimers()
    try {
      let reportRead!: () => void
      const readStarted = new Promise<void>((resolve) => {
        reportRead = resolve
      })
      const storage = {
        get: async () => {
          reportRead()
          return new Promise<Record<string, unknown>>(() => {})
        },
        set: vi.fn(async () => {}),
      }
      const port = createChromeSavedTabsSearchHistory({
        storage,
        runForQuery: async (_query, _signal, operation) => operation(),
        runExclusive: async (operation) => operation(),
      })
      const controller = new AbortController()
      const result = port.schedule('youtube', controller.signal)
      const rejected = result.catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(1200)
      await readStarted
      controller.abort()
      await expect(rejected).resolves.toMatchObject({ name: 'AbortError' })
      expect(storage.set).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
