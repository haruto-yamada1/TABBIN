// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'

import { ProjectUrlItem } from './ProjectUrlItem'
import { SortableUrlItem } from './SortableUrlItem'

const productionCountdown = vi.hoisted(() => ({ render: vi.fn(() => null) }))
vi.mock('@/utils/datetime', () => ({
  TimeRemaining: productionCountdown.render,
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
  }),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language: 'en', t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('practice saved URL activation', () => {
  it.each(['domain', 'custom'] as const)(
    '%s simulates URL activation without a browser navigation or native URL drag',
    async (mode) => {
      const open = vi.fn()
      const messaging = vi.fn()
      const url = 'https://practice.example/article'
      const title = 'Practice article'
      const settings = savedTabsDefaultUserSettings
      const deps = createSavedTabsPresentationPortsStub({
        messagingPort: { send: messaging },
      })
      const value = {
        deps,
        useCases: createSavedTabsUseCasesStub(),
        interactionMode: 'practice' as const,
      }
      render(
        <SavedTabsUseCasesProvider value={value}>
          {mode === 'domain' ? (
            <SortableUrlItem
              url={url}
              title={title}
              id='practice-url'
              groupId='practice-group'
              settings={settings}
              savedAt={1}
              autoDeletePeriod='1day'
              handleOpenTab={open}
              handleDeleteUrl={vi.fn()}
              handleUpdateUrls={vi.fn()}
            />
          ) : (
            <ProjectUrlItem
              item={{ url, title }}
              projectId='practice-project'
              settings={settings}
              handleOpenUrl={open}
              handleDeleteUrl={vi.fn()}
            />
          )}
        </SavedTabsUseCasesProvider>,
      )

      const activation = screen.getByRole('button', { name: title })
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(activation).not.toHaveAttribute('href')
      expect(activation).not.toHaveAttribute('draggable', 'true')
      expect(productionCountdown.render).not.toHaveBeenCalled()

      const user = userEvent.setup()
      await user.click(activation)
      expect(open).toHaveBeenLastCalledWith(url)
      activation.focus()
      await user.keyboard('{Enter}')
      expect(open).toHaveBeenCalledTimes(2)

      await user.keyboard('{Meta>}')
      await user.click(activation)
      await user.keyboard('{/Meta}{Control>}')
      await user.click(activation)
      await user.keyboard('{/Control}{Shift>}')
      await user.click(activation)
      await user.keyboard('{/Shift}')
      fireEvent(
        activation,
        new MouseEvent('auxclick', { button: 1, bubbles: true }),
      )
      fireEvent.contextMenu(activation)
      const dataTransfer = { setData: vi.fn() }
      fireEvent.dragStart(activation, { dataTransfer })
      expect(dataTransfer.setData).not.toHaveBeenCalled()
      expect(messaging).not.toHaveBeenCalled()
    },
  )
})
