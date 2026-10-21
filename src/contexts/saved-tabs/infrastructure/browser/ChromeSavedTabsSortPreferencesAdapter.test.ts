import { describe, expect, it, vi } from 'vitest'

import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'

import { createChromeSavedTabsSortPreferences } from './ChromeSavedTabsSortPreferencesAdapter'

const createStorage = () => {
  const values: Record<string, unknown> = {
    userSettings: { language: 'en' },
    savedTabs: ['unrelated legacy data'],
  }
  const listeners = new Set<ChromeOnChangedListener>()
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (value: Record<string, unknown>) => {
      Object.assign(values, value)
    }),
  }
  const changes = {
    addListener: (listener: ChromeOnChangedListener) => listeners.add(listener),
    removeListener: (listener: ChromeOnChangedListener) =>
      listeners.delete(listener),
  }
  return {
    changes,
    listeners,
    local,
    values,
    createPort: () =>
      createChromeSavedTabsSortPreferences({
        getOnChanged: () => changes,
        getStorageLocal: () => local,
      }),
    emit: (...args: Parameters<ChromeOnChangedListener>) => {
      for (const listener of listeners) {
        listener(...args)
      }
    },
  }
}

describe('Chrome saved-tabs sort preferences', () => {
  it('persists each scope and ID independently across port recreation', async () => {
    const storage = createStorage()
    const port = storage.createPort()
    const id = 'same:id/日本語'

    await port.write('category', id, 'asc')
    await port.write('domain', id, 'desc')
    await port.write('project', id, 'asc')
    await port.write('domain', 'other', 'default')

    const reopened = storage.createPort()
    await expect(reopened.read('category', id)).resolves.toBe('asc')
    await expect(reopened.read('domain', id)).resolves.toBe('desc')
    await expect(reopened.read('project', id)).resolves.toBe('asc')
    await expect(reopened.read('domain', 'other')).resolves.toBe('default')
    expect(storage.values).toStrictEqual({
      userSettings: { language: 'en' },
      savedTabs: ['unrelated legacy data'],
      'savedTabsSort:category:same%3Aid%2F%E6%97%A5%E6%9C%AC%E8%AA%9E': 'asc',
      'savedTabsSort:domain:same%3Aid%2F%E6%97%A5%E6%9C%AC%E8%AA%9E': 'desc',
      'savedTabsSort:project:same%3Aid%2F%E6%97%A5%E6%9C%AC%E8%AA%9E': 'asc',
      'savedTabsSort:domain:other': 'default',
    })
    expect(
      storage.local.set.mock.calls.every(
        ([value]) => Object.keys(value).length === 1,
      ),
    ).toBe(true)
  })

  it.each([undefined, null, false, 1, 'invalid', [], { order: 'asc' }])(
    'loads missing or invalid preference %j as default without repairing storage',
    async (value) => {
      const storage = createStorage()
      storage.values['savedTabsSort:domain:id'] = value

      await expect(storage.createPort().read('domain', 'id')).resolves.toBe(
        'default',
      )
      expect(storage.local.set).not.toHaveBeenCalled()
    },
  )

  it('synchronizes only the matching local key and unsubscribes', () => {
    const storage = createStorage()
    const listener = vi.fn()
    const unsubscribe = storage.createPort().subscribe('domain', 'id', listener)

    storage.emit({ 'savedTabsSort:domain:id': { newValue: 'asc' } }, 'sync')
    storage.emit({ 'savedTabsSort:project:id': { newValue: 'desc' } }, 'local')
    storage.emit(
      { 'savedTabsSort:domain:other': { newValue: 'desc' } },
      'local',
    )
    expect(listener).not.toHaveBeenCalled()

    storage.emit({ 'savedTabsSort:domain:id': { newValue: 'asc' } }, 'local')
    storage.emit({ 'savedTabsSort:domain:id': { newValue: 'desc' } }, 'local')
    storage.emit(
      { 'savedTabsSort:domain:id': { newValue: 'invalid' } },
      'local',
    )
    storage.emit({ 'savedTabsSort:domain:id': { oldValue: 'desc' } }, 'local')
    expect(listener.mock.calls).toStrictEqual([
      ['asc'],
      ['desc'],
      ['default'],
      ['default'],
    ])

    unsubscribe()
    expect(storage.listeners.size).toBe(0)
    storage.emit({ 'savedTabsSort:domain:id': { newValue: 'asc' } }, 'local')
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it.each([undefined, null, false, 1, 'invalid', [], { order: 'asc' }])(
    'rejects runtime-invalid write value %j before mutation',
    async (value) => {
      const storage = createStorage()
      const port = storage.createPort()

      await expect(
        Reflect.apply(port.write, port, ['domain', 'id', value]),
      ).rejects.toThrow(TypeError)
      expect(storage.local.set).not.toHaveBeenCalled()
    },
  )

  it('throws when storage or change events are unavailable', async () => {
    const port = createChromeSavedTabsSortPreferences({
      getOnChanged: () => null,
      getStorageLocal: () => null,
    })

    await expect(port.read('domain', 'id')).rejects.toThrow(/unavailable/u)
    await expect(port.write('domain', 'id', 'asc')).rejects.toThrow(
      /unavailable/u,
    )
    expect(() => port.subscribe('domain', 'id', vi.fn())).toThrow(
      /unavailable/u,
    )
  })

  it('propagates storage read and write rejections', async () => {
    const storage = createStorage()
    const failure = new Error('storage rejected the operation')
    storage.local.get.mockRejectedValueOnce(failure)
    storage.local.set.mockRejectedValueOnce(failure)
    const port = storage.createPort()

    await expect(port.read('domain', 'id')).rejects.toBe(failure)
    await expect(port.write('domain', 'id', 'asc')).rejects.toBe(failure)
  })

  it('uses the shared browser storage wrappers without injected dependencies', async () => {
    const storage = createStorage()
    vi.stubGlobal('browser', {
      storage: { local: storage.local, onChanged: storage.changes },
    })

    try {
      const port = createChromeSavedTabsSortPreferences()
      await port.write('project', 'id', 'desc')
      await expect(port.read('project', 'id')).resolves.toBe('desc')
      const listener = vi.fn()
      const unsubscribe = port.subscribe('project', 'id', listener)
      storage.emit({ 'savedTabsSort:project:id': { newValue: 'asc' } }, 'local')
      expect(listener).toHaveBeenCalledWith('asc')
      unsubscribe()
      expect(storage.listeners.size).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
