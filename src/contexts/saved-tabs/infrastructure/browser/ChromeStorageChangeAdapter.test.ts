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
    vi.unstubAllGlobals()
  })

  it('listener を register / unregister する', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const unsubscribe = adapter.subscribe(() => {})

    expect(onChanged.addListener).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(onChanged.removeListener).toHaveBeenCalledTimes(1)
  })

  it('旧 Chrome Storage の domain change は settings listener に伝播しない', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listener = vi.fn()
    adapter.subscribe(listener)

    onChanged.emit(
      {
        savedTabs: {
          newValue: [{ id: 'legacy-group', domain: 'example.com' }],
        },
        urls: { newValue: [{ id: 'legacy-url', url: 'https://example.com' }] },
        parentCategories: { newValue: [] },
        customProjects: { newValue: [] },
        customProjectOrder: { newValue: [] },
        aiChatConversations: { newValue: [] },
        savedAnalyticsViews: { newValue: [] },
      },
      'local',
    )

    expect(listener).not.toHaveBeenCalled()
  })

  it('settings と旧 domain change が同時に届いても settings のみ通知する', () => {
    const onChanged = createMockOnChanged()
    const listener = vi.fn()
    createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    }).subscribe(listener)

    onChanged.emit(
      {
        savedTabs: { newValue: [] },
        userSettings: {
          oldValue: { language: 'ja' },
          newValue: { language: 'en', removeTabAfterOpen: true },
        },
        someExtensionKey: { newValue: 1 },
      },
      'local',
    )

    expect(listener).toHaveBeenCalledExactlyOnceWith([
      {
        key: 'userSettings',
        kind: 'parsed',
        oldValue: { language: 'ja' },
        payload: [{ language: 'en', removeTabAfterOpen: true }],
      },
    ])
  })

  it('表示・保存動作・AI 設定の全 field を保持する', () => {
    const onChanged = createMockOnChanged()
    const listener = vi.fn()
    createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    }).subscribe(listener)
    const settings = {
      language: 'ja',
      removeTabAfterOpen: true,
      removeTabAfterExternalDrop: false,
      excludePatterns: ['example.com'],
      enableCategories: true,
      autoDeletePeriod: '7days',
      showSavedTime: true,
      clickBehavior: 'saveCurrentTab',
      excludePinnedTabs: false,
      openUrlInBackground: true,
      openAllInNewWindow: false,
      confirmDeleteAll: true,
      confirmDeleteEach: false,
      fontSizePercent: 120,
      colors: { primary: '#fff' },
      ollamaModel: 'local-model',
      aiSystemPrompts: [
        {
          id: 'prompt-1',
          name: 'Default',
          template: 'Summarize',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      activeAiSystemPromptId: 'prompt-1',
    }

    onChanged.emit({ userSettings: { newValue: settings } }, 'local')

    expect(listener).toHaveBeenCalledExactlyOnceWith([
      {
        key: 'userSettings',
        kind: 'parsed',
        oldValue: undefined,
        payload: [settings],
      },
    ])
  })

  it.each([undefined, null, [], { removeTabAfterOpen: 'invalid' }])(
    '不正 settings は空 payload として通知する: %j',
    (newValue) => {
      const onChanged = createMockOnChanged()
      const listener = vi.fn()
      createChromeStorageChangeAdapter({
        getOnChanged: () => onChanged,
      }).subscribe(listener)

      onChanged.emit({ userSettings: { newValue } }, 'local')

      expect(listener).toHaveBeenCalledExactlyOnceWith([
        {
          key: 'userSettings',
          kind: 'parsed',
          oldValue: undefined,
          payload: [],
        },
      ])
    },
  )

  it('areaName が一致した変更だけ通知する', () => {
    const onChanged = createMockOnChanged()
    const listener = vi.fn()
    createChromeStorageChangeAdapter(
      { getOnChanged: () => onChanged },
      { areaName: 'sync' },
    ).subscribe(listener)

    onChanged.emit({ userSettings: { newValue: {} } }, 'local')
    expect(listener).not.toHaveBeenCalled()
    onChanged.emit({ userSettings: { newValue: {} } }, 'sync')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('deps 未指定で globalThis.chrome から listener を解決する', () => {
    const onChanged = createMockOnChanged()
    vi.stubGlobal('chrome', { storage: { onChanged } })
    const listener = vi.fn()
    createChromeStorageChangeAdapter().subscribe(listener)

    onChanged.emit({ userSettings: { newValue: { language: 'ja' } } }, 'local')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('getOnChanged は getApi より優先される', () => {
    const onChanged = createMockOnChanged()
    const getApi = vi.fn()
    createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
      getApi,
    }).subscribe(() => {})

    expect(onChanged.addListener).toHaveBeenCalledTimes(1)
    expect(getApi).not.toHaveBeenCalled()
  })

  it('getApi から listener を解決する', () => {
    const onChanged = createMockOnChanged()
    const api: ChromeApiLike = { storage: { onChanged } }
    const listener = vi.fn()
    createChromeStorageChangeAdapter({ getApi: () => api }).subscribe(listener)

    onChanged.emit({ userSettings: { newValue: {} } }, 'local')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('chrome API がない環境では no-op unsubscribe を返す', () => {
    vi.stubGlobal('chrome', undefined)
    const listener = vi.fn()
    for (const adapter of [
      createChromeStorageChangeAdapter(),
      createChromeStorageChangeAdapter({ getApi: () => undefined }),
      createChromeStorageChangeAdapter({ getApi: () => ({}) }),
      createChromeStorageChangeAdapter({ getOnChanged: () => null }),
    ]) {
      expect(() => adapter.subscribe(listener)()).not.toThrow()
    }
    expect(listener).not.toHaveBeenCalled()
  })

  it('複数 subscribe を独立して解除できる', () => {
    const onChanged = createMockOnChanged()
    const adapter = createChromeStorageChangeAdapter({
      getOnChanged: () => onChanged,
    })
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    const unsubscribeA = adapter.subscribe(listenerA)
    adapter.subscribe(listenerB)

    onChanged.emit({ userSettings: { newValue: {} } }, 'local')
    unsubscribeA()
    onChanged.emit({ userSettings: { newValue: {} } }, 'local')

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(2)
  })
})
