import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMessage } from '@/features/i18n/lib/language'

import type { SavedTabSelectionItem } from './SavedTabsSelectionProvider'
import {
  SavedTabsSelectionProvider,
  useSavedTabSelectionItem,
} from './SavedTabsSelectionProvider'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) =>
      getMessage('en', key, fallback, values),
  }),
}))

let user: ReturnType<typeof userEvent.setup>
beforeEach(() => {
  user = userEvent.setup()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const createItem = (title: string): SavedTabSelectionItem => ({
  groupId: 'group',
  title,
  url: `https://example.com/${title}`,
})
const alpha = createItem('Alpha')
const beta = createItem('Beta')
const gamma = createItem('Gamma')
const delta = createItem('Delta')
const items = [alpha, beta, gamma, delta]

const Row = ({
  item,
  onNavigate = vi.fn(),
}: {
  item: SavedTabSelectionItem
  onNavigate?: () => void
}) => {
  const selection = useSavedTabSelectionItem(item)
  return (
    <div>
      {selection.checkbox}
      <a
        href={item.url}
        onClick={(event) => {
          if (selection.handleSelectionClick(event)) {
            return
          }
          onNavigate()
          event.preventDefault()
        }}
      >
        {item.title}
      </a>
    </div>
  )
}

const StatefulRows = ({ rows }: { rows: SavedTabSelectionItem[] }) => {
  const [count, setCount] = useState(0)
  return (
    <>
      <button type='button' onClick={() => setCount(count + 1)}>
        Child state {count}
      </button>
      <div>
        {rows.map((item) => (
          <Row key={JSON.stringify([item.groupId, item.url])} item={item} />
        ))}
      </div>
    </>
  )
}

const setup = ({
  rows = items,
  scopeKey = '',
  confirmDeleteAll = false,
  onOpen = vi.fn(async () => {}),
  onDelete = vi.fn(async (_items: SavedTabSelectionItem[]) => {}),
} = {}) => {
  const ui = (nextRows = rows, nextScopeKey = scopeKey) => (
    <SavedTabsSelectionProvider
      scopeKey={nextScopeKey}
      confirmDeleteAll={confirmDeleteAll}
      onOpen={onOpen}
      onDelete={onDelete}
    >
      <StatefulRows rows={nextRows} />
    </SavedTabsSelectionProvider>
  )
  const result = render(ui())
  return {
    ...result,
    onOpen,
    onDelete,
    update: (nextRows: SavedTabSelectionItem[], nextScopeKey = scopeKey) =>
      result.rerender(ui(nextRows, nextScopeKey)),
  }
}

const enterSelection = async () => {
  await user.click(screen.getByRole('button', { name: 'Select tabs' }))
}
const checkbox = (title: string) =>
  screen.getByRole('checkbox', { name: `Select ${title}` })
const clickWithModifiers = async (
  element: HTMLElement,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
) => {
  const user = userEvent.setup()
  if (modifiers.shiftKey) {
    await user.keyboard('{Shift>}')
  }
  if (modifiers.ctrlKey) {
    await user.keyboard('{Control>}')
  }
  if (modifiers.metaKey) {
    await user.keyboard('{Meta>}')
  }
  await user.click(element)
  await user.keyboard('{/Shift}{/Control}{/Meta}')
}
const clickLink = async (
  title: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
) => {
  await clickWithModifiers(screen.getByRole('link', { name: title }), modifiers)
}
const deferred = <T,>() => {
  let complete!: (value: T) => void
  let fail!: (reason: Error) => void
  const promise = new Promise<T>((resolve, reject) => {
    complete = resolve
    fail = reject
  })
  return { promise, resolve: complete, reject: fail }
}

describe('saved tab selection', () => {
  it('keeps row links unchanged until explicit selection and toggles plain/Ctrl/Meta clicks while active', async () => {
    const onNavigate = vi.fn()
    render(
      <SavedTabsSelectionProvider
        scopeKey=''
        confirmDeleteAll={false}
        onOpen={async () => {}}
        onDelete={async () => {}}
      >
        <Row item={alpha} onNavigate={onNavigate} />
      </SavedTabsSelectionProvider>,
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await clickLink('Alpha', { ctrlKey: true })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    await enterSelection()
    expect(screen.getByText(/Shift-click selects a range/)).toHaveTextContent(
      'Click or Ctrl/Cmd-click to toggle. Shift-click selects a range. Press Space on a checkbox; Escape clears selection and exits.',
    )
    await clickLink('Alpha')
    expect(checkbox('Alpha')).toBeChecked()
    await clickLink('Alpha', { metaKey: true })
    expect(checkbox('Alpha')).not.toBeChecked()
    await clickLink('Alpha', { ctrlKey: true })
    expect(checkbox('Alpha')).toBeChecked()
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('1 tab selected')
  })

  it('announces zero, one and multiple selected tabs with the matching count', async () => {
    setup()
    await enterSelection()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
    await user.click(checkbox('Alpha'))
    expect(screen.getByRole('status')).toHaveTextContent('1 tab selected')
    await user.click(checkbox('Beta'))
    expect(screen.getByRole('status')).toHaveTextContent('2 tabs selected')
    await user.click(checkbox('Alpha'))
    expect(screen.getByRole('status')).toHaveTextContent('1 tab selected')
    await user.click(checkbox('Beta'))
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
  })

  it('extends forward and reverse ranges in current DOM order after rows reorder', async () => {
    const result = setup()
    await enterSelection()
    result.update([delta, beta, alpha, gamma])
    await clickLink('Delta')
    await clickLink('Alpha', { shiftKey: true })
    expect(checkbox('Delta')).toBeChecked()
    expect(checkbox('Beta')).toBeChecked()
    expect(checkbox('Alpha')).toBeChecked()
    expect(checkbox('Gamma')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    await clickLink('Gamma')
    await clickLink('Beta', { shiftKey: true })
    expect(checkbox('Delta')).not.toBeChecked()
    expect(checkbox('Beta')).toBeChecked()
    expect(checkbox('Alpha')).toBeChecked()
    expect(checkbox('Gamma')).toBeChecked()
  })

  it('supports checkbox Space, shift checkbox ranges, select visible, clear, Done and Escape', async () => {
    const user = userEvent.setup()
    setup()
    await enterSelection()
    checkbox('Alpha').focus()
    await user.keyboard(' ')
    expect(checkbox('Alpha')).toBeChecked()
    await clickWithModifiers(checkbox('Gamma'), { shiftKey: true })
    expect(checkbox('Beta')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Select all visible' }))
    expect(screen.getByRole('status')).toHaveTextContent('4 tabs selected')
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
    expect(screen.getByRole('button', { name: 'Open selected' })).toBeDisabled()
    await clickLink('Beta')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select tabs' })).toHaveFocus()
    await enterSelection()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Select tabs' })).toHaveFocus()
  })

  it('prunes unmounted rows and resets scope without remounting child state', async () => {
    const result = setup()
    await user.click(screen.getByRole('button', { name: 'Child state 0' }))
    await enterSelection()
    await user.click(screen.getByRole('button', { name: 'Select all visible' }))
    result.update([beta])
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 tab selected'),
    )
    result.update([beta], 'new-search')
    expect(checkbox('Beta')).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Child state 1' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
  })

  it('clears stale scope while keeping an in-flight operation locked until it settles', async () => {
    const pending = deferred<undefined>()
    const onDelete = vi.fn(async () => pending.promise)
    const result = setup({ onDelete })
    await enterSelection()
    await clickLink('Alpha')
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    result.update([beta], 'new-search')
    expect(checkbox('Beta')).not.toBeChecked()
    expect(checkbox('Beta')).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
    expect(
      screen.getByRole('button', { name: 'Select all visible' }),
    ).toBeDisabled()
    await act(async () => pending.reject(new Error('previous scope')))
    expect(checkbox('Beta')).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await clickLink('Beta')
    expect(checkbox('Beta')).toBeChecked()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('cancels an obsolete confirmation when the search scope changes', async () => {
    const result = setup({ confirmDeleteAll: true })
    await enterSelection()
    await clickLink('Alpha')
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    result.update(items, 'changed-search')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(checkbox('Alpha')).not.toBeChecked()
    expect(result.onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
  })

  it('keeps identical URLs in distinct groups as distinct targets', async () => {
    const sameUrlItems = [
      alpha,
      { ...alpha, groupId: 'second', title: 'Other Alpha' },
    ]
    const result = setup({ rows: sameUrlItems })
    await enterSelection()
    await user.click(screen.getByRole('button', { name: 'Select all visible' }))
    await user.click(screen.getByRole('button', { name: 'Open selected' }))
    await waitFor(() =>
      expect(result.onOpen).toHaveBeenCalledWith(sameUrlItems),
    )
    expect(screen.getByRole('status')).toHaveTextContent('2 tabs selected')
  })

  it('locks every selection control immediately during opening, rejects a double submit and retains selection', async () => {
    const pending = deferred<undefined>()
    const onOpen = vi.fn(async () => pending.promise)
    const { onDelete } = setup({ onOpen })
    await enterSelection()
    await clickLink('Alpha')
    const button = screen.getByRole('button', { name: 'Open selected' })
    act(() => {
      button.click()
      button.click()
    })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(checkbox('Alpha')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete selected' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Clear selection' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    await clickLink('Beta')
    await user.keyboard('{Escape}')
    expect(checkbox('Alpha')).toBeChecked()
    expect(checkbox('Beta')).not.toBeChecked()
    expect(onDelete).not.toHaveBeenCalled()
    await act(async () => pending.resolve(undefined))
    expect(checkbox('Alpha')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Open selected' })).toBeEnabled()
  })

  it('waits for atomic deletion before clearing selected targets', async () => {
    const pending = deferred<undefined>()
    const onDelete = vi.fn(async () => pending.promise)
    setup({ onDelete })
    await enterSelection()
    await user.click(screen.getByRole('button', { name: 'Select all visible' }))
    const button = screen.getByRole('button', { name: 'Delete selected' })
    act(() => {
      button.click()
      button.click()
    })
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('4 tabs selected')
    expect(
      screen.getByRole('button', { name: 'Deleting selected…' }),
    ).toBeDisabled()
    await act(async () => pending.resolve(undefined))
    expect(checkbox('Gamma')).not.toBeChecked()
    expect(checkbox('Alpha')).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['open', 'delete'] as const)(
    'retains selection and a fixed error after thrown %s failure',
    async (kind) => {
      const fail = vi.fn(async () => {
        throw new Error('private details')
      })
      setup(kind === 'open' ? { onOpen: fail } : { onDelete: fail })
      await enterSelection()
      await clickLink('Alpha')
      await user.click(
        screen.getByRole('button', {
          name: kind === 'open' ? 'Open selected' : 'Delete selected',
        }),
      )
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          kind === 'open'
            ? 'Could not open selected tabs. Your selection is unchanged.'
            : 'Could not delete selected tabs. Your selection is unchanged.',
        ),
      )
      expect(checkbox('Alpha')).toBeChecked()
      expect(screen.queryByText('private details')).not.toBeInTheDocument()
    },
  )

  it('confirms a single selected tab before deleting that exact target', async () => {
    const result = setup({ confirmDeleteAll: true })
    await enterSelection()
    await clickLink('Alpha')
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete 1 selected tab?',
    })
    expect(result.onDelete).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete selected' }),
    )
    await waitFor(() => expect(result.onDelete).toHaveBeenCalledWith([alpha]))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 tabs selected')
  })

  it('freezes the selected delete targets while confirming, cancels safely, then submits the exact count', async () => {
    const user = userEvent.setup()
    const result = setup({ confirmDeleteAll: true })
    await enterSelection()
    await clickLink('Alpha')
    await clickLink('Gamma')
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete 2 selected tabs?',
    })
    expect(result.onDelete).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(checkbox('Alpha')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(result.onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    result.update([gamma, delta])
    expect(
      screen.getByRole('alertdialog', { name: 'Delete 2 selected tabs?' }),
    ).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete selected',
      }),
    )
    await waitFor(() =>
      expect(result.onDelete).toHaveBeenCalledWith([alpha, gamma]),
    )
    expect(dialog).not.toBeInTheDocument()
  })

  it('confirms opening at ten targets and freezes that batch until confirmation', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...alpha,
      title: `Tab ${index}`,
      url: `https://example.com/${index}`,
    }))
    const result = setup({ rows })
    await enterSelection()
    await user.click(screen.getByRole('button', { name: 'Select all visible' }))
    await user.click(screen.getByRole('button', { name: 'Open selected' }))
    expect(result.onOpen).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', {
      name: 'Open 10 selected tabs?',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Open selected' }),
    )
    await waitFor(() => expect(result.onOpen).toHaveBeenCalledWith(rows))
    expect(screen.getByRole('status')).toHaveTextContent('10 tabs selected')
  })

  it('offers no selection behavior outside the provider', async () => {
    const onNavigate = vi.fn()
    render(<Row item={alpha} onNavigate={onNavigate} />)
    await clickLink('Alpha')
    expect(onNavigate).toHaveBeenCalledOnce()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
