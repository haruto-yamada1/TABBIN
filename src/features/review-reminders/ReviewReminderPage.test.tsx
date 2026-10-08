import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultReviewReminderSettings } from './lib/reviewReminderSettings'
import { ReviewReminderPage } from './ReviewReminderPage'

const mocks = vi.hoisted(() => ({
  getReviewCandidates: vi.fn(),
  readReviewReminderSettings: vi.fn(),
}))
vi.mock('@/app/composition/reviewReminders', () => ({
  getReviewCandidates: mocks.getReviewCandidates,
}))
vi.mock('@/lib/storage/review-reminders', () => ({
  readReviewReminderSettings: mocks.readReviewReminderSettings,
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
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
  })
  afterEach(cleanup)

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
})
