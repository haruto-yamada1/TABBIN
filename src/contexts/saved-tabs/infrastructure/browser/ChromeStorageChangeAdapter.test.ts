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
        savedTabs: {
          newValue: [
            {
              id: 'group-1',
              domain: 'example.com',
              urlIds: [],
            },
          ],
          oldValue: [],
        },
        parentCategories: {
          newValue: [
            {
              id: 'parent-1',
              name: 'Work',
              domains: [],
              domainNames: [],
            },
          ],
          oldValue: [],
        },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      {
        key: 'savedTabs',
        kind: 'parsed',
        oldValue: [],
        payload: [
          {
            id: 'group-1',
            domain: 'example.com',
            urlIds: [],
          },
        ],
      },
      {
        key: 'parentCategories',
        kind: 'parsed',
        oldValue: [],
        payload: [
          {
            id: 'parent-1',
            name: 'Work',
            domains: [],
            domainNames: [],
          },
        ],
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
      { key: 'savedTabs', kind: 'parsed', oldValue: [], payload: [] },
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
        {
          key: 'customProjectOrder',
          kind: 'parsed',
          oldValue: [],
          payload: ['a'],
        },
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
      { key: 'customProjects', kind: 'parsed', oldValue: [], payload: [] },
    ])
  })

  it('issue #530: urls は payload を持たず noPayload として emit する', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        urls: {
          newValue: [{ id: 'url-1' }],
          oldValue: [],
        },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      {
        key: 'urls',
        kind: 'noPayload',
        oldValue: [],
        newValue: [{ id: 'url-1' }],
      },
    ])
  })

  it('issue #530: savedTabs の壊れた要素はスキップし valid な payload だけを流す', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        savedTabs: {
          newValue: [
            { id: 'group-1', domain: 'example.com' },
            // domain 欠損はスキップ
            { id: 'broken' },
          ],
          oldValue: [],
        },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      {
        key: 'savedTabs',
        kind: 'parsed',
        oldValue: [],
        payload: [{ id: 'group-1', domain: 'example.com' }],
      },
    ])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('issue #530 review P1: customProjects の legacy データに default を入れて payload 化する', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        customProjects: {
          newValue: [
            // legacy: categories / createdAt / updatedAt 無し
            { id: 'legacy-1', name: 'Legacy' },
            // 有効データ
            {
              categories: ['research'],
              createdAt: 1,
              id: 'project-1',
              name: 'Q4',
              updatedAt: 2,
              urlIds: ['url-1'],
            },
          ],
          oldValue: [],
        },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      {
        key: 'customProjects',
        kind: 'parsed',
        oldValue: [],
        payload: [
          {
            categories: [],
            createdAt: 0,
            id: 'legacy-1',
            name: 'Legacy',
            updatedAt: 0,
          },
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 2,
            urlIds: ['url-1'],
          },
        ],
      },
    ])
  })

  it('issue #530: userSettings は partial 適用としてパースされる', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        userSettings: {
          newValue: {
            removeTabAfterOpen: true,
          },
          oldValue: {},
        },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      {
        key: 'userSettings',
        kind: 'parsed',
        oldValue: {},
        payload: [{ removeTabAfterOpen: true }],
      },
    ])
  })

  it('issue #530: 配列以外の newValue は payload を空配列として emit する', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()

    adapter.subscribe(listener)
    onChanged.emit(
      {
        savedTabs: { newValue: { invalid: true }, oldValue: [] },
        parentCategories: { newValue: null, oldValue: [] },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([
      { key: 'savedTabs', kind: 'parsed', oldValue: [], payload: [] },
      { key: 'parentCategories', kind: 'parsed', oldValue: [], payload: [] },
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
