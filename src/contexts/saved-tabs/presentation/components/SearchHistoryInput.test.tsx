// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, vars?: Record<string, string>) =>
      vars?.query ? `${key} ${vars.query}` : key,
  }),
}))

import { SearchHistoryInput } from './SearchHistoryInput'

afterEach(cleanup)

const initialEntries = ['youtube ご飯', '太郎 ご飯']

const Harness = ({
  onRemove = vi.fn(async () => {}),
  entries = initialEntries,
}: {
  onRemove?: (query: string) => Promise<void>
  entries?: string[]
}) => {
  const [query, setQuery] = useState('')
  return (
    <SearchHistoryInput
      query={query}
      onQueryChange={setQuery}
      entries={entries}
      onRemove={onRemove}
    />
  )
}

describe('search history suggestions', () => {
  it('shows history on focus, filters it as text changes, and applies a selection', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', {
      name: 'savedTabs.searchPlaceholder',
    })
    await user.click(input)
    const list = screen.getByRole('list', { name: 'savedTabs.searchHistory' })
    expect(within(list).getByText('youtube ご飯')).toBeInTheDocument()
    expect(within(list).getByText('太郎 ご飯')).toBeInTheDocument()
    await user.type(input, 'youtube')
    expect(within(list).getByText('youtube ご飯')).toBeInTheDocument()
    expect(within(list).queryByText('太郎 ご飯')).not.toBeInTheDocument()
    await user.click(within(list).getByText('youtube ご飯'))
    expect(input).toHaveValue('youtube ご飯')
    expect(
      screen.queryByRole('list', { name: 'savedTabs.searchHistory' }),
    ).not.toBeInTheDocument()
  })

  it('deletes only the selected entry without applying it', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn(async () => {})
    render(<Harness onRemove={onRemove} />)
    const input = screen.getByRole('textbox', {
      name: 'savedTabs.searchPlaceholder',
    })
    await user.click(input)
    await user.click(
      screen.getByRole('button', {
        name: 'savedTabs.removeSearchHistory youtube ご飯',
      }),
    )
    expect(onRemove).toHaveBeenCalledWith('youtube ご飯')
    expect(input).toHaveValue('')
  })

  it('supports keyboard selection and Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', {
      name: 'savedTabs.searchPlaceholder',
    })
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'youtube ご飯' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(input).toHaveValue('youtube ご飯')
    await user.click(input)
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('list', { name: 'savedTabs.searchHistory' }),
    ).not.toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('returns focus to the search input when a history item is deleted by keyboard', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn(async () => {})
    render(<Harness onRemove={onRemove} />)
    const input = screen.getByRole('textbox', {
      name: 'savedTabs.searchPlaceholder',
    })
    await user.click(input)
    await user.keyboard('{ArrowDown}{Tab}')
    expect(
      screen.getByRole('button', {
        name: 'savedTabs.removeSearchHistory youtube ご飯',
      }),
    ).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onRemove).toHaveBeenCalledWith('youtube ご飯')
    expect(input).toHaveFocus()
  })

  it('reports deletion failures without changing the current search', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        onRemove={vi.fn().mockRejectedValue(new Error('write failed'))}
      />,
    )
    const input = screen.getByRole('textbox', {
      name: 'savedTabs.searchPlaceholder',
    })
    await user.click(input)
    await user.click(
      screen.getByRole('button', {
        name: 'savedTabs.removeSearchHistory youtube ご飯',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'savedTabs.searchHistoryError',
    )
    expect(input).toHaveValue('')
  })

  it('keeps the just-recorded current query out of an open suggestion list until reopened', async () => {
    const user = userEvent.setup()
    const view = render(<Harness />)
    const input = screen.getByRole('textbox', {
      name: 'savedTabs.searchPlaceholder',
    })
    await user.click(input)
    await user.type(input, 'youtube')
    view.rerender(
      <Harness entries={['youtube', 'youtube ご飯', '太郎 ご飯']} />,
    )
    expect(screen.getByText('youtube ご飯')).toBeInTheDocument()
    expect(
      screen.queryByText('youtube', { exact: true }),
    ).not.toBeInTheDocument()
    await user.click(input)
    expect(screen.getByText('youtube', { exact: true })).toBeInTheDocument()
  })
})
