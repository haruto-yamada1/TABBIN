// @vitest-environment jsdom
import { composeStories } from '@storybook/react'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'

import * as visualStories from './VisualRegression.stories'

// Only play runs against the controlled DOM below. Keep the unrelated story
// renderers and fixtures outside this readiness test's module graph.
vi.mock('@/contexts/saved-tabs/presentation/pages/SavedTabsPage', () => ({
  SavedTabsPage: () => null,
}))
vi.mock('@/features/ai-chat/components/SavedTabsChatPanel', () => ({
  SavedTabsChatPanel: () => null,
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: () => null,
}))
vi.mock('@/features/options/routes/OptionsRoute', () => ({
  OptionsRoute: () => null,
}))
vi.mock('./testing/VisualRegression.fixture', () => ({
  createVisualSavedTabsComposition: vi.fn(),
  visualStoryStorage: {},
}))

const { Import } = composeStories(visualStories)

describe('Import visual story readiness', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('waits for the mounted dialog to become visible before marking ready', async () => {
    const messages = getMessages('en')
    const canvasElement = document.createElement('div')
    const trigger = document.createElement('button')
    trigger.textContent = messages['options.importExport.import']
    canvasElement.append(trigger)
    document.body.append(canvasElement)

    // A portal can mount before its opening animation leaves opacity zero.
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute(
      'aria-label',
      messages['options.importExport.dialogTitle'],
    )
    dialog.style.opacity = '0'
    const dropzone = document.createElement('div')
    dropzone.dataset.testid = 'import-dropzone'
    dialog.append(dropzone)
    trigger.addEventListener('click', () => document.body.append(dialog))

    const firstVisibilityCheck = Promise.withResolvers<undefined>()
    const getComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        if (element === dropzone) {
          firstVisibilityCheck.resolve(undefined)
        }
        return getComputedStyle(element, pseudo)
      },
    )

    assert(Import.play)
    const result = Import.play({
      canvasElement,
      globals: { locale: 'en' },
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    await firstVisibilityCheck.promise
    expect(canvasElement).not.toHaveAttribute('data-visual-ready')

    dialog.style.opacity = '1'

    expect(await result).toBeUndefined()
    expect(canvasElement).toHaveAttribute('data-visual-ready', 'import')
  })
})
