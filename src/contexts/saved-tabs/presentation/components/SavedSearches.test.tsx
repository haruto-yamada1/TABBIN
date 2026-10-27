// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, values?: Record<string, string>) =>
      values?.name ? `${key} ${values.name}` : key,
  }),
}))

import { SavedSearches } from './SavedSearches'

afterEach(cleanup)

describe('SavedSearches', () => {
  it('saves a named query, applies an existing query and manages it', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onRename = vi.fn().mockResolvedValue(undefined)
    const onRemove = vi.fn().mockResolvedValue(undefined)
    const onApply = vi.fn()
    render(
      <SavedSearches
        loading={false}
        loadError={false}
        searchQuery='example'
        searches={[{ id: '1', name: 'Work', query: 'docs' }]}
        onSave={onSave}
        onRename={onRename}
        onRemove={onRemove}
        onApply={onApply}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.savedSearches' }),
    )
    await user.type(
      screen.getByLabelText('savedTabs.savedSearchName'),
      '  New  ',
    )
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.saveSearch' }),
    )
    expect(onSave).toHaveBeenCalledWith('New', 'example')
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.applySearch Work' }),
    )
    expect(onApply).toHaveBeenCalledWith('docs')
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.savedSearches' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.renameSearch Work' }),
    )
    const rename = screen.getByLabelText('savedTabs.savedSearchName')
    expect(rename).toHaveFocus()
    await user.clear(rename)
    await user.type(rename, 'Renamed{Enter}')
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('1', 'Renamed'))
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.removeSearch Work' }),
    )
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('1'))
  })

  it('prevents empty names and queries and reports failed writes', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new Error('storage failed'))
    const props = {
      loading: false,
      loadError: false,
      searchQuery: '  ',
      searches: [],
      onSave,
      onRename: vi.fn(),
      onRemove: vi.fn(),
      onApply: vi.fn(),
    }
    const view = render(<SavedSearches {...props} />)
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.savedSearches' }),
    )
    await user.type(screen.getByLabelText('savedTabs.savedSearchName'), 'Name')
    expect(
      screen.getByRole('button', { name: 'savedTabs.saveSearch' }),
    ).toBeDisabled()
    view.rerender(<SavedSearches {...props} searchQuery='needle' />)
    await user.clear(screen.getByLabelText('savedTabs.savedSearchName'))
    expect(
      screen.getByRole('button', { name: 'savedTabs.saveSearch' }),
    ).toBeDisabled()
    await user.type(screen.getByLabelText('savedTabs.savedSearchName'), 'Name')
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.saveSearch' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'savedTabs.savedSearchError',
    )
    expect(onSave).toHaveBeenCalledWith('Name', 'needle')
  })

  it('blocks interaction while loading or after a read failure', async () => {
    const user = userEvent.setup()
    const props = {
      loading: true,
      loadError: false,
      searchQuery: 'search',
      searches: [],
      onSave: vi.fn(),
      onRename: vi.fn(),
      onRemove: vi.fn(),
      onApply: vi.fn(),
    }
    const view = render(<SavedSearches {...props} />)
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.savedSearches' }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'savedTabs.savedSearchLoading',
    )
    expect(
      screen.queryByLabelText('savedTabs.savedSearchName'),
    ).not.toBeInTheDocument()
    view.rerender(<SavedSearches {...props} loading={false} loadError />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'savedTabs.savedSearchLoadError',
    )
    expect(
      screen.queryByText('savedTabs.noSavedSearches'),
    ).not.toBeInTheDocument()
  })

  it('explains name, query and count limits while allowing rename at capacity', async () => {
    const user = userEvent.setup()
    const searches = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Search ${i}`,
      query: 'a',
    }))
    const props = {
      loading: false,
      loadError: false,
      searchQuery: 'x'.repeat(2049),
      searches,
      onSave: vi.fn(),
      onRename: vi.fn().mockResolvedValue(undefined),
      onRemove: vi.fn(),
      onApply: vi.fn(),
    }
    render(<SavedSearches {...props} />)
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.savedSearches' }),
    )
    expect(
      screen.getByText('savedTabs.savedSearchQueryLimit'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('savedTabs.savedSearchCountLimit'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'savedTabs.renameSearch Search 0' }),
    )
    const name = screen.getByLabelText('savedTabs.savedSearchName')
    await user.clear(name)
    await user.type(name, 'a'.repeat(101))
    expect(
      screen.getByText('savedTabs.savedSearchNameLimit'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'savedTabs.confirmSearchRename' }),
    ).toBeDisabled()
    await user.clear(name)
    await user.type(name, 'Renamed{Enter}')
    expect(props.onRename).toHaveBeenCalledWith('0', 'Renamed')
  })
})
