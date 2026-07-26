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
  it('composes the page shell with Header, intro, data scope, and Composer', () => {
    render(<SavedTabsChatPanel {...createProps()} />)

    expect(screen.getByLabelText('AI chat page')).toBeTruthy()
    expect(screen.queryByTestId('chat-shell')).toBeNull()
    expect(screen.getByTestId('panel-header').textContent).toBe(
      'Saved tabs assistant',
    )
    expect(screen.getByTestId('ai-chat-intro')).toBeTruthy()
    expect(screen.getByTestId('ai-chat-data-scope')).toBeTruthy()
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

    expect(screen.getByTestId('empty-state-root')).toBeTruthy()
    expect(screen.queryByTestId('ai-chat-data-scope')).toBeNull()

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
