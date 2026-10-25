// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SAVED_TAB_TITLE_ORIGINS } from '@/constants/savedTabTitleIndicator'
import { getMessages } from '@/features/i18n/messages'

import { SavedTabTitleSettings } from './SavedTabTitleSettings'

const mocks = vi.hoisted(() => ({
  language: 'en',
  read: vi.fn(),
  save: vi.fn(),
  contains: vi.fn(),
  request: vi.fn(),
  added: { addListener: vi.fn(), removeListener: vi.fn() },
  removed: { addListener: vi.fn(), removeListener: vi.fn() },
  storage: { addListener: vi.fn(), removeListener: vi.fn() },
}))

vi.mock('@/lib/storage/saved-tab-title-indicator', () => ({
  readSavedTabTitleEnabled: mocks.read,
  setSavedTabTitleEnabled: mocks.save,
}))
vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageOnChanged: () => mocks.storage,
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages(
        mocks.language === 'ja' ? 'ja' : 'en',
      )
      return messages[key] ?? key
    },
  }),
}))

const permissionRequest = {
  permissions: ['scripting'],
  origins: [...SAVED_TAB_TITLE_ORIGINS],
}
const getToggle = () =>
  screen.getByRole('checkbox', { name: 'Show ✓ in saved tab titles' })
const ready = async () => {
  await waitFor(() => expect(getToggle()).toBeEnabled())
}

describe('SavedTabTitleSettings', () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    vi.clearAllMocks()
    user = userEvent.setup()
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('browser', {
      permissions: {
        contains: mocks.contains,
        request: mocks.request,
        onAdded: mocks.added,
        onRemoved: mocks.removed,
      },
    })
    mocks.language = 'en'
    mocks.read.mockResolvedValue(false)
    mocks.save.mockImplementation(async (enabled: boolean) => enabled)
    mocks.contains.mockResolvedValue(true)
    mocks.request.mockResolvedValue(true)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each([undefined, {}, { permissions: {} }])(
    'isolates an unavailable permission API without crashing settings: %j',
    async (api) => {
      vi.stubGlobal('browser', api)
      render(
        <>
          <h1>Existing settings</h1>
          <SavedTabTitleSettings />
        </>,
      )
      expect(
        screen.getByRole('heading', { name: 'Existing settings' }),
      ).toBeInTheDocument()
      expect(getToggle()).toBeDisabled()
      expect(getToggle()).not.toBeChecked()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Reload the settings page',
      )
      await user.click(getToggle())
      expect(mocks.request).not.toHaveBeenCalled()
      expect(mocks.save).not.toHaveBeenCalled()
    },
  )

  it('starts off and explains optional site access without requesting on mount', async () => {
    render(<SavedTabTitleSettings />)
    await ready()
    expect(getToggle()).not.toBeChecked()
    expect(getToggle()).toHaveAccessibleDescription(
      /HTTP.*HTTPS.*browser pages/i,
    )
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('uses the Chrome MV3 permission API when the browser namespace is absent', async () => {
    vi.stubGlobal('chrome', Reflect.get(globalThis, 'browser'))
    vi.stubGlobal('browser', undefined)
    render(<SavedTabTitleSettings />)
    await ready()
    await user.click(getToggle())
    await waitFor(() => expect(getToggle()).toBeChecked())
    expect(mocks.request).toHaveBeenCalledWith(permissionRequest)
    expect(mocks.save).toHaveBeenCalledWith(true)
  })

  it('keeps a stored preference off when access is missing and never requests it automatically', async () => {
    mocks.read.mockResolvedValue(true)
    mocks.contains.mockResolvedValue(false)
    render(<SavedTabTitleSettings />)
    await ready()
    expect(getToggle()).not.toBeChecked()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('shows an actionable load error without exposing storage details or requesting access', async () => {
    mocks.read.mockRejectedValue(new Error('private storage read failure'))
    render(<SavedTabTitleSettings />)
    await ready()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reload the settings page',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'private storage read failure',
    )
    expect(getToggle()).not.toBeChecked()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('reflects device-local preference changes and ignores an older pending read', async () => {
    let finishOldRead: ((enabled: boolean) => void) | undefined
    mocks.read.mockImplementationOnce(
      async () =>
        new Promise<boolean>((resolve) => {
          finishOldRead = resolve
        }),
    )
    const { unmount } = render(<SavedTabTitleSettings />)
    const onStorage = mocks.storage.addListener.mock.calls[0]?.[0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void
    await act(async () => {
      onStorage({ userSettings: { newValue: {} } }, 'local')
      onStorage({ savedTabTitleIndicatorEnabled: { newValue: true } }, 'sync')
    })
    expect(mocks.read).toHaveBeenCalledOnce()
    await act(async () => {
      onStorage({ savedTabTitleIndicatorEnabled: { newValue: false } }, 'local')
    })
    await ready()
    await act(async () => {
      finishOldRead?.(true)
    })
    expect(getToggle()).not.toBeChecked()
    mocks.read.mockResolvedValue(true)
    await act(async () => {
      onStorage({ savedTabTitleIndicatorEnabled: { newValue: true } }, 'local')
    })
    await waitFor(() => expect(getToggle()).toBeChecked())
    expect(mocks.request).not.toHaveBeenCalled()
    unmount()
    expect(mocks.storage.removeListener).toHaveBeenCalledWith(onStorage)
  })

  it('requests from the click and saves only after the grant is confirmed', async () => {
    let grant: ((enabled: boolean) => void) | undefined
    mocks.request.mockImplementation(
      async () =>
        new Promise<boolean>((resolve) => {
          grant = resolve
        }),
    )
    render(<SavedTabTitleSettings />)
    await ready()
    await user.click(getToggle())
    expect(mocks.request).toHaveBeenCalledWith(permissionRequest)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(getToggle()).toBeDisabled()
    await act(async () => {
      grant?.(true)
    })
    await waitFor(() => expect(getToggle()).toBeChecked())
    expect(mocks.contains).toHaveBeenCalledWith(permissionRequest)
    expect(mocks.save).toHaveBeenCalledWith(true)
  })

  it.each(['denied', 'missing', 'error'])(
    'keeps off and offers a retry when permission is %s',
    async (result) => {
      render(<SavedTabTitleSettings />)
      await ready()
      if (result === 'denied') {
        mocks.request.mockResolvedValue(false)
      }
      if (result === 'missing') {
        mocks.contains.mockResolvedValue(false)
      }
      if (result === 'error') {
        mocks.request.mockRejectedValue(new Error('private browser error'))
      }
      await user.click(getToggle())
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(getToggle()).not.toBeChecked()
      expect(getToggle()).toBeEnabled()
      expect(mocks.save).not.toHaveBeenCalledWith(true)
      expect(screen.getByRole('alert')).not.toHaveTextContent(
        'private browser error',
      )
      mocks.request.mockResolvedValue(true)
      mocks.contains.mockResolvedValue(true)
      await user.click(getToggle())
      await waitFor(() => expect(getToggle()).toBeChecked())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('turns off without a permission request and reflects external revocation', async () => {
    mocks.read.mockResolvedValue(true)
    const { unmount } = render(<SavedTabTitleSettings />)
    await waitFor(() => expect(getToggle()).toBeChecked())
    await user.click(getToggle())
    await waitFor(() => expect(getToggle()).not.toBeChecked())
    expect(mocks.save).toHaveBeenCalledWith(false)
    expect(mocks.request).not.toHaveBeenCalled()
    unmount()

    render(<SavedTabTitleSettings />)
    await waitFor(() => expect(getToggle()).toBeChecked())
    mocks.contains.mockResolvedValue(false)
    const onRemoved = mocks.removed.addListener.mock.calls.at(
      -1,
    )?.[0] as () => void
    await act(async () => {
      onRemoved()
    })
    await waitFor(() => expect(getToggle()).not.toBeChecked())
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.removed.removeListener).toHaveBeenCalled()
  })

  it('shows a localized storage error without claiming an enabled state', async () => {
    mocks.language = 'ja'
    mocks.save.mockRejectedValue(new Error('private storage failure'))
    render(<SavedTabTitleSettings />)
    const toggle = await screen.findByRole('checkbox', {
      name: '保存済みタブのタイトルに ✓ を表示する',
    })
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '設定を保存できませんでした',
      ),
    )
    expect(toggle).not.toBeChecked()
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'private storage failure',
    )
  })
})
