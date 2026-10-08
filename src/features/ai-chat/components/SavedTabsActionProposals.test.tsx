import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'
import type { AiChatToolTrace } from '@/types/ai-chat-protocol'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  preview: vi.fn(),
  undo: vi.fn(),
}))

vi.mock('@/app/composition/savedTabsOrganization', () => ({
  getSavedTabsOrganizationService: () => mocks,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) => {
      const messages = getMessages('en')
      const template = messages[key as keyof typeof messages] ?? fallback ?? key
      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token) => values?.[token] ?? '',
      )
    },
  }),
}))

import { SavedTabsActionProposals } from './SavedTabsActionProposals'

const proposal = { kind: 'delete_urls', urlIds: ['url-1'] }
const trace: AiChatToolTrace = {
  input: proposal,
  output: { proposal },
  state: 'output-available',
  title: 'Propose a saved-tab action',
  toolCallId: 'proposal-1',
  toolName: 'proposeSavedTabsAction',
  type: 'dynamic-tool',
}
let traceSequence = 0

beforeEach(() => {
  trace.toolCallId = `proposal-${++traceSequence}`
  vi.resetAllMocks()
  mocks.preview.mockResolvedValue({
    expiresAt: Date.now() + 60_000,
    id: 'preview-1',
    proposal,
    revision: 3,
    targets: [
      {
        after: 'Deleted',
        before: 'Research / Articles; example.com',
        id: 'url-1',
        title: '<script>private title</script>',
        url: 'https://example.com/research',
      },
    ],
  })
  mocks.execute.mockResolvedValue({
    notificationFailed: false,
    undoId: 'undo-1',
  })
  mocks.undo.mockResolvedValue({ notificationFailed: false })
})

afterEach(cleanup)

const review = async () => {
  const user = userEvent.setup()
  render(<SavedTabsActionProposals toolTraces={[trace]} />)
  await user.click(
    screen.getByRole('button', { name: 'Review proposed action' }),
  )
  return user
}

describe('SavedTabsActionProposals', () => {
  it.each([1, 2])(
    'shows a neutral count label for %i affected URLs',
    async (count) => {
      const countProposal = {
        kind: 'delete_urls',
        urlIds: Array.from({ length: count }, (_, index) => `url-${index}`),
      }
      mocks.preview.mockResolvedValue({
        expiresAt: Date.now() + 60_000,
        id: 'count-preview',
        proposal: countProposal,
        revision: 1,
        targets: countProposal.urlIds.map((id) => ({
          id,
          title: id,
          url: `https://example.com/${id}`,
          before: 'Inbox',
          after: '—',
        })),
      })
      const user = userEvent.setup()
      render(
        <SavedTabsActionProposals
          toolTraces={[
            {
              ...trace,
              input: countProposal,
              output: { proposal: countProposal },
            },
          ]}
        />,
      )
      await user.click(
        screen.getByRole('button', { name: 'Review proposed action' }),
      )
      expect(screen.getByText(`Affected URLs: ${count}`)).toBeTruthy()
    },
  )

  it('retains the applied state and Undo after navigating away and back', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <SavedTabsActionProposals toolTraces={[trace]} />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Review proposed action' }),
    )
    await user.click(screen.getByRole('button', { name: 'Approve and apply' }))
    unmount()
    render(<SavedTabsActionProposals toolTraces={[trace]} />)
    expect(
      screen.getByRole('button', { name: 'Undo this action' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Review proposed action' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo this action' }))
    expect(mocks.undo).toHaveBeenCalledExactlyOnceWith('undo-1')
  })

  it('does not read or write data until review and requires explicit approval', async () => {
    const user = userEvent.setup()
    render(<SavedTabsActionProposals toolTraces={[trace]} />)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Review proposed action' }),
    )

    expect(mocks.preview).toHaveBeenCalledWith(proposal)
    expect(screen.getByText('Affected URLs: 1')).toBeTruthy()
    expect(screen.getByText('https://example.com/research')).toBeTruthy()
    expect(screen.getByText('<script>private title</script>')).toBeTruthy()
    expect(screen.getByText('Research / Articles; example.com')).toBeTruthy()
    expect(screen.getByText('Deleted')).toBeTruthy()
    expect(mocks.execute).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Approve and apply' }))
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith('preview-1')
    expect(
      screen.queryByRole('button', { name: 'Approve and apply' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo this action' }))
    expect(mocks.undo).toHaveBeenCalledExactlyOnceWith('undo-1')
    expect(screen.getByText('Action undone.')).toBeTruthy()
  })

  it('cancels without writing and prepares a fresh preview on the next review', async () => {
    const user = await review()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('https://example.com/research')).toBeNull()
    expect(mocks.execute).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Review proposed action' }),
    )
    expect(mocks.preview).toHaveBeenCalledTimes(2)
  })

  it('shows a safe error and discards a stale preview after execution rejection', async () => {
    mocks.execute.mockRejectedValue(
      new Error('private URL must not be exposed'),
    )
    const user = await review()
    await user.click(screen.getByRole('button', { name: 'Approve and apply' }))
    expect(screen.getByRole('alert').textContent).toContain('Review it again')
    expect(screen.queryByText('private URL must not be exposed')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Approve and apply' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Undo this action' }),
    ).toBeNull()
  })

  it('retains Undo after notification failure and reports rejected Undo safely', async () => {
    mocks.execute.mockResolvedValue({
      notificationFailed: true,
      undoId: 'undo-1',
    })
    mocks.undo.mockRejectedValue(new Error('conflict'))
    const user = await review()
    await user.click(screen.getByRole('button', { name: 'Approve and apply' }))
    expect(screen.getByText(/other views could not be notified/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Undo this action' }))
    expect(screen.getByRole('alert').textContent).toContain('not overwritten')
    expect(
      screen.getByRole('button', { name: 'Undo this action' }),
    ).toBeEnabled()
  })

  it('does not expose incomplete, invalid, or unrelated tool outputs as actions', () => {
    const { rerender } = render(
      <SavedTabsActionProposals isStreaming toolTraces={[trace]} />,
    )
    expect(screen.queryByRole('button')).toBeNull()
    rerender(
      <SavedTabsActionProposals
        toolTraces={[
          { ...trace, state: 'input-available' },
          { ...trace, toolCallId: 'other', toolName: 'searchSavedUrls' },
          {
            ...trace,
            output: { proposal: { kind: 'delete_urls', urlIds: [] } },
          },
          { ...trace, output: null },
        ]}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('blocks repeated approval while a write is pending', async () => {
    let finish:
      | ((value: { undoId: string; notificationFailed: boolean }) => void)
      | undefined
    mocks.execute.mockImplementation(
      async () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const user = await review()
    const approve = screen.getByRole('button', { name: 'Approve and apply' })
    await user.dblClick(approve)
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(approve).toBeDisabled()
    finish?.({ notificationFailed: false, undoId: 'undo-1' })
    await waitFor(() =>
      expect(screen.getByText('Action applied.')).toBeTruthy(),
    )
  })
})
