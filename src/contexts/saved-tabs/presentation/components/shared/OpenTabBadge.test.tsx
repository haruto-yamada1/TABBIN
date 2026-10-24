// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import { ProjectUrlItem } from '@/contexts/saved-tabs/presentation/components/ProjectUrlItem'
import { SortableUrlItem } from '@/contexts/saved-tabs/presentation/components/SortableUrlItem'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import type * as I18nLanguage from '@/features/i18n/lib/language'

import { OpenTabBadge } from './OpenTabBadge'

const language = vi.hoisted(() => ({ current: 'en' as 'en' | 'ja' }))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn() }),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessage } = await vi.importActual<typeof I18nLanguage>(
    '@/features/i18n/lib/language',
  )
  return {
    useI18n: () => ({
      t: (key: string, fallback?: string, values?: Record<string, string>) =>
        getMessage(language.current, key, fallback, values),
    }),
  }
})

const createOpenTabsFake = () => {
  const openUrls = new Set<string>()
  const listeners = new Map<string, Set<() => void>>()
  const port = {
    getSnapshot: (url: string) => openUrls.has(url),
    subscribe: (url: string, listener: () => void) => {
      const callbacks = listeners.get(url) ?? new Set()
      callbacks.add(listener)
      listeners.set(url, callbacks)
      return () => {
        callbacks.delete(listener)
        if (callbacks.size === 0) {
          listeners.delete(url)
        }
      }
    },
  }
  return {
    port,
    listeners,
    setOpen: (url: string, isOpen: boolean) => {
      if (isOpen) {
        openUrls.add(url)
      } else {
        openUrls.delete(url)
      }
      for (const listener of listeners.get(url) ?? []) {
        listener()
      }
    },
  }
}

afterEach(() => {
  cleanup()
  language.current = 'en'
})

describe.each(['domain', 'project'] as const)('%s open tab badge', (mode) => {
  const url = 'https://example.com/article'
  const row = (value = url, onOpen = vi.fn(), onDelete = vi.fn()) => {
    const settings = {
      ...savedTabsDefaultUserSettings,
      confirmDeleteEach: false,
    }
    return mode === 'domain' ? (
      <SortableUrlItem
        url={value}
        title='Example'
        id='url-1'
        groupId='group-1'
        settings={settings}
        handleOpenTab={onOpen}
        handleDeleteUrl={onDelete}
        handleUpdateUrls={vi.fn()}
      />
    ) : (
      <ProjectUrlItem
        item={{ url: value, title: 'Example' }}
        projectId='project-1'
        settings={settings}
        handleOpenUrl={onOpen}
        handleDeleteUrl={onDelete}
      />
    )
  }
  const withPort = (
    fake: ReturnType<typeof createOpenTabsFake>,
    content = row(),
  ) => (
    <SavedTabsUseCasesProvider
      value={{
        deps: {
          ...createSavedTabsPresentationPortsStub(),
          openSavedTabsPort: fake.port,
        },
        useCases: createSavedTabsUseCasesStub(),
      }}
    >
      {content}
    </SavedTabsUseCasesProvider>
  )

  it('shows the current state and follows open/close updates without changing link actions', async () => {
    const user = userEvent.setup()
    const fake = createOpenTabsFake()
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    fake.setOpen(url, true)
    const { unmount } = render(withPort(fake, row(url, onOpen, onDelete)))

    expect(screen.getByText('Open now')).toBeVisible()
    const link = screen.getByRole('link', { name: 'Example' })
    expect(link).not.toContainElement(screen.getByText('Open now'))
    await user.click(link)
    expect(onOpen).toHaveBeenCalledWith(url)
    await user.click(screen.getByRole('button', { name: 'Delete tab' }))
    expect(onDelete).toHaveBeenCalledWith(
      mode === 'domain' ? 'group-1' : 'project-1',
      url,
    )

    act(() => fake.setOpen('https://example.com/article#other', true))
    expect(screen.getByText('Open now')).toBeVisible()
    act(() => fake.setOpen(url, false))
    expect(screen.queryByText('Open now')).not.toBeInTheDocument()
    act(() => fake.setOpen(url, true))
    expect(screen.getByText('Open now')).toBeVisible()

    unmount()
    expect(fake.listeners.size).toBe(0)
  })

  it('updates the URL subscription when a row is reused', () => {
    const fake = createOpenTabsFake()
    const otherUrl = 'https://example.com/other'
    fake.setOpen(url, true)
    const { rerender } = render(withPort(fake))
    expect(screen.getByText('Open now')).toBeVisible()

    rerender(withPort(fake, row(otherUrl)))
    expect(screen.queryByText('Open now')).not.toBeInTheDocument()
    expect(fake.listeners.has(url)).toBe(false)
    act(() => fake.setOpen(otherUrl, true))
    expect(screen.getByText('Open now')).toBeVisible()
  })

  it('renders safely without a runtime port', () => {
    const { rerender } = render(row())
    expect(screen.getByRole('link', { name: 'Example' })).toBeVisible()
    expect(screen.queryByText('Open now')).not.toBeInTheDocument()
    rerender(
      <SavedTabsUseCasesProvider
        value={{
          deps: createSavedTabsPresentationPortsStub(),
          useCases: createSavedTabsUseCasesStub(),
        }}
      >
        {row()}
      </SavedTabsUseCasesProvider>,
    )
    expect(screen.queryByText('Open now')).not.toBeInTheDocument()
  })

  it('does not expose a browser state in server-rendered markup', () => {
    const fake = createOpenTabsFake()
    fake.setOpen(url, true)
    expect(
      renderToString(withPort(fake, <OpenTabBadge url={url} />)),
    ).not.toContain('Open now')
    expect(fake.listeners.size).toBe(0)
  })

  it('uses the Japanese label', () => {
    language.current = 'ja'
    const fake = createOpenTabsFake()
    fake.setOpen(url, true)
    render(withPort(fake))
    expect(screen.getByText('開いています')).toBeVisible()
  })
})
