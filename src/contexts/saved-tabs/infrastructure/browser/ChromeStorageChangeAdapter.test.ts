import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChromeStorageChangeAdapter } from './ChromeStorageChangeAdapter'
import type {
  ChromeApiLike,
  ChromeStorageOnChangedLike,
} from './ChromeStorageChangeAdapter'

type ChromeOnChangedListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

type MockOnChanged = ChromeStorageOnChangedLike & {
  emit: (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void
  listeners: Set<ChromeOnChangedListener>
}

const createMockOnChanged = (): MockOnChanged => {
  const listeners = new Set<ChromeOnChangedListener>()
  const emit = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    for (const listener of listeners) {
      listener(changes, area)
    }
  }
  return {
    addListener: vi.fn((listener: ChromeOnChangedListener) => {
      listeners.add(listener)
    }),
    emit,
    listeners,
    removeListener: vi.fn((listener: ChromeOnChangedListener) => {
      listeners.delete(listener)
    }),
  }
}

describe('createChromeStorageChangeAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('chrome.storage.onChanged の listener を register / unregister する', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })

    const unsubscribe = adapter.subscribe(() => {})

    expect(onChanged.addListener).toHaveBeenCalledTimes(1)

    unsubscribe()

    expect(onChanged.removeListener).toHaveBeenCalledTimes(1)
  })

  it('chrome.storage.StorageChange を port DTO に変換して listener へ渡す', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        savedTabs: { newValue: [{ id: 'group-1' }], oldValue: [] },
        parentCategories: { newValue: [{ id: 'parent-1' }], oldValue: [] },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      { key: 'savedTabs', newValue: [{ id: 'group-1' }], oldValue: [] },
      {
        key: 'parentCategories',
        newValue: [{ id: 'parent-1' }],
        oldValue: [],
      },
    ])
  })

  it('saved-tabs 対象外の storage キーは除外する', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        // port 仕様にないキー
        someExtensionKey: { newValue: 1, oldValue: 0 },
        // port 仕様のキー
        savedTabs: { newValue: [], oldValue: [] },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      { key: 'savedTabs', newValue: [], oldValue: [] },
    ])
  })

  it('areaName が一致しない変更は listener へ伝播しない', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter(
      { getOnChanged: () => onChanged },
      { areaName: 'sync' },
    )
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        savedTabs: { newValue: [], oldValue: [] },
      },
      'local',
    )

    expect(listener).not.toHaveBeenCalled()
  })

  it('chrome API がない環境では no-op の unsubscribe を返す', () => {
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => null,
    })
    const listener = vi.fn()

    const unsubscribe = adapter.subscribe(listener)
    expect(unsubscribe).toBeTypeOf('function')

    // 解除呼び出しも例外を投げない
    expect(() => unsubscribe()).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })

  it('deps 未指定でも globalThis.chrome.storage.onChanged 経由で listener を解決する', () => {
    const onChanged = createMockOnChanged()
    const previousChrome = (globalThis as { chrome?: unknown }).chrome
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: { onChanged },
    }
    try {
      const adapter = createChromeStorageChangeAdapter()
      const listener = vi.fn()

      adapter.subscribe(listener)
      onChanged.emit(
        { customProjectOrder: { newValue: ['a'], oldValue: [] } },
        'local',
      )

      expect(listener).toHaveBeenCalledWith([
        { key: 'customProjectOrder', newValue: ['a'], oldValue: [] },
      ])
    } finally {
      ;(globalThis as { chrome?: unknown }).chrome = previousChrome
    }
  })

  it('deps 未指定で globalThis.chrome も無い場合は no-op で動く', () => {
    const previousChrome = (globalThis as { chrome?: unknown }).chrome
    delete (globalThis as { chrome?: unknown }).chrome
    try {
      const adapter = createChromeStorageChangeAdapter()
      const listener = vi.fn()

      const unsubscribe = adapter.subscribe(listener)

      expect(unsubscribe).toBeTypeOf('function')
      expect(listener).not.toHaveBeenCalled()
    } finally {
      ;(globalThis as { chrome?: unknown }).chrome = previousChrome
    }
  })

  it('getApi から chrome.storage.onChanged 経由で listener を解決する', () => {
    const onChanged = createMockOnChanged()
    const api: ChromeApiLike = {
      storage: { onChanged },
    }
    const adapter = createChromeStorageChangeAdapter({ getApi: () => api })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit({ customProjects: { newValue: [], oldValue: [] } }, 'local')

    expect(listener).toHaveBeenCalledWith([
      { key: 'customProjects', newValue: [], oldValue: [] },
    ])
  })

  it('getApi が undefined を返す環境では no-op の unsubscribe を返す', () => {
    const adapter = createChromeStorageChangeAdapter({
      getApi: () => undefined,
    })
    const listener = vi.fn()

    const unsubscribe = adapter.subscribe(listener)

    expect(unsubscribe).toBeTypeOf('function')
    expect(listener).not.toHaveBeenCalled()
  })

  it('複数回 subscribe しても listener は独立して解除できる', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    const unsubscribeA = adapter.subscribe(listenerA)
    adapter.subscribe(listenerB)
    onChanged.emit({ savedTabs: { newValue: [1], oldValue: [] } }, 'local')
    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(1)

    unsubscribeA()
    onChanged.emit({ savedTabs: { newValue: [2], oldValue: [1] } }, 'local')
    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(2)
  })
})
