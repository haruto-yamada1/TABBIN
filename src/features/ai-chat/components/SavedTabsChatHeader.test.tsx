// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

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
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

import { SavedTabsChatHeader } from './SavedTabsChatHeader'

const historyItems = [
  {
    id: 'conversation-1',
    isActive: true,
    preview: 'First preview',
    title: 'First conversation',
  },
  {
    id: 'conversation-2',
    isActive: false,
    preview: 'Second preview',
    title: 'Second conversation',
  },
]

const systemPrompts = [
  {
    id: 'prompt-1',
    name: 'Default',
  },
  {
    id: 'prompt-2',
    name: 'Research',
  },
]

const createProps = () => ({
  activeSystemPromptId: 'prompt-1',
  historyItems,
  historyVariant: 'none' as const,
  onClose: vi.fn(),
  onCopyConversation: vi.fn(),
  onDeleteHistoryItem: vi.fn(),
  onOpenSystemPromptManager: vi.fn(),
  onResetConversation: vi.fn(),
  onSelectHistoryItem: vi.fn(),
  onSelectSystemPrompt: vi.fn(),
  onToggleHistory: vi.fn(),
  presentation: {
    isCompactLayout: false,
    showCloseButton: true,
  },
  status: {
    isConversationCopied: false,
    isCopyDisabled: false,
  },
  systemPrompts,
  title: 'TABBIN AI',
})

describe('SavedTabsChatHeader', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the title between the left controls and conversation actions', () => {
    render(<SavedTabsChatHeader {...createProps()} />)

    const leftControls = screen.getByTestId('ai-chat-header-left-controls')
    const title = screen.getByTestId('chat-header-title')
    const copyButton = screen.getByRole('button', {
      name: 'Copy conversation',
    })

    expect(title).toHaveTextContent('TABBIN AI')
    expect(title).toHaveClass('absolute', 'inset-x-0', 'justify-center')
    expect(
      leftControls.compareDocumentPosition(title) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      title.compareDocumentPosition(copyButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders sidebar history before settings and forwards header actions', async () => {
    const user = userEvent.setup()
    const props = createProps()

    render(<SavedTabsChatHeader {...props} historyVariant='sidebar-toggle' />)

    const historyButton = screen.getByRole('button', {
      name: 'Recent conversations',
    })
    const settingsButton = screen.getByRole('button', {
      name: 'Open system prompt settings',
    })

    expect(
      historyButton.compareDocumentPosition(settingsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(historyButton)
    await user.click(settingsButton)
    await user.click(screen.getByRole('button', { name: 'Copy conversation' }))
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    await user.click(screen.getByRole('button', { name: 'Close AI chat' }))

    expect(props.onToggleHistory).toHaveBeenCalledTimes(1)
    expect(props.onOpenSystemPromptManager).toHaveBeenCalledTimes(1)
    expect(props.onCopyConversation).toHaveBeenCalledTimes(1)
    expect(props.onResetConversation).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('opens dropdown history, resumes a conversation, and confirms deletion', async () => {
    const user = userEvent.setup()
    const props = createProps()

    render(<SavedTabsChatHeader {...props} historyVariant='dropdown' />)

    await user.click(
      screen.getByRole('button', { name: 'Recent conversations' }),
    )
    await user.click(
      screen.getByRole('button', { name: /^Second conversation/ }),
    )

    expect(props.onSelectHistoryItem).toHaveBeenCalledWith('conversation-2')

    await user.click(
      screen.getByRole('button', { name: 'Recent conversations' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Delete Second conversation' }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Delete this conversation?',
    })
    expect(
      within(dialog).getByText('This action cannot be undone.'),
    ).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(props.onDeleteHistoryItem).toHaveBeenCalledWith('conversation-2')
  })

  it('forwards system prompt selection and reflects copied/disabled state', async () => {
    const props = createProps()

    render(
      <SavedTabsChatHeader
        {...props}
        status={{ isConversationCopied: true, isCopyDisabled: true }}
      />,
    )

    const copyButton = screen.getByRole('button', {
      name: 'Copy conversation',
    })
    expect(copyButton).toBeDisabled()
    expect(copyButton).toHaveAttribute('data-state', 'copied')

    const selector = screen.getByRole('combobox', { name: 'Default' })
    // Radix UI Select does not work with userEvent in jsdom
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.click(selector)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.click(await screen.findByRole('option', { name: 'Research' }))

    expect(props.onSelectSystemPrompt).toHaveBeenCalledWith('prompt-2')
  })

  it('hides the close action and uses compact selector width when requested', () => {
    const props = createProps()

    render(
      <SavedTabsChatHeader
        {...props}
        presentation={{ isCompactLayout: true, showCloseButton: false }}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Close AI chat' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Default' })).toHaveClass(
      'w-[112px]',
    )
  })
})
