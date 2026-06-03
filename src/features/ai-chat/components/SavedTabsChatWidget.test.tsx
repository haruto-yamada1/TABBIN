// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_CHAT_TOOL_DEFINITIONS } from '@/constants/aiChatTools'
import type { UserSettings } from '@/types/storage'

const mocked = vi.hoisted(() => ({
  connectRuntimePort: vi.fn(),
  conversationScrollButtonClick: vi.fn(),
  conversationScrollButtonVisible: false,
  getUserSettings: vi.fn(),
  language: 'en' as 'en' | 'ja',
  platformOs: 'mac',
  saveUserSettings: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  writeClipboardText: vi.fn(),
}))

vi.mock('@/lib/storage/settings', () => ({
  defaultSettings: {
    removeTabAfterOpen: true,
    removeTabAfterExternalDrop: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
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
    activeAiSystemPromptId: 'default-system-prompt',
    aiSystemPrompts: [
      {
        createdAt: 0,
        id: 'default-system-prompt',
        name: 'Default',
        template:
          'You are an assistant that answers only from tabs saved in TABBIN.',
        updatedAt: 0,
      },
    ],
    ollamaModel: '',
  },
  getUserSettings: mocked.getUserSettings,
  saveUserSettings: mocked.saveUserSettings,
}))

vi.mock('@/lib/browser/runtime', () => ({
  connectRuntimePort: mocked.connectRuntimePort,
  sendRuntimeMessage: mocked.sendRuntimeMessage,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocked.toastError,
    success: mocked.toastSuccess,
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: mocked.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(mocked.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

vi.mock('@/components/ai-elements/conversation', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/ai-elements/conversation')
  >('@/components/ai-elements/conversation')

  return {
    ...actual,
    ConversationScrollButton: ({
      'aria-label': ariaLabel,
      className,
    }: {
      'aria-label'?: string
      className?: string
    }) =>
      mocked.conversationScrollButtonVisible ? (
        <button
          aria-label={ariaLabel}
          className={className}
          data-testid='conversation-scroll-button'
          onClick={() => {
            mocked.conversationScrollButtonClick()
          }}
          type='button'
        />
      ) : null,
  }
})

import { SavedTabsChatWidget } from './SavedTabsChatWidget'

type StorageListener = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
) => void

const storageListeners: StorageListener[] = []

const createChromeMock = () =>
  ({
    runtime: {
      getPlatformInfo: vi.fn(
        (callback: (info: chrome.runtime.PlatformInfo) => void) => {
          callback({
            arch: 'x86-64',
            nacl_arch: 'x86-64',
            os: mocked.platformOs as chrome.runtime.PlatformOs,
          })
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

const buildConfiguredSettings = (): UserSettings =>
  ({
    activeAiSystemPromptId: 'default-system-prompt',
    aiSystemPrompts: [
      {
        createdAt: 0,
        id: 'default-system-prompt',
        name: 'Default',
        template:
          'You are an assistant that answers only from tabs saved in TABBIN.',
        updatedAt: 0,
      },
      {
        createdAt: 1,
        id: 'research-system-prompt',
        name: 'Research',
        template: 'Give me more comparison angles for saved tabs.',
        updatedAt: 1,
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
    ollamaModel: 'llama3.2',
    openAllInNewWindow: false,
    openUrlInBackground: true,
    removeTabAfterExternalDrop: true,
    removeTabAfterOpen: true,
    showSavedTime: false,
  }) as UserSettings

describe('SavedTabsChatWidget', () => {
  beforeEach(() => {
    storageListeners.length = 0
    vi.clearAllMocks()
    mocked.language = 'en'
    mocked.connectRuntimePort.mockResolvedValue(null)
    mocked.conversationScrollButtonVisible = false
    mocked.platformOs = 'mac'
    mocked.saveUserSettings.mockResolvedValue(undefined)
    mocked.toastError.mockReset()
    mocked.toastSuccess.mockReset()
    mocked.writeClipboardText.mockResolvedValue(undefined)
    window.localStorage.clear()
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    )
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: mocked.writeClipboardText,
      },
    })
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      createChromeMock()
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((file: Blob) => {
          if (file.type === 'text/plain') {
            return 'data:text/plain;base64,SGVsbG8='
          }

          return 'data:application/octet-stream;base64,AAAA'
        }),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('uses the shared ui button and does not leave raw button/input elements', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        './SavedTabsChatWidget.tsx',
      ),
      'utf8',
    )

    expect(source).not.toContain('<button')
  })

  it('opens the sidebar from the bottom-right launcher', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onOpenChange = vi.fn()

    render(<SavedTabsChatWidget onOpenChange={onOpenChange} />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(screen.getByLabelText('AI chat sidebar')).toBeTruthy()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByText('Chat')).toBeTruthy()
    expect(screen.getByText('Show me the tabs I added this month')).toBeTruthy()
  })

  it('renders Japanese copy when the display language is ja', async () => {
    mocked.language = 'ja'
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'AIチャットを開く',
      }),
    )

    expect(screen.getByLabelText('AIチャットサイドバー')).toBeTruthy()
    expect(screen.getByText('チャット')).toBeTruthy()
    expect(screen.getByText('今月追加したタブを教えて')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'システムプロンプト設定を開く' }),
    )

    const nameRow = await screen.findByTestId('system-prompt-name-row')

    expect(within(nameRow).getByRole('button', { name: '削除' })).toBeTruthy()
  })

  it('closes with the sidebar X button', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onOpenChange = vi.fn()

    render(<SavedTabsChatWidget onOpenChange={onOpenChange} />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(screen.getByLabelText('AI chat sidebar')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close AI chat' }))

    expect(screen.queryByLabelText('AI chat sidebar')).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('drags the sidebar width and restores it on the next render', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
      writable: true,
    })

    const { unmount } = render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const sidebar = screen.getByLabelText('AI chat sidebar')
    const resizeHandle = screen.getByLabelText('Resize the AI chat width')

    expect(sidebar.style.width).toBe('420px')

    fireEvent.pointerDown(resizeHandle, { clientX: 780 })
    fireEvent.pointerMove(window, { clientX: 700 })
    fireEvent.pointerUp(window)

    expect(sidebar.style.width).toBe('500px')
    expect(window.localStorage.getItem('tabbin-ai-chat-sidebar-width')).toBe(
      '500',
    )

    unmount()

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(screen.getByLabelText('AI chat sidebar').style.width).toBe('500px')
  })

  it('renders the resize handle as a full-height sidebar boundary', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const resizeHandle = screen.getByLabelText('Resize the AI chat width')

    expect(resizeHandle.className).toContain('self-stretch')
    expect(resizeHandle.className).not.toContain('h-9')
  })

  it('shows a text send button at narrow widths while keeping the input UI', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    window.localStorage.setItem('tabbin-ai-chat-sidebar-width', '320')

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(
      screen.getByRole('button', {
        name: 'Send',
      }),
    ).toBeTruthy()
  })

  it('keeps the intro copy and suggested prompts near the input on first render', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const intro = screen.getByTestId('ai-chat-intro')

    expect(
      within(intro).getByText('Ask questions about your saved tabs.'),
    ).toBeTruthy()
    expect(
      within(intro).getByText('Show me the tabs I added this month'),
    ).toBeTruthy()
    expect(screen.getByTestId('ai-chat-data-scope').textContent).toBe(
      'AI answers use your saved URLs, titles, categories, projects, attachments, and the selected local Ollama model.',
    )
  })

  it('anchors the input area as a bottom dock', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(
      screen.getByTestId('ai-chat-bottom-dock').className.includes('mt-auto'),
    ).toBe(true)
  })

  it('renders ConversationScrollButton in the conversation area', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.conversationScrollButtonVisible = true

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const scrollButton = screen.getByRole('button', {
      name: 'Jump to latest message',
    })

    fireEvent.click(scrollButton)

    expect(mocked.conversationScrollButtonClick).toHaveBeenCalledTimes(1)
  })

  it('contains overscroll in the conversation scroll area', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const log = screen.getByRole('log')
    const scrollContainer = log.firstElementChild

    expect(scrollContainer?.className.includes('overscroll-contain')).toBe(true)
  })

  it('keeps the chat shell as an independent scroll region', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const sidebar = screen.getByLabelText('AI chat sidebar')
    const shell = sidebar.parentElement

    expect(shell?.className.includes('h-screen')).toBe(true)
    expect(shell?.className.includes('overflow-hidden')).toBe(true)
    expect(shell?.className.includes('overscroll-none')).toBe(true)
  })

  it('does not show a model-name badge in the header', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(screen.queryByText('Ollama: llama3.2')).toBeNull()
  })

  it('centers the header title in the sidebar', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const title = screen.getByText('Chat').parentElement

    expect(title?.className.includes('absolute')).toBe(true)
    expect(title?.className.includes('inset-x-0')).toBe(true)
    expect(title?.className.includes('justify-center')).toBe(true)
  })

  it('shows the system prompt settings icon and selector on the left of the header', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    ).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Default' })).toBeTruthy()
  })

  it('places the history button to the left of system prompt settings and triggers sidebar-toggle', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onToggleHistory = vi.fn()

    render(
      <SavedTabsChatWidget
        defaultOpen
        historyVariant='sidebar-toggle'
        onToggleHistory={onToggleHistory}
      />,
    )

    const historyButton = await screen.findByRole('button', {
      name: 'Recent conversations',
    })
    const systemPromptButton = screen.getByRole('button', {
      name: 'Open system prompt settings',
    })

    expect(
      historyButton.compareDocumentPosition(systemPromptButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(historyButton)

    expect(onToggleHistory).toHaveBeenCalledTimes(1)
  })

  it('opens the list from the dropdown history button and calls the conversation select callback', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onSelectHistoryItem = vi.fn()

    render(
      <SavedTabsChatWidget
        defaultOpen
        historyItems={[
          {
            id: 'conversation-1',
            isActive: true,
            preview: 'First conversation',
            title: 'First conversation',
          },
          {
            id: 'conversation-2',
            isActive: false,
            preview: 'Another conversation',
            title: 'Another conversation',
          },
        ]}
        historyVariant='dropdown'
        onSelectHistoryItem={onSelectHistoryItem}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Recent conversations',
      }),
    )

    expect(screen.getByText('Recent conversations')).toBeTruthy()
    const conversationButton = screen.getByRole('button', {
      name: /Another conversation/,
    })
    const conversationRow = conversationButton.parentElement
    const textRows = conversationButton.querySelectorAll('p')
    const title = textRows[0]
    const preview = textRows[1]

    expect(conversationButton.className).toContain('flex-col')
    expect(conversationButton.className).toContain('items-start')
    expect(conversationButton.className).toContain('w-full')
    expect(conversationButton.className).toContain('overflow-hidden')
    expect(conversationButton.className).toContain('whitespace-normal')
    expect(conversationButton.className).not.toContain('flex-1')
    expect(conversationRow?.className).toContain('min-w-0')
    expect(conversationRow?.className).toContain('grid')
    expect(conversationRow?.className).toContain(
      'grid-cols-[minmax(0,1fr)_auto]',
    )
    expect(title?.className).toContain('w-full')
    expect(title?.className).toContain('min-w-0')
    expect(preview?.className).toContain('w-full')
    expect(preview?.className).toContain('min-w-0')
    expect(preview?.className).toContain('wrap-anywhere')
    expect(preview?.className).toContain('overflow-hidden')

    fireEvent.click(
      screen.getByRole('button', { name: /Another conversation/ }),
    )

    expect(onSelectHistoryItem).toHaveBeenCalledWith('conversation-2')
  })

  it('deletes a conversation after confirming from the dropdown history menu', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onDeleteHistoryItem = vi.fn()
    const onSelectHistoryItem = vi.fn()

    render(
      <SavedTabsChatWidget
        defaultOpen
        historyItems={[
          {
            id: 'conversation-1',
            isActive: true,
            preview: 'First conversation',
            title: 'First conversation',
          },
          {
            id: 'conversation-2',
            isActive: false,
            preview: 'Another conversation',
            title: 'Another conversation',
          },
        ]}
        historyVariant='dropdown'
        onDeleteHistoryItem={onDeleteHistoryItem}
        onSelectHistoryItem={onSelectHistoryItem}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Recent conversations',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete Another conversation',
      }),
    )

    expect(screen.getByText('Delete this conversation?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDeleteHistoryItem).toHaveBeenCalledWith('conversation-2')
    expect(onSelectHistoryItem).not.toHaveBeenCalled()
  })

  it('reflects userSettings changes from chrome.storage.onChanged without reloading', async () => {
    const initialSettings = buildConfiguredSettings()
    const importedSettings = {
      ...buildConfiguredSettings(),
      activeAiSystemPromptId: 'imported-system-prompt',
      aiSystemPrompts: [
        ...(buildConfiguredSettings().aiSystemPrompts ?? []),
        {
          createdAt: 2,
          id: 'imported-system-prompt',
          name: 'Imported',
          template: 'Imported system prompt',
          updatedAt: 2,
        },
      ],
      ollamaModel: 'qwen3:latest',
    } satisfies UserSettings
    mocked.getUserSettings.mockResolvedValue(initialSettings)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(screen.getByRole('combobox', { name: 'Default' })).toBeTruthy()

    storageListeners[0](
      {
        userSettings: {
          oldValue: initialSettings,
          newValue: importedSettings,
        },
      },
      'local',
    )

    expect(
      await screen.findByRole('combobox', { name: 'Imported' }),
    ).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'qwen3:latest' })).toBeTruthy()
  })

  it('does not re-notify onMessagesChange when syncing an externally switched conversation', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onMessagesChange = vi.fn()

    const { rerender } = render(
      <SavedTabsChatWidget
        conversationId='conversation-1'
        defaultOpen
        initialMessages={[
          {
            content: 'First conversation',
            id: 'message-1',
            role: 'user',
          },
        ]}
        onMessagesChange={onMessagesChange}
        title='First conversation'
      />,
    )

    await screen.findByLabelText('AI chat sidebar')

    onMessagesChange.mockClear()

    rerender(
      <SavedTabsChatWidget
        conversationId='conversation-2'
        defaultOpen
        initialMessages={[
          {
            content: 'Another conversation',
            id: 'message-2',
            role: 'user',
          },
        ]}
        onMessagesChange={onMessagesChange}
        title='Another conversation'
      />,
    )

    await waitFor(() => {
      expect(
        screen.getAllByText('Another conversation').length,
      ).toBeGreaterThan(0)
    })

    expect(onMessagesChange).not.toHaveBeenCalled()
  })

  it('復帰した中断メッセージでは shimmer を出し続けない', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(
      <SavedTabsChatWidget
        conversationId='conversation-1'
        defaultOpen
        initialMessages={[
          {
            content:
              'The previous response was interrupted. Send your message again if needed.',
            id: 'message-1',
            isStreaming: false,
            role: 'assistant',
          },
        ]}
        title='Interrupted conversation'
      />,
    )

    await screen.findByLabelText('AI chat sidebar')

    expect(
      screen.getByText(
        'The previous response was interrupted. Send your message again if needed.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Assembling the answer...')).toBeNull()
  })

  it('notifies onMessagesChange only at conversation start and completion, not during stream steps', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const onMessagesChange = vi.fn()
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(
      <SavedTabsChatWidget defaultOpen onMessagesChange={onMessagesChange} />,
    )

    fireEvent.change(await screen.findByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(onMessagesChange).toHaveBeenCalledTimes(1)
    })
    expect(onMessagesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        content: 'Show me the tabs I added this month',
        role: 'user',
      }),
      expect.objectContaining({
        content: '',
        isStreaming: true,
        role: 'assistant',
      }),
    ])

    handlePortMessage?.({
      reasoning: 'Intermediate reasoning',
      toolTraces: [],
      type: 'step',
    })

    await waitFor(() => {
      expect(screen.getByText('Intermediate reasoning')).toBeTruthy()
    })
    expect(onMessagesChange).toHaveBeenCalledTimes(1)

    handlePortMessage?.({
      answer: 'The added URL this month is https://react.dev/learn.',
      charts: [],
      reasoning: 'Completed reasoning',
      toolTraces: [],
      type: 'complete',
    })

    await waitFor(() => {
      expect(onMessagesChange).toHaveBeenCalledTimes(2)
    })
    expect(onMessagesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        content: 'Show me the tabs I added this month',
        role: 'user',
      }),
      expect.objectContaining({
        content: 'The added URL this month is https://react.dev/learn.',
        isStreaming: false,
        role: 'assistant',
      }),
    ])
  })

  it('opens the system prompt modal and can create, duplicate, and save', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    )

    expect(
      await screen.findByRole('dialog', { name: 'System prompt manager' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New prompt' }))

    fireEvent.change(screen.getByLabelText('Prompt name'), {
      target: { value: 'Research notes' },
    })
    fireEvent.change(screen.getByLabelText('System prompt body'), {
      target: { value: 'Analyze saved-tab patterns.' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocked.saveUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          aiSystemPrompts: expect.arrayContaining([
            expect.objectContaining({
              name: 'Research notes',
              template: 'Analyze saved-tab patterns.',
            }),
            expect.objectContaining({
              name: expect.stringContaining('Research notes'),
            }),
          ]),
        }),
      )
    })
  })

  it('shows the available tools list in the system prompt manager', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'System prompt manager',
    })

    expect(within(dialog).getByText('Available tools')).toBeTruthy()

    for (const toolDefinition of AI_CHAT_TOOL_DEFINITIONS) {
      expect(
        within(dialog).getByText(toolDefinition.name, {
          exact: false,
        }),
      ).toBeTruthy()
      expect(within(dialog).getByText(toolDefinition.description)).toBeTruthy()
    }
  })

  it('saves the active preset and resets the conversation when switching the selector', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage.mockResolvedValue({
      answer: 'First response',
      recordCount: 1,
      status: 'ok',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('First response')).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: 'Default' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Research' }))

    await waitFor(() => {
      expect(mocked.saveUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          activeAiSystemPromptId: 'research-system-prompt',
        }),
      )
    })

    expect(screen.queryByText('First response')).toBeNull()
    expect(screen.getByTestId('ai-chat-intro')).toBeTruthy()
  })

  it('disables create and duplicate when there are 50 system prompts', async () => {
    mocked.getUserSettings.mockResolvedValue({
      ...buildConfiguredSettings(),
      activeAiSystemPromptId: 'prompt-1',
      aiSystemPrompts: Array.from({ length: 50 }, (_, index) => ({
        createdAt: index,
        id: `prompt-${index + 1}`,
        name: `Prompt ${index + 1}`,
        template: `template ${index + 1}`,
        updatedAt: index,
      })),
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    )

    const createButton = await screen.findByRole('button', {
      name: 'New prompt',
    })
    const duplicateButton = screen.getByRole('button', { name: 'Duplicate' })

    expect(createButton.hasAttribute('disabled')).toBe(true)
    expect(duplicateButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('50 / 50')).toBeTruthy()
  })

  it('disables saving when the system prompt name or body is empty or duplicated', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    )

    const saveButton = await screen.findByRole('button', { name: 'Save' })

    expect(saveButton.hasAttribute('disabled')).toBe(false)

    fireEvent.change(screen.getByLabelText('Prompt name'), {
      target: { value: '' },
    })

    expect(saveButton.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Prompt name'), {
      target: { value: 'Default' },
    })
    fireEvent.change(screen.getByLabelText('System prompt body'), {
      target: { value: '' },
    })

    expect(saveButton.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('System prompt body'), {
      target: { value: 'Give me more comparison angles for saved tabs.' },
    })
    fireEvent.click(screen.getByText('Research'))
    fireEvent.change(screen.getByLabelText('Prompt name'), {
      target: { value: 'Default' },
    })

    expect(saveButton.hasAttribute('disabled')).toBe(true)
    expect(mocked.saveUserSettings).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Prompt name'), {
      target: { value: 'Research details' },
    })

    expect(saveButton.hasAttribute('disabled')).toBe(false)

    const nameInput = screen.getByLabelText('Prompt name') as HTMLInputElement

    expect(nameInput.maxLength).toBe(25)

    fireEvent.change(nameInput, {
      target: { value: 'a'.repeat(26) },
    })

    expect(saveButton.hasAttribute('disabled')).toBe(true)
  })

  it('shows duplicate and delete actions to the right of the prompt name input', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    )

    const nameRow = await screen.findByTestId('system-prompt-name-row')

    expect(within(nameRow).getByLabelText('Prompt name')).toBeTruthy()
    expect(
      within(nameRow).getByRole('button', { name: 'Duplicate' }),
    ).toBeTruthy()
    expect(within(nameRow).getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('truncates long names in the system prompt list', async () => {
    const longName =
      'A very long system prompt name that should be truncated in the list view'
    const normalizedLongName = longName.slice(0, 25)

    mocked.getUserSettings.mockResolvedValue({
      ...buildConfiguredSettings(),
      aiSystemPrompts: [
        buildConfiguredSettings().aiSystemPrompts?.[0] as NonNullable<
          UserSettings['aiSystemPrompts']
        >[number],
        {
          createdAt: 2,
          id: 'long-system-prompt',
          name: longName,
          template: 'long template',
          updatedAt: 2,
        },
      ],
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open system prompt settings' }),
    )

    const listItemButton = await screen.findByRole('button', {
      name: normalizedLongName,
    })
    const listItemName = within(listItemButton).getByText(normalizedLongName)
    const listItemRow = listItemName.parentElement

    expect(listItemButton.className.includes('overflow-hidden')).toBe(true)
    expect(listItemName.className.includes('truncate')).toBe(true)
    expect(listItemRow?.className.includes('min-w-0')).toBe(true)
  })

  it('shows new conversation as an icon button with a tooltip label', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const resetButton = screen.getByRole('button', { name: 'New conversation' })

    expect(screen.queryByText('New conversation')).toBeNull()

    fireEvent.focus(resetButton)

    expect((await screen.findByRole('tooltip')).textContent).toBe(
      'New conversation',
    )
  })

  it('copies the whole conversation from the header button', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'Show me the tabs I added this month',
        type: 'run',
      })
    })

    handlePortMessage?.({
      answer: 'The added URL this month is https://react.dev/learn.',
      reasoning: '- Question interpretation: checking URLs added by month',
      recordCount: 1,
      toolTraces: [],
      type: 'complete',
    })

    expect(
      await screen.findByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
          element.textContent ===
            'The added URL this month is https://react.dev/learn.',
        ),
      ),
    ).toBeTruthy()

    const copyButton = screen.getByRole('button', { name: 'Copy conversation' })

    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(mocked.writeClipboardText).toHaveBeenCalledWith(
        [
          'User:',
          'Show me the tabs I added this month',
          '',
          'AI:',
          'The added URL this month is https://react.dev/learn.',
        ].join('\n'),
      )
    })
    expect(mocked.toastSuccess).toHaveBeenCalledWith('Copied the conversation')
    expect(copyButton.getAttribute('data-state')).toBe('copied')
  })

  it('resets history and returns to the initial state when new conversation is clicked', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage.mockResolvedValue({
      answer: 'First response',
      recordCount: 1,
      status: 'ok',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('First response')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(screen.queryByText('First response')).toBeNull()
    expect(screen.getByTestId('ai-chat-intro')).toBeTruthy()
    expect((screen.getByLabelText('Ask AI') as HTMLTextAreaElement).value).toBe(
      '',
    )
  })

  it('disconnects the active stream when new conversation is clicked', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'Show me the tabs I added this month',
        type: 'run',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(port.disconnect).toHaveBeenCalled()
    expect(screen.getByTestId('ai-chat-intro')).toBeTruthy()
  })

  it('renders the assistant response after submitting a question', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Submit',
      }),
    )

    await waitFor(() => {
      expect(mocked.connectRuntimePort).toHaveBeenCalledWith('ai-chat-stream')
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'Show me the tabs I added this month',
        type: 'run',
      })
    })

    handlePortMessage?.({
      reasoning: [
        '- Question interpretation: checking URLs added by month',
        '- Used tool: Saved tabs list',
      ].join('\n'),
      toolTraces: [
        {
          input: {
            page: 1,
            pageSize: 10,
            sortDirection: 'desc',
          },
          output: [
            {
              url: 'https://react.dev/learn',
            },
          ],
          state: 'output-available',
          title: 'Saved tabs list',
          toolCallId: 'call-1',
          toolName: 'listSavedUrls',
          type: 'dynamic-tool',
        },
      ],
      type: 'step',
    })

    expect(screen.getByRole('button', { name: /Reasoning/i })).toBeTruthy()
    const sourcesTrigger = await screen.findByRole('button', {
      name: '1 source',
    })
    expect(sourcesTrigger).toBeTruthy()
    fireEvent.click(sourcesTrigger)
    expect(
      await screen.findByRole('link', {
        name: 'https://react.dev/learn',
      }),
    ).toBeTruthy()
    expect(
      await screen.findAllByText(
        (_, element) =>
          element?.textContent?.includes('Saved tabs list') ?? false,
      ),
    ).not.toHaveLength(0)
    expect(
      await screen.findAllByText(
        (_, element) => element?.textContent?.includes('Tools run') ?? false,
      ),
    ).not.toHaveLength(0)
    expect(screen.queryByText('Parameters')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: /Saved tabs list/,
      }),
    )

    expect(await screen.findByText('Parameters')).toBeTruthy()

    handlePortMessage?.({
      answer: 'The added URL this month is https://react.dev/learn.',
      reasoning: [
        '- Question interpretation: checking URLs added by month',
        '- Used tool: Saved tabs list',
      ].join('\n'),
      recordCount: 1,
      toolTraces: [
        {
          input: {
            page: 1,
            pageSize: 10,
            sortDirection: 'desc',
          },
          output: [
            {
              url: 'https://react.dev/learn',
            },
          ],
          state: 'output-available',
          title: 'Saved tabs list',
          toolCallId: 'call-1',
          toolName: 'listSavedUrls',
          type: 'dynamic-tool',
        },
      ],
      type: 'complete',
    })

    expect(
      await screen.findByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
          element.textContent ===
            'The added URL this month is https://react.dev/learn.',
        ),
      ),
    ).toBeTruthy()
    const reasoningTrigger = screen.getByRole('button', { name: /Reasoning/i })
    const answerText = screen.getByText((_, element) =>
      Boolean(
        element?.tagName === 'P' &&
        element.textContent ===
          'The added URL this month is https://react.dev/learn.',
      ),
    )

    expect(
      reasoningTrigger.compareDocumentPosition(answerText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(port.disconnect).toHaveBeenCalled()
  })

  it('renders charts directly under the assistant message when present', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'What kinds of content do I save most often?',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'What kinds of content do I save most often?',
        type: 'run',
      })
    })

    handlePortMessage?.({
      answer: 'I have been saving a lot of frontend content lately.',
      charts: [
        {
          categoryKey: 'label',
          data: [
            { count: 3, label: 'Frontend' },
            { count: 1, label: 'AI' },
          ],
          description: 'Recent saved category mix',
          series: [
            {
              colorToken: 'chart-1',
              dataKey: 'count',
              label: 'Saved count',
            },
          ],
          title: 'Most-saved categories',
          type: 'pie',
          valueFormat: 'count',
        },
      ],
      reasoning: '- Used tool: Interest estimation',
      recordCount: 4,
      toolTraces: [],
      type: 'complete',
    })

    const [answerText, chartHeading] = await Promise.all([
      screen.findByText('I have been saving a lot of frontend content lately.'),
      screen.findByRole('heading', {
        level: 3,
        name: 'Most-saved categories',
      }),
    ])
    const messageContent = chartHeading.closest('[class*="overflow"]')
    const assistantMessage = chartHeading.closest('[class*="max-w"]')

    expect(screen.getByText('Recent saved category mix')).toBeTruthy()
    expect(messageContent?.className).toContain('overflow-visible')
    expect(assistantMessage?.className).toContain('max-w-full')
    expect(
      answerText.compareDocumentPosition(chartHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('deduplicates source URLs across tool traces', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I saved recently',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'Show me the tabs I saved recently',
        type: 'run',
      })
    })

    handlePortMessage?.({
      answer: 'I will summarize the recently saved URLs.',
      reasoning: '- Used tool: Saved tabs list',
      recordCount: 2,
      toolTraces: [
        {
          input: {
            page: 1,
            pageSize: 10,
            sortDirection: 'desc',
          },
          output: {
            items: [
              {
                title: 'React Learn',
                url: 'https://react.dev/learn',
              },
              {
                title: 'Vite Guide',
                url: 'https://vite.dev/guide/',
              },
            ],
            totalItems: 2,
          },
          state: 'output-available',
          title: 'Saved tabs list',
          toolCallId: 'call-1',
          toolName: 'listSavedUrls',
          type: 'dynamic-tool',
        },
        {
          input: {
            page: 2,
            pageSize: 10,
            sortDirection: 'desc',
          },
          output: {
            items: [
              {
                title: 'React Learn',
                url: 'https://react.dev/learn',
              },
            ],
            totalItems: 2,
          },
          state: 'output-available',
          title: 'Saved tabs list',
          toolCallId: 'call-2',
          toolName: 'listSavedUrls',
          type: 'dynamic-tool',
        },
      ],
      type: 'complete',
    })

    const sourcesTrigger = await screen.findByRole('button', {
      name: '2 sources',
    })
    fireEvent.click(sourcesTrigger)

    const sourcesGroup =
      (sourcesTrigger.closest('[data-slot="sources"]') as HTMLElement | null) ??
      document.body

    expect(
      within(sourcesGroup).getAllByRole('link', {
        name: 'React Learn',
      }),
    ).toHaveLength(1)
    expect(
      within(sourcesGroup).getByRole('link', {
        name: 'Vite Guide',
      }),
    ).toBeTruthy()
  })

  it('keeps the input editable but disables send while waiting for a reply', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Show me the tabs I added this month',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'Show me the tabs I added this month',
        type: 'run',
      })
    })

    const textarea = screen.getByLabelText('Ask AI') as HTMLTextAreaElement
    const submitButton = screen.getByRole('button', { name: 'Submit' })

    expect(textarea.disabled).toBe(false)
    expect((submitButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(textarea, {
      target: {
        value: 'Another question to ask',
      },
    })

    expect(textarea.value).toBe('Another question to ask')

    fireEvent.click(submitButton)

    expect(port.postMessage).toHaveBeenCalledTimes(1)
  })

  it('loads the Ollama model list when the footer selector is opened', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage.mockResolvedValue({
      models: [
        {
          label: 'llama3.2 (8B)',
          name: 'llama3.2',
        },
      ],
      status: 'ok',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'llama3.2' }))

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'listOllamaModels',
      })
    })

    expect(screen.queryByRole('dialog', { name: 'Select a model' })).toBeNull()
    expect(await screen.findAllByText('llama3.2 (8B)')).not.toHaveLength(0)
  })

  it('sends immediately when a suggestion is clicked and passes history on the second send', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage
      .mockResolvedValueOnce({
        answer: 'First response',
        recordCount: 1,
        status: 'ok',
      })
      .mockResolvedValueOnce({
        answer: 'Second response',
        recordCount: 1,
        status: 'ok',
      })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(screen.getByText('Show me the tabs I added this month'))

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
        action: 'runAiChat',
        history: [],
        prompt: 'Show me the tabs I added this month',
      })
    })

    expect((screen.getByLabelText('Ask AI') as HTMLTextAreaElement).value).toBe(
      '',
    )

    expect(await screen.findByText('First response')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: { value: 'Tell me more' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
        action: 'runAiChat',
        history: [
          {
            content: 'Show me the tabs I added this month',
            role: 'user',
          },
          {
            content: 'First response',
            role: 'assistant',
          },
        ],
        prompt: 'Tell me more',
      })
    })
  })

  it('shows the fallback error as an assistant message when the response fails', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage.mockResolvedValue({
      status: 'error',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'What kinds of content do I save most often?',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(
      await screen.findAllByText('Could not get a response from AI.'),
    ).toHaveLength(2)
  })

  it('shows macOS setup guidance and the FAQ link for Ollama 403 stream errors', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.platformOs = 'mac'
    let handlePortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          handlePortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    }
    mocked.connectRuntimePort.mockResolvedValue(port)

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'What kinds of content do I save most often?',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        history: [],
        prompt: 'What kinds of content do I save most often?',
        type: 'run',
      })
    })

    handlePortMessage?.({
      error: 'Ollama denied access from the extension (403 Forbidden).',
      ollamaError: {
        allowedOrigins: 'chrome-extension://test-extension-id',
        baseUrl: 'http://localhost:11434',
        downloadUrl: 'https://ollama.com/download',
        faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
        kind: 'forbidden',
        tagsUrl: 'http://localhost:11434/api/tags',
      },
      type: 'error',
    })

    expect(
      await screen.findAllByText('Open Terminal from Spotlight search.'),
    ).toHaveLength(1)
    expect(
      screen.getAllByText('Copy and paste the following command.'),
    ).toHaveLength(1)
    expect(
      screen.getAllByDisplayValue(
        'launchctl setenv OLLAMA_ORIGINS "chrome-extension://test-extension-id"',
      ),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: 'Copy command' }),
    ).toHaveLength(1)
    expect(screen.getAllByText('Press the Return key.')).toHaveLength(1)
    expect(screen.getAllByText('Quit Ollama.app.')).toHaveLength(1)
    expect(screen.getAllByText('Launch Ollama.app again.')).toHaveLength(1)
    expect(
      screen.getAllByText(
        'Copy and paste the check command to verify the connection.',
      ),
    ).toHaveLength(1)
    expect(
      screen.getAllByDisplayValue('curl http://localhost:11434/api/tags'),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: 'Copy check command' }),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('link', {
        name: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
      }),
    ).toHaveLength(1)
  })

  it('treats settings fetch failures as unconfigured and closes with the close button', async () => {
    mocked.getUserSettings.mockRejectedValue(new Error('failed to load'))

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(screen.getByRole('heading', { name: 'Select a model' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close AI chat' }))
    expect(screen.queryByText('Chat')).toBeNull()
  })

  it('shows a centered guide and no suggestions when no model is selected', async () => {
    mocked.getUserSettings.mockResolvedValue({
      ...buildConfiguredSettings(),
      ollamaModel: '',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const emptyStateMessage = screen.getByRole('heading', {
      name: 'Select a model',
    })
    const emptyStateRoot = emptyStateMessage.closest('div')?.parentElement

    expect(emptyStateMessage).toBeTruthy()
    expect(screen.queryByTestId('ai-chat-intro')).toBeNull()
    expect(emptyStateRoot?.className.includes('justify-center')).toBe(true)
  })

  it('does not send when the input is empty', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const form = screen.getByLabelText('Ask AI').closest('form')
    if (!form) {
      throw new Error('form not found')
    }

    fireEvent.submit(form)
    expect(mocked.sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it('inserts a newline on Enter instead of sending', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const textarea = screen.getByLabelText('Ask AI') as HTMLTextAreaElement

    fireEvent.change(textarea, {
      target: {
        value: 'first',
      },
    })
    textarea.focus()
    textarea.setSelectionRange(5, 5)
    fireEvent.keyDown(textarea, {
      code: 'Enter',
      key: 'Enter',
    })

    await waitFor(() => {
      expect(textarea.value).toBe('first\n')
    })
    expect(mocked.sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it('sends on Ctrl+Enter', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage.mockResolvedValue({
      answer: 'Ctrl submit response',
      recordCount: 1,
      status: 'ok',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const textarea = screen.getByLabelText('Ask AI') as HTMLTextAreaElement

    fireEvent.change(textarea, {
      target: {
        value: 'Ctrl submit',
      },
    })
    fireEvent.keyDown(textarea, {
      code: 'Enter',
      ctrlKey: true,
      key: 'Enter',
    })

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'runAiChat',
        history: [],
        prompt: 'Ctrl submit',
      })
    })
    expect(await screen.findByText('Ctrl submit response')).toBeTruthy()
  })

  it('sends text attachments in the conversation payload when selected from the bottom-left picker', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.sendRuntimeMessage.mockResolvedValue({
      answer: 'I read the attachment',
      recordCount: 1,
      status: 'ok',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    const uploadInput = screen.getByLabelText('Upload files')
    fireEvent.change(uploadInput, {
      target: {
        files: [new File(['Hello'], 'memo.txt', { type: 'text/plain' })],
      },
    })

    expect(await screen.findByText('memo.txt')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: {
        value: 'Summarize the attachment',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'runAiChat',
        attachments: [
          {
            content: 'Hello',
            filename: 'memo.txt',
            kind: 'text',
            mediaType: 'text/plain',
          },
        ],
        history: [],
        prompt: 'Summarize the attachment',
      })
    })

    expect(await screen.findByText('I read the attachment')).toBeTruthy()
  })

  it('can select and save a model from inside the chat when none is set', async () => {
    mocked.getUserSettings.mockResolvedValue({
      ...buildConfiguredSettings(),
      ollamaModel: '',
    })
    mocked.sendRuntimeMessage.mockResolvedValue({
      models: [
        {
          label: 'llama3.2 (8B)',
          name: 'llama3.2',
        },
      ],
      status: 'ok',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    expect(
      (screen.getByLabelText('Ask AI') as HTMLTextAreaElement).disabled,
    ).toBe(true)

    expect(screen.queryByRole('button', { name: 'Load models' })).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: 'Select a model' }))

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'listOllamaModels',
      })
    })

    fireEvent.click(
      await screen.findByRole('option', { name: 'llama3.2 (8B)' }),
    )

    await waitFor(() => {
      expect(mocked.saveUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          ollamaModel: 'llama3.2',
        }),
      )
    })

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Ask AI') as HTMLTextAreaElement).disabled,
      ).toBe(false)
    })
    expect(screen.queryByText('Ollama: llama3.2')).toBeNull()
  })

  it('shows Windows guidance and download links for Ollama connection errors while fetching the model list', async () => {
    mocked.getUserSettings.mockResolvedValue(buildConfiguredSettings())
    mocked.platformOs = 'win'
    mocked.sendRuntimeMessage.mockResolvedValue({
      error: 'Could not connect to Ollama.',
      ollamaError: {
        allowedOrigins: 'chrome-extension://test-extension-id',
        baseUrl: 'http://localhost:11434',
        downloadUrl: 'https://ollama.com/download',
        faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
        kind: 'notInstalledOrNotRunning',
        tagsUrl: 'http://localhost:11434/api/tags',
      },
      status: 'error',
    })

    render(<SavedTabsChatWidget />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open AI chat',
      }),
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'llama3.2' }))

    await waitFor(() => {
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'listOllamaModels',
      })
    })

    expect(
      await screen.findByText(
        'Search for Environment Variables in the Windows start menu.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText('Open Edit the system environment variables.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'In the window that appears, select Environment Variables.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Under User variables, select New.')).toBeTruthy()
    expect(
      screen.getByText('Enter OLLAMA_ORIGINS as the variable name.'),
    ).toBeTruthy()
    expect(
      screen.getByText('Enter the following value as the variable value.'),
    ).toBeTruthy()
    expect(
      screen.getByDisplayValue('chrome-extension://test-extension-id'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeTruthy()
    expect(
      screen.getByText('Save the setting and restart Ollama.'),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', {
        name: 'https://ollama.com/download',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', {
        name: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
      }),
    ).toBeTruthy()
  })
})
