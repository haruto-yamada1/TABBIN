// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '@/features/ai-chat/components/savedTabsChat/messages'
import type { UserSettings } from '@/types/storage'

const mocked = vi.hoisted(() => ({
  connectRuntimePort: vi.fn(),
  defaultSettings: {
    activeAiSystemPromptId: 'default-system-prompt',
    aiSystemPrompts: [
      {
        createdAt: 0,
        id: 'default-system-prompt',
        name: 'Default',
        template: 'Answer from saved tabs.',
        updatedAt: 0,
      },
    ],
    autoDeletePeriod: 'never',
    clickBehavior: 'saveSameDomainTabs',
    colors: {},
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    enableCategories: true,
    excludePatterns: ['chrome://'],
    excludePinnedTabs: true,
    ollamaModel: '',
    openAllInNewWindow: false,
    openUrlInBackground: true,
    removeTabAfterExternalDrop: true,
    removeTabAfterOpen: true,
    showSavedTime: false,
  },
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}))

vi.mock('@/lib/storage/settings', () => ({
  defaultSettings: mocked.defaultSettings,
  getUserSettings: mocked.getUserSettings,
  saveUserSettings: mocked.saveUserSettings,
}))

vi.mock('@/lib/browser/runtime', () => ({
  connectRuntimePort: mocked.connectRuntimePort,
  sendRuntimeMessage: mocked.sendRuntimeMessage,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'en',
    t: (key: string) => key,
  }),
}))

import { useSavedTabsChatController } from './useSavedTabsChatController'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const storageListeners: StorageListener[] = []
const buildConfiguredSettings = (): UserSettings => ({
  ...(mocked.defaultSettings as UserSettings),
  ollamaModel: 'llama3.2',
})

const createChromeMock = () =>
  ({
    runtime: {
      getPlatformInfo: vi.fn(
        (callback: (info: chrome.runtime.PlatformInfo) => void) => {
          callback({ arch: 'x86-64', os: 'mac' })
        },
      ),
    },
    storage: {
      onChanged: {
        addListener: vi.fn((listener: StorageListener) => {
          storageListeners.push(listener)
        }),
        removeListener: vi.fn((listener: StorageListener) => {
          const index = storageListeners.indexOf(listener)
          if (index >= 0) {
            storageListeners.splice(index, 1)
          }
        }),
      },
    },
  }) as unknown as typeof chrome

describe('useSavedTabsChatController', () => {
  beforeEach(() => {
    storageListeners.length = 0
    vi.clearAllMocks()
    mocked.connectRuntimePort.mockResolvedValue(null)
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.saveUserSettings.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', createChromeMock())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps page mode open and owns floating open state callbacks', () => {
    const onOpenChange = vi.fn()
    const page = renderHook(() => useSavedTabsChatController({ mode: 'page' }))
    const floating = renderHook(() =>
      useSavedTabsChatController({ onOpenChange }),
    )

    expect(page.result.current.layout.isOpen).toBe(true)
    expect(page.result.current.launcher.isVisible).toBe(false)
    expect(floating.result.current.launcher.isVisible).toBe(true)

    act(() => floating.result.current.launcher.handleOpen())
    expect(floating.result.current.layout.isOpen).toBe(true)
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    act(() => floating.result.current.actions.handleClose())
    expect(floating.result.current.layout.isOpen).toBe(false)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('syncs an external conversation without notifying it back to the owner', () => {
    const onMessagesChange = vi.fn()
    const firstMessages: ChatMessage[] = [
      { content: 'First', id: 'message-1', role: 'user' as const },
    ]
    const nextMessages: ChatMessage[] = [
      { content: 'Second', id: 'message-2', role: 'assistant' as const },
    ]
    const { result, rerender } = renderHook(
      ({ conversationId, initialMessages }) =>
        useSavedTabsChatController({
          conversationId,
          initialMessages,
          mode: 'page',
          onMessagesChange,
        }),
      {
        initialProps: {
          conversationId: 'conversation-1',
          initialMessages: firstMessages,
        },
      },
    )

    rerender({
      conversationId: 'conversation-2',
      initialMessages: nextMessages,
    })

    expect(result.current.messages.items).toEqual(nextMessages)
    expect(onMessagesChange).not.toHaveBeenCalled()
  })

  it('reflects local user settings changes in the controller settings group', async () => {
    const { result } = renderHook(() => useSavedTabsChatController())
    await waitFor(() => {
      expect(result.current.settings.modelName).toBe('llama3.2')
    })

    act(() => {
      storageListeners[0]?.(
        {
          userSettings: {
            newValue: { ...buildConfiguredSettings(), ollamaModel: 'qwen3' },
          },
        },
        'local',
      )
    })

    expect(result.current.settings.modelName).toBe('qwen3')
  })

  it('commits only stream start and completion', async () => {
    const onMessagesChange = vi.fn()
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)
    const { result } = renderHook(() =>
      useSavedTabsChatController({ onMessagesChange }),
    )
    await waitFor(() => expect(result.current.status.isConfigured).toBe(true))

    act(() => result.current.actions.handleSelectSuggestion('Compare tabs'))
    await waitFor(() => expect(onMessagesChange).toHaveBeenCalledTimes(1))

    act(() => {
      handlePortMessage?.({
        reasoning: 'Working',
        toolTraces: [],
        type: 'step',
      })
    })
    expect(onMessagesChange).toHaveBeenCalledTimes(1)

    act(() => {
      handlePortMessage?.({
        answer: 'Done',
        charts: [],
        reasoning: 'Complete',
        toolTraces: [],
        type: 'complete',
      })
    })
    await waitFor(() => expect(onMessagesChange).toHaveBeenCalledTimes(2))
    expect(result.current.messages.items.at(-1)?.content).toBe('Done')
  })

  it('suppresses reset disconnect errors and ignores stale stream completion', async () => {
    let handleDisconnect: (() => void) | undefined
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(() => handleDisconnect?.()),
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => {
          handleDisconnect = listener
        }),
      },
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)
    const { result } = renderHook(() => useSavedTabsChatController())
    await waitFor(() => expect(result.current.status.isConfigured).toBe(true))

    act(() => result.current.actions.handleSelectSuggestion('Compare tabs'))
    await waitFor(() => expect(port.postMessage).toHaveBeenCalled())
    act(() => result.current.actions.handleCreateConversation())

    expect(port.disconnect).toHaveBeenCalled()
    expect(result.current.messages.items).toEqual([])
    expect(result.current.errors.chatMessage).toBe('')

    act(() => {
      handlePortMessage?.({
        answer: 'Stale answer',
        charts: [],
        reasoning: 'Late completion',
        toolTraces: [],
        type: 'complete',
      })
    })
    expect(result.current.messages.items).toEqual([])
    expect(result.current.errors.chatMessage).toBe('')
  })

  it('disconnects the previous conversation stream and ignores its completion', async () => {
    const onMessagesChange = vi.fn()
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)
    const nextMessages: ChatMessage[] = [
      { content: 'Conversation B', id: 'message-b', role: 'user' },
    ]
    const { result, rerender } = renderHook(
      ({ conversationId, initialMessages }) =>
        useSavedTabsChatController({
          conversationId,
          initialMessages,
          mode: 'page',
          onMessagesChange,
        }),
      {
        initialProps: {
          conversationId: 'conversation-a',
          initialMessages: [] as ChatMessage[],
        },
      },
    )
    await waitFor(() => expect(result.current.status.isConfigured).toBe(true))

    act(() => result.current.actions.handleSelectSuggestion('Question A'))
    await waitFor(() => expect(port.postMessage).toHaveBeenCalled())
    onMessagesChange.mockClear()

    rerender({
      conversationId: 'conversation-b',
      initialMessages: nextMessages,
    })

    expect(port.disconnect).toHaveBeenCalledOnce()
    expect(result.current.messages.items).toEqual(nextMessages)
    expect(onMessagesChange).not.toHaveBeenCalled()

    act(() => {
      handlePortMessage?.({
        answer: 'Late answer from A',
        charts: [],
        reasoning: 'Late completion',
        toolTraces: [],
        type: 'complete',
      })
    })
    expect(result.current.messages.items).toEqual(nextMessages)
    expect(onMessagesChange).not.toHaveBeenCalled()
  })

  it('disconnects a port that resolves after its conversation was reset', async () => {
    let resolvePort: ((port: unknown) => void) | undefined
    mocked.connectRuntimePort.mockImplementation(
      async () =>
        new Promise((resolve) => {
          resolvePort = resolve
        }),
    )
    const port = {
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      postMessage: vi.fn(),
    }
    const { result } = renderHook(() => useSavedTabsChatController())
    await waitFor(() => expect(result.current.status.isConfigured).toBe(true))

    act(() => result.current.actions.handleSelectSuggestion('Question A'))
    await waitFor(() => expect(resolvePort).toBeTypeOf('function'))
    act(() => result.current.actions.handleCreateConversation())
    await act(async () => {
      resolvePort?.(port)
      await Promise.resolve()
    })

    expect(port.disconnect).toHaveBeenCalledOnce()
    expect(port.postMessage).not.toHaveBeenCalled()
    expect(mocked.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(result.current.messages.items).toEqual([])
  })
})
