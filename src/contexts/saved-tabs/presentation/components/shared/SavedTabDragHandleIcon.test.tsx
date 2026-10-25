// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import { ProjectUrlItem } from '@/contexts/saved-tabs/presentation/components/ProjectUrlItem'
import { SortableUrlItem } from '@/contexts/saved-tabs/presentation/components/SortableUrlItem'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useOpenSavedTab } from '@/contexts/saved-tabs/presentation/controllers/useOpenSavedTab'
import type * as I18nLanguage from '@/features/i18n/lib/language'

const dragEvents = vi.hoisted(() => ({ pointer: vi.fn(), keyboard: vi.fn() }))

const language = vi.hoisted(() => ({ current: 'en' as 'en' | 'ja' }))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {
      role: 'button',
      tabIndex: 0,
      'aria-describedby': 'drag-instructions',
    },
    listeners: {
      onPointerDown: dragEvents.pointer,
      onKeyDown: dragEvents.keyboard,
    },
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
  }),
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

const ServerProbe = ({ url }: { url: string }) => (
  <span>{useOpenSavedTab(url) ? 'Open now' : null}</span>
)

const expectNoInlineStatus = (label = 'Open now') => {
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  for (const status of screen.queryAllByText(label)) {
    expect(status).toHaveClass('sr-only')
  }
}

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
  vi.clearAllMocks()
})

describe.each(['domain', 'project'] as const)(
  '%s open tab drag handle indicator',
  (mode) => {
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
      <TooltipProvider delayDuration={0}>
        <SavedTabsUseCasesProvider
          value={{
            deps: {
              ...createSavedTabsPresentationPortsStub(),
              openSavedTabsPort: fake.port,
            },
            useCases: createSavedTabsUseCasesStub(),
          }}
        >
          <span id='drag-instructions' className='sr-only'>
            Press Space or Enter to drag; Escape cancels.
          </span>
          {content}
        </SavedTabsUseCasesProvider>
      </TooltipProvider>
    )

    it('shows the current state and follows open/close updates without changing link actions', async () => {
      const user = userEvent.setup()
      const fake = createOpenTabsFake()
      const onOpen = vi.fn()
      const onDelete = vi.fn()
      fake.setOpen(url, true)
      const { unmount } = render(withPort(fake, row(url, onOpen, onDelete)))

      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).toHaveAttribute('aria-description', 'Open now')
      expectNoInlineStatus()
      const link = screen.getByRole('link', { name: 'Example' })
      expect(link).toHaveAccessibleName('Example')
      await user.click(link)
      expect(onOpen).toHaveBeenCalledWith(url)
      await user.click(screen.getByRole('button', { name: 'Delete tab' }))
      expect(onDelete).toHaveBeenCalledWith(
        mode === 'domain' ? 'group-1' : 'project-1',
        url,
      )

      act(() => fake.setOpen('https://example.com/article#other', true))
      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).toHaveAttribute('aria-description', 'Open now')
      expectNoInlineStatus()
      act(() => fake.setOpen(url, false))
      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).not.toHaveAttribute('aria-description')
      act(() => fake.setOpen(url, true))
      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).toHaveAttribute('aria-description', 'Open now')
      expectNoInlineStatus()

      unmount()
      expect(fake.listeners.size).toBe(0)
    })

    it('updates the URL subscription when a row is reused', () => {
      const fake = createOpenTabsFake()
      const otherUrl = 'https://example.com/other'
      fake.setOpen(url, true)
      const { rerender } = render(withPort(fake))
      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).toHaveAttribute('aria-description', 'Open now')
      expectNoInlineStatus()

      rerender(withPort(fake, row(otherUrl)))
      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).not.toHaveAttribute('aria-description')
      expect(fake.listeners.has(url)).toBe(false)
      act(() => fake.setOpen(otherUrl, true))
      expect(
        screen.getByRole('button', { name: /Drag.*Example/ }),
      ).toHaveAttribute('aria-description', 'Open now')
      expectNoInlineStatus()
    })

    it('renders safely without a runtime port', () => {
      const { rerender } = render(row())
      expect(screen.getByRole('link', { name: 'Example' })).toBeVisible()
      expectNoInlineStatus()
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
      expectNoInlineStatus()
    })

    it('does not expose a browser state in server-rendered markup', () => {
      const fake = createOpenTabsFake()
      fake.setOpen(url, true)
      expect(
        renderToString(withPort(fake, <ServerProbe url={url} />)),
      ).not.toContain('Open now')
      expect(fake.listeners.size).toBe(0)
    })

    it('keeps drag instructions and events on the same handle while state changes', async () => {
      const fake = createOpenTabsFake()
      render(withPort(fake))
      const handle = screen.getByRole('button', { name: /Drag.*Example/ })
      const icon = within(handle).getByTestId('saved-tab-drag-icon')
      expect(icon).not.toBeNull()
      expect(icon).toHaveClass('text-muted-foreground')
      act(() => fake.setOpen(url, true))
      expect(screen.getByRole('button', { name: /Drag.*Example/ })).toBe(handle)
      expect(handle).toHaveAccessibleDescription(
        'Press Space or Enter to drag; Escape cancels. Open now',
      )
      expect(handle).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('drag-instructions'),
      )
      expect(within(handle).getByTestId('saved-tab-drag-icon')).toHaveClass(
        'text-emerald-600',
      )
      const user = userEvent.setup()
      await user.click(within(handle).getByTestId('saved-tab-drag-icon'))
      expect(handle).toHaveFocus()
      await user.keyboard('[Space]')
      expect(dragEvents.pointer).toHaveBeenCalledTimes(1)
      expect(dragEvents.keyboard).toHaveBeenCalledTimes(1)
      act(() => fake.setOpen(url, false))
      expect(screen.getByRole('button', { name: /Drag.*Example/ })).toBe(handle)
      expect(within(handle).getByTestId('saved-tab-drag-icon')).toHaveClass(
        'text-muted-foreground',
      )
    })

    it('shows the explanation only when the handle icon is hovered', async () => {
      const fake = createOpenTabsFake()
      fake.setOpen(url, true)
      const user = userEvent.setup()
      render(withPort(fake))
      expectNoInlineStatus()
      const handle = screen.getByRole('button', { name: /Drag.*Example/ })
      await user.hover(within(handle).getByTestId('saved-tab-drag-icon'))
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Open now')
    })

    it('uses the Japanese label', () => {
      language.current = 'ja'
      const fake = createOpenTabsFake()
      fake.setOpen(url, true)
      render(withPort(fake))
      expect(screen.getByRole('button', { name: /Example/ })).toHaveAttribute(
        'aria-description',
        '開いています',
      )
      expectNoInlineStatus('開いています')
    })
  },
)
