import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewCandidate } from './lib/reviewCandidates'
import { defaultReviewReminderSettings } from './lib/reviewReminderSettings'
import { ReviewReminderPage } from './ReviewReminderPage'

const mocks = vi.hoisted(() => ({
  getReviewCandidates: vi.fn(),
  readReviewReminderSettings: vi.fn(),
  preview: vi.fn(),
  execute: vi.fn(),
  undo: vi.fn(),
}))
vi.mock('@/app/composition/savedTabsOrganization', () => ({
  getSavedTabsOrganizationService: () => ({
    preview: mocks.preview,
    execute: mocks.execute,
    undo: mocks.undo,
  }),
}))
vi.mock('@/app/composition/reviewReminders', () => ({
  getReviewCandidates: mocks.getReviewCandidates,
}))
vi.mock('@/lib/storage/review-reminders', () => ({
  readReviewReminderSettings: mocks.readReviewReminderSettings,
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'en',
    t: (key: string, _fallback?: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key,
  }),
}))

describe('review reminder target list', () => {
  it('keeps one main landmark inside the application layout', async () => {
    render(
      <main>
        <ReviewReminderPage search='?review=1' />
      </main>,
    )
    await screen.findByText('<b>Saved title</b>')
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(
      screen.getByRole('region', { name: 'reviewReminder.listTitle' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'reviewReminder.configure' }),
    ).toHaveAttribute('href', '#/periodic-execution')
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readReviewReminderSettings.mockResolvedValue(
      defaultReviewReminderSettings,
    )
    mocks.getReviewCandidates.mockResolvedValue([
      {
        id: 'url-1',
        title: '<b>Saved title</b>',
        url: 'https://example.com/',
        firstSavedAt: 100,
      },
    ])
    mocks.preview.mockImplementation(async (proposal) => ({
      id: 'preview-1',
      proposal,
      targets: proposal.urlIds.map((id: string) => ({
        id,
        title: `Preview ${id}`,
        url: `https://example.com/${id}`,
        before: 'Saved',
        after: 'Deleted',
      })),
    }))
    mocks.execute.mockResolvedValue({
      undoId: 'undo-1',
      notificationFailed: false,
    })
    mocks.undo.mockResolvedValue({ notificationFailed: false })
  })
  afterEach(cleanup)

  it.each(['resolve', 'reject'] as const)(
    'obsolete requests cannot replace the newer list when they %s',
    async (outcome) => {
      const stale = Promise.withResolvers<ReviewCandidate[]>()
      mocks.getReviewCandidates
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce([
          {
            id: 'new',
            title: 'Current list',
            url: 'https://example.com/current',
          },
        ])
      const view = render(
        <ReviewReminderPage search='?review=1&target=older&olderThanDays=30&reviewAt=1000' />,
      )
      await waitFor(() => {
        expect(mocks.getReviewCandidates).toHaveBeenCalledTimes(1)
      })
      view.rerender(
        <ReviewReminderPage search='?review=1&target=all&olderThanDays=30&reviewAt=1000' />,
      )
      expect(await screen.findByText('Current list')).toBeVisible()
      await act(async () => {
        if (outcome === 'resolve') {
          stale.resolve([
            {
              id: 'old',
              title: 'Obsolete list',
              url: 'https://example.com/obsolete',
            },
          ])
        } else {
          stale.reject(new Error('obsolete read failed'))
        }
      })
      expect(screen.getByText('Current list')).toBeVisible()
      expect(screen.queryByText('Obsolete list')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('uses the notified criteria even when the current settings changed, and keeps titles escaped', async () => {
    render(
      <ReviewReminderPage search='?review=1&target=older&olderThanDays=7&reviewAt=1000' />,
    )
    expect(await screen.findByText('<b>Saved title</b>')).toBeTruthy()
    expect(mocks.getReviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'older', olderThanDays: 7 }),
      1000,
    )
    expect(
      screen
        .getByRole('link', { name: 'reviewReminder.open <b>Saved title</b>' })
        .getAttribute('href'),
    ).toBe('https://example.com/')
    expect(screen.queryByText('Saved title', { exact: true })).toBeNull()
  })

  it('rejects invalid criteria without loading a broader list', async () => {
    render(
      <ReviewReminderPage search='?review=1&target=unknown&olderThanDays=0&reviewAt=-1' />,
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mocks.getReviewCandidates).not.toHaveBeenCalled()
  })

  it('shows read failures and can retry', async () => {
    mocks.getReviewCandidates.mockRejectedValueOnce(new Error('private URL'))
    render(<ReviewReminderPage search='?review=1' />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('private URL')).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'reviewReminder.refresh' }))
    expect(await screen.findByText('<b>Saved title</b>')).toBeTruthy()
  })

  it('reports an empty list and never creates an unsafe link', async () => {
    mocks.getReviewCandidates.mockResolvedValueOnce([])
    const view = render(<ReviewReminderPage search='?review=1' />)
    expect(await screen.findByText('reviewReminder.listEmpty')).toBeTruthy()
    view.unmount()
    mocks.getReviewCandidates.mockResolvedValueOnce([
      {
        id: 'unsafe',
        title: 'Unsafe',
        url: ['java', 'script:alert(1)'].join(''),
      },
    ])
    render(<ReviewReminderPage search='?review=1' />)
    expect(await screen.findByText('Unsafe')).toBeTruthy()
    expect(
      screen.queryByRole('link', { name: 'reviewReminder.open Unsafe' }),
    ).toBeNull()
  })

  const loadThreeCandidates = () => {
    mocks.getReviewCandidates.mockResolvedValue([
      {
        id: 'url-1',
        title: 'Older title',
        url: 'https://example.com/old',
        firstSavedAt: 100,
      },
      {
        id: 'url-2',
        title: 'Alpha guide',
        url: 'https://docs.example.org/new',
        firstSavedAt: 200,
      },
      {
        id: 'url-3',
        title: 'Unknown date',
        url: 'https://other.example.org/path',
      },
    ])
  }

  it('searches titles and URLs without changing the reminder criteria, and can clear no-match results', async () => {
    loadThreeCandidates()
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('Older title')
    const search = screen.getByRole('searchbox', {
      name: 'reviewReminder.search',
    })
    await user.type(search, '  ALPHA  ')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Alpha guide')).toBeVisible()
    await user.clear(search)
    await user.type(search, 'OTHER.EXAMPLE.ORG')
    expect(screen.getByText('Unknown date')).toBeVisible()
    expect(screen.queryByText('Alpha guide')).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'no matching tab')
    expect(screen.getByText('reviewReminder.searchEmpty')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.clearSearch' }),
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(mocks.getReviewCandidates).toHaveBeenCalledTimes(1)
  })

  it('sorts exact dates with unknown dates last and supports title order', async () => {
    loadThreeCandidates()
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('Older title')
    const titles = () =>
      screen
        .getAllByRole('listitem')
        .map((row) => within(row).getByRole('heading').textContent)
    const sort = screen.getByLabelText('reviewReminder.sort')
    expect(titles()).toEqual(['Older title', 'Alpha guide', 'Unknown date'])
    await user.selectOptions(sort, 'newest')
    expect(titles()).toEqual(['Alpha guide', 'Older title', 'Unknown date'])
    await user.selectOptions(sort, 'title')
    expect(titles()).toEqual(['Alpha guide', 'Older title', 'Unknown date'])
    expect(screen.getByText('reviewReminder.unknownDate')).toBeVisible()
  })

  it('renders a canonical timestamp outside the Date range as unknown instead of crashing', async () => {
    mocks.getReviewCandidates.mockResolvedValueOnce([
      {
        id: 'valid',
        title: 'Known date',
        url: 'https://example.com/known',
        firstSavedAt: 0,
      },
      {
        id: 'out-of-range',
        title: 'Imported tab',
        url: 'https://example.com/imported',
        firstSavedAt: Number.MAX_SAFE_INTEGER,
      },
    ])
    render(<ReviewReminderPage search='?review=1' />)
    expect(
      await screen.findByRole('heading', { name: 'Imported tab' }),
    ).toBeVisible()
    expect(screen.getByText('reviewReminder.unknownDate')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'reviewReminder.delete Imported tab',
      }),
    ).toBeEnabled()
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('reviewReminder.sort'), 'newest')
    expect(
      screen
        .getAllByRole('listitem')
        .map((row) => within(row).getByRole('heading').textContent),
    ).toEqual(['Known date', 'Imported tab'])
  })

  it('previews only visible selections and clears selection when the search changes', async () => {
    loadThreeCandidates()
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('Older title')
    await user.click(
      screen.getByRole('checkbox', {
        name: 'reviewReminder.select Older title',
      }),
    )
    await user.type(screen.getByRole('searchbox'), 'Alpha')
    expect(
      screen.getByRole('button', { name: 'reviewReminder.deleteSelected:0' }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.selectVisible' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.deleteSelected:1' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(mocks.preview).toHaveBeenCalledWith({
      kind: 'delete_urls',
      urlIds: ['url-2'],
    })
    expect(mocks.execute).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole('button', { name: 'reviewReminder.cancel' }),
    )
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha guide')).toBeVisible()
  })

  it('confirms individual deletion, reloads the canonical list and undoes the latest deletion', async () => {
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('<b>Saved title</b>')
    await user.click(
      screen.getByRole('button', {
        name: 'reviewReminder.delete <b>Saved title</b>',
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(mocks.execute).not.toHaveBeenCalled()
    mocks.getReviewCandidates.mockResolvedValueOnce([])
    await user.click(
      within(dialog).getByRole('button', {
        name: 'reviewReminder.confirmDelete:1',
      }),
    )
    await screen.findByText('reviewReminder.listEmpty')
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith('preview-1')
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.undo' }),
    )
    expect(await screen.findByText('<b>Saved title</b>')).toBeVisible()
    expect(mocks.undo).toHaveBeenCalledExactlyOnceWith('undo-1')
  })

  it('keeps data and hides private errors when a stale preview cannot be committed', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('private URL in conflict'))
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('<b>Saved title</b>')
    await user.click(
      screen.getByRole('button', {
        name: 'reviewReminder.delete <b>Saved title</b>',
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'reviewReminder.confirmDelete:1',
      }),
    )
    expect(await screen.findByText('reviewReminder.actionError')).toBeVisible()
    expect(screen.getByText('<b>Saved title</b>')).toBeVisible()
    expect(
      screen.queryByText('private URL in conflict'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'reviewReminder.undo' }),
    ).not.toBeInTheDocument()
  })

  it('caps visible selection at the service limit of 100 tabs', async () => {
    mocks.getReviewCandidates.mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({
        id: `url-${i}`,
        title: `Tab ${i}`,
        url: `https://example.com/${i}`,
      })),
    )
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('Tab 100')
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.selectVisible' }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'reviewReminder.select Tab 100' }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.deleteSelected:100' }),
    )
    await screen.findByRole('alertdialog')
    expect(mocks.preview.mock.calls[0]?.[0].urlIds).toHaveLength(100)
  })

  it('prevents repeated writes while confirmation is pending and reports committed notification failures', async () => {
    const pending = Promise.withResolvers<{
      undoId: string
      notificationFailed: boolean
    }>()
    mocks.execute.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('<b>Saved title</b>')
    await user.click(
      screen.getByRole('button', {
        name: 'reviewReminder.delete <b>Saved title</b>',
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'reviewReminder.confirmDelete:1',
    })
    await user.dblClick(confirm)
    expect(confirm).toBeDisabled()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    mocks.getReviewCandidates.mockResolvedValueOnce([])
    await act(async () =>
      pending.resolve({ undoId: 'undo-1', notificationFailed: true }),
    )
    expect(
      await screen.findByText('reviewReminder.notificationFailed'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'reviewReminder.undo' }),
    ).toBeEnabled()
  })

  it('retains undo after a post-delete read failure and allows retry after an undo failure', async () => {
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('<b>Saved title</b>')
    await user.click(
      screen.getByRole('button', {
        name: 'reviewReminder.delete <b>Saved title</b>',
      }),
    )
    await screen.findByRole('alertdialog')
    mocks.getReviewCandidates.mockRejectedValueOnce(
      new Error('private read error'),
    )
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.confirmDelete:1' }),
    )
    expect(await screen.findByText('reviewReminder.listError')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'reviewReminder.delete <b>Saved title</b>',
      }),
    ).toBeDisabled()
    mocks.undo.mockRejectedValueOnce(new Error('private undo error'))
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.undo' }),
    )
    expect(await screen.findByText('reviewReminder.undoError')).toBeVisible()
    expect(screen.queryByText('private undo error')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'reviewReminder.undo' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByText('reviewReminder.listError'),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByText('<b>Saved title</b>')).toBeVisible()
    expect(mocks.undo).toHaveBeenCalledTimes(2)
  })

  it('shows preview failures without writing or exposing error details', async () => {
    mocks.preview.mockRejectedValueOnce(new Error('private preview error'))
    const user = userEvent.setup()
    render(<ReviewReminderPage search='?review=1' />)
    await screen.findByText('<b>Saved title</b>')
    await user.click(
      screen.getByRole('button', {
        name: 'reviewReminder.delete <b>Saved title</b>',
      }),
    )
    expect(await screen.findByText('reviewReminder.actionError')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('private preview error')).not.toBeInTheDocument()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
