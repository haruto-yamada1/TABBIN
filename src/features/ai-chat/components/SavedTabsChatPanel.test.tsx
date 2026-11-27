// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages('en')
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

vi.mock('./SavedTabsChatHeader', () => ({
  SavedTabsChatHeader: ({ title }: { title: string }) => (
    <div data-testid='panel-header'>{title}</div>
  ),
}))

vi.mock('./SavedTabsChatComposer', () => ({
  SavedTabsChatComposer: ({ input }: { input: string }) => (
    <div data-testid='panel-composer'>{input}</div>
  ),
}))

import { SavedTabsChatPanel } from './SavedTabsChatPanel'
import type { SavedTabsChatPanelProps } from './SavedTabsChatPanel'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const createProps = (
  overrides: Partial<SavedTabsChatPanelProps> = {},
): SavedTabsChatPanelProps => ({
  activeSystemPromptId: 'prompt-1',
  chatErrorMessage: '',
  historyItems: [],
  historyVariant: 'none',
  input: 'draft',
  layout: {
    isCompactLayout: false,
    isResizing: false,
    mode: 'page',
    showCloseButton: false,
  },
  messages: [],
  modelName: 'llama3.2',
  modelOptions: [{ label: 'llama3.2', name: 'llama3.2' }],
  onClose: vi.fn(),
  onCopyConversation: vi.fn(),
  onFetchModels: vi.fn(),
  onInputChange: vi.fn(),
  onOpenSystemPromptManager: vi.fn(),
  onResetConversation: vi.fn(),
  onResizeStart: vi.fn(),
  onSelectModel: vi.fn().mockResolvedValue(true),
  onSelectSuggestion: vi.fn(),
  onSelectSystemPrompt: vi.fn(),
  onSubmit: vi.fn(),
  platform: 'mac',
  setupErrorMessage: '',
  status: {
    isConfigured: true,
    isConversationCopied: false,
    isCopyDisabled: false,
    isLoadingModels: false,
    isOpen: true,
    isSavingModel: false,
    isSubmitting: false,
  },
  systemPrompts: [],
  title: 'Saved tabs assistant',
  ...overrides,
})

describe('SavedTabsChatPanel', () => {
  it('offers review for a completed assistant action proposal', () => {
    render(
      <SavedTabsChatPanel
        {...createProps({
          messages: [
            {
              content: 'Review these tabs before deleting them.',
              id: 'proposal-message',
              role: 'assistant',
              toolTraces: [
                {
                  input: { kind: 'delete_urls', urlIds: ['url-1'] },
                  output: {
                    proposal: { kind: 'delete_urls', urlIds: ['url-1'] },
                  },
                  state: 'output-available',
                  title: 'Propose a saved-tab action',
                  toolCallId: 'proposal-1',
                  toolName: 'proposeSavedTabsAction',
                  type: 'dynamic-tool',
                },
              ],
            },
          ],
        })}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Review proposed action' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Approve and apply' }),
    ).toBeNull()
  })

  it('composes the page shell with Header, intro, and Composer', () => {
    render(<SavedTabsChatPanel {...createProps()} />)

    expect(screen.getByLabelText('AI chat page')).toBeTruthy()
    expect(screen.queryByTestId('chat-shell')).toBeNull()
    expect(screen.getByTestId('panel-header').textContent).toBe(
      'Saved tabs assistant',
    )
    expect(screen.getByTestId('ai-chat-intro')).toBeTruthy()
    expect(screen.getByTestId('ai-chat-bottom-dock')).toContainElement(
      screen.getByTestId('panel-composer'),
    )
  })

  it('renders the floating shell and forwards resize pointer input', async () => {
    const user = userEvent.setup()
    const onResizeStart = vi.fn()
    render(
      <SavedTabsChatPanel
        {...createProps({
          layout: {
            isCompactLayout: true,
            isResizing: true,
            mode: 'floating',
            showCloseButton: true,
          },
          onResizeStart,
        })}
      />,
    )

    expect(screen.getByTestId('chat-shell')).toBeTruthy()
    expect(screen.getByLabelText('AI chat sidebar')).toBeTruthy()
    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByRole('button', {
        name: 'Resize the AI chat width',
      }),
    })
    expect(onResizeStart).toHaveBeenCalledOnce()
  })

  it('switches from the unconfigured empty state to rendered conversation content', () => {
    const { rerender } = render(
      <SavedTabsChatPanel
        {...createProps({
          status: {
            ...createProps().status,
            isConfigured: false,
          },
        })}
      />,
    )

    expect(screen.getByTestId('ai-chat-setup-guide')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Open AI settings' }),
    ).toBeTruthy()
    // The guide lives in the same scrollable content area as messages so
    // its lower steps and settings button stay reachable at low heights.
    expect(screen.getByTestId('ai-chat-setup-guide-content')).toContainElement(
      screen.getByTestId('ai-chat-setup-guide'),
    )

    rerender(
      <SavedTabsChatPanel
        {...createProps({
          messages: [
            { content: 'Question', id: 'user-1', role: 'user' },
            {
              content: '',
              id: 'assistant-1',
              isStreaming: true,
              role: 'assistant',
            },
          ],
        })}
      />,
    )

    expect(screen.getAllByTestId('chat-message')).toHaveLength(2)
    expect(screen.getByText('Question')).toBeTruthy()
    expect(screen.getByText('Assembling the answer...')).toBeTruthy()
  })

  it('keeps conversation errors in the bottom dock', () => {
    render(
      <SavedTabsChatPanel
        {...createProps({ chatErrorMessage: 'Connection failed' })}
      />,
    )

    expect(screen.getByTestId('ai-chat-bottom-dock')).toContainElement(
      screen.getByText('Connection failed'),
    )
  })

  it('hides raw tool call JSON in reasoning and keeps raw data in tool details', async () => {
    const user = userEvent.setup()
    render(
      <SavedTabsChatPanel
        {...createProps({
          messages: [
            {
              content: 'Here are your saved tabs.',
              id: 'json-message',
              reasoning:
                'Reasoning {"type":"function","function":{"name": "listSavedUrls","parameters": {"year": "2023", "month": "1"}}}',
              role: 'assistant',
              toolTraces: [
                {
                  input: { month: '1', year: '2023' },
                  output: { items: [] },
                  state: 'output-available',
                  title: 'Search tabs by month',
                  toolCallId: 'call-json',
                  toolName: 'findUrlsByMonth',
                  type: 'dynamic-tool',
                },
              ],
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Reasoning/ }))

    expect(screen.queryByText(/"year"/)).toBeNull()
    expect(screen.getByText(/Tool call data is not shown here/)).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: /Search tabs by month/ }),
    )

    expect(document.body.textContent).toContain('"year": "2023"')
  })

  it('keeps hidden raw tool call data reachable without tool traces', async () => {
    const user = userEvent.setup()
    render(
      <SavedTabsChatPanel
        {...createProps({
          messages: [
            {
              content: 'Here are your saved tabs.',
              id: 'json-no-trace-message',
              reasoning:
                'Reasoning {"type":"function","function":{"name": "listSavedUrls","parameters": {"year": "2023", "month": "1"}}}',
              role: 'assistant',
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Reasoning/ }))

    const reasoningText = screen.getByText(/Tool call data is not shown here/)
    expect(reasoningText.textContent).not.toContain('"year"')
    expect(screen.getByText('Raw tool call data')).toBeTruthy()
    expect(screen.getByText(/"year": "2023"/)).toBeTruthy()
  })

  it('shows a user-facing note when a tool call fails', () => {
    render(
      <SavedTabsChatPanel
        {...createProps({
          messages: [
            {
              content: 'I could not complete that.',
              id: 'failed-message',
              role: 'assistant',
              toolTraces: [
                {
                  errorText: 'Invalid arguments',
                  input: { year: '2023' },
                  state: 'output-error',
                  title: 'Search tabs by month',
                  toolCallId: 'call-failed',
                  toolName: 'findUrlsByMonth',
                  type: 'dynamic-tool',
                },
              ],
            },
          ],
        })}
      />,
    )

    const note = screen.getByTestId('ai-chat-tool-failure-note')
    expect(note.textContent).toContain('smaller model')
  })

  it('shows which tool is running while streaming', () => {
    render(
      <SavedTabsChatPanel
        {...createProps({
          messages: [
            {
              content: '',
              id: 'streaming-message',
              isStreaming: true,
              reasoning: '- Checking saved tabs.',
              role: 'assistant',
              toolTraces: [
                {
                  input: { keyword: 'react' },
                  state: 'input-available',
                  title: 'Search tabs by keyword',
                  toolCallId: 'call-running',
                  toolName: 'searchSavedUrls',
                  type: 'dynamic-tool',
                },
              ],
            },
          ],
        })}
      />,
    )

    expect(screen.getByTestId('ai-chat-tool-progress').textContent).toContain(
      'Running Search tabs by keyword',
    )
  })

  it('does not render when closed', () => {
    const props = createProps()
    render(
      <SavedTabsChatPanel
        {...props}
        status={{ ...props.status, isOpen: false }}
      />,
    )

    expect(screen.queryByTestId('panel-header')).toBeNull()
  })
})
