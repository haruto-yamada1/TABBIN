// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LINK_CAPTURE_SETTINGS_KEY } from '@/constants/linkCapture'
import { getMessages } from '@/features/i18n/messages'
import type * as LinkCaptureStorage from '@/lib/storage/link-capture-settings'
import { DEFAULT_LINK_CAPTURE_SETTINGS } from '@/lib/storage/link-capture-settings'

import { LinkCaptureSettings } from './LinkCaptureSettings'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  contains: vi.fn(),
  request: vi.fn(),
  added: { addListener: vi.fn(), removeListener: vi.fn() },
  removed: { addListener: vi.fn(), removeListener: vi.fn() },
  storage: { addListener: vi.fn(), removeListener: vi.fn() },
}))
vi.mock('@/lib/storage/link-capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof LinkCaptureStorage>()),
  readLinkCaptureSettings: mocks.read,
  writeLinkCaptureSettings: mocks.write,
}))
vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageOnChanged: () => mocks.storage,
  getChromeStorageLocal: () => ({
    get: async () => ({ [LINK_CAPTURE_SETTINGS_KEY]: await mocks.read() }),
    set: async (values: Record<string, unknown>) => {
      await mocks.write(values[LINK_CAPTURE_SETTINGS_KEY])
    },
  }),
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages('en')
      return messages[key] ?? key
    },
  }),
}))
const dispatchKey = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        ...init,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
}
const toggle = () =>
  screen.getByRole('checkbox', { name: 'Enable link selection and saving' })
const ready = async () => waitFor(() => expect(toggle()).toBeEnabled())
describe('LinkCaptureSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('browser', {
      permissions: {
        contains: mocks.contains,
        request: mocks.request,
        onAdded: mocks.added,
        onRemoved: mocks.removed,
      },
    })
    vi.stubGlobal('chrome', undefined)
    let pending: Promise<unknown> = Promise.resolve()
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>,
        ) => {
          // oxlint-disable-next-line promise/prefer-catch -- Handle only the original promise rejection.
          const result = pending.then(operation, operation)
          // oxlint-disable-next-line promise/prefer-catch -- Handle only the original promise rejection.
          pending = result.then(
            () => undefined,
            () => undefined,
          )
          return result
        },
      },
    })
    mocks.read.mockResolvedValue(structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS))
    mocks.write.mockImplementation(async (value) => value)
    mocks.contains.mockResolvedValue(true)
    mocks.request.mockResolvedValue(true)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('starts OFF and explains permission before requesting from enable click', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings />)
    await ready()
    expect(toggle()).not.toBeChecked()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(screen.getByText(/HTTP.*HTTPS.*Browser pages/)).toBeInTheDocument()
    await user.click(toggle())
    await waitFor(() => expect(toggle()).toBeChecked())
    expect(mocks.request).toHaveBeenCalledWith({
      permissions: ['scripting'],
      origins: ['http://*/*', 'https://*/*'],
    })
    expect(mocks.write).toHaveBeenCalledWith({
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      enabled: true,
    })
  })

  it('does not save enabled after a denied grant and can retry', async () => {
    const user = userEvent.setup()
    mocks.request.mockResolvedValue(false)
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(toggle())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Site access was not granted',
    )
    expect(toggle()).not.toBeChecked()
    expect(mocks.write).not.toHaveBeenCalled()
    mocks.request.mockResolvedValue(true)
    await user.click(toggle())
    await waitFor(() => expect(toggle()).toBeChecked())
  })

  it('preserves a shortcut changed in another page while permission is pending', async () => {
    const user = userEvent.setup()
    const permission = Promise.withResolvers<boolean>()
    let stored = structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS)
    mocks.read.mockImplementation(async () => structuredClone(stored))
    mocks.write.mockImplementation(async (value) => {
      stored = structuredClone(value)
      return stored
    })
    mocks.request.mockImplementationOnce(async () => {
      expect(mocks.read).toHaveBeenCalledTimes(1)
      return permission.promise
    })
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(toggle())
    expect(toggle()).toBeDisabled()
    stored.shortcut = { ...stored.shortcut, code: 'F8', key: 'F8' }
    const changed = mocks.storage.addListener.mock.calls[0]?.[0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void
    act(() => {
      changed({ [LINK_CAPTURE_SETTINGS_KEY]: { newValue: stored } }, 'local')
    })
    await screen.findByText('F8 (F8)')
    await act(async () => permission.resolve(true))
    await waitFor(() => expect(toggle()).toBeChecked())
    expect(stored).toEqual({
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      enabled: true,
      shortcut: {
        ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
        code: 'F8',
        key: 'F8',
      },
    })
    expect(screen.getByText('F8 (F8)')).toBeInTheDocument()
  })

  it('preserves the latest stored shortcut when turning OFF before a storage event', async () => {
    const user = userEvent.setup()
    let stored = {
      ...structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS),
      enabled: true,
    }
    mocks.read.mockImplementation(async () => structuredClone(stored))
    mocks.write.mockImplementation(async (value) => {
      stored = structuredClone(value)
      return stored
    })
    render(<LinkCaptureSettings />)
    await ready()
    stored.shortcut = { ...stored.shortcut, code: 'F8', key: 'F8' }
    await user.click(toggle())
    await waitFor(() => expect(toggle()).not.toBeChecked())
    expect(stored.enabled).toBe(false)
    expect(stored.shortcut.code).toBe('F8')
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it.each(['Save key', 'Reset key'])(
    'preserves the latest stored enable preference on %s before a storage event',
    async (action) => {
      const user = userEvent.setup()
      let stored = structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS)
      mocks.read.mockImplementation(async () => structuredClone(stored))
      mocks.write.mockImplementation(async (value) => {
        stored = structuredClone(value)
        return stored
      })
      render(<LinkCaptureSettings />)
      await ready()
      if (action === 'Save key') {
        await user.click(screen.getByRole('button', { name: 'Change key' }))
        dispatchKey({ code: 'F8', key: 'F8' })
      }
      stored.enabled = true
      await user.click(screen.getByRole('button', { name: action }))
      await waitFor(() => expect(mocks.write).toHaveBeenCalled())
      expect(stored.enabled).toBe(true)
      expect(stored.shortcut.code).toBe(action === 'Save key' ? 'F8' : 'KeyZ')
      expect(toggle()).toBeChecked()
    },
  )

  it.each([false, true])(
    'fails closed with load guidance when the latest settings cannot be read before toggling from %s',
    async (enabled) => {
      const user = userEvent.setup()
      mocks.read.mockResolvedValue({
        ...DEFAULT_LINK_CAPTURE_SETTINGS,
        enabled,
      })
      render(<LinkCaptureSettings />)
      await ready()
      mocks.read.mockRejectedValue(new Error('private failure'))
      await user.click(toggle())
      expect(await screen.findByRole('alert')).toHaveTextContent('Reload')
      expect(screen.getByRole('alert')).not.toHaveTextContent('private failure')
      expect(toggle()).toBeDisabled()
      expect(mocks.write).not.toHaveBeenCalled()
    },
  )

  it('records an arbitrary captured symbol code and offers explicit save and reset', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'Semicolon', key: 'ö', shiftKey: true })
    expect(screen.getByText('Shift + Semicolon (ö)')).toBeInTheDocument()
    expect(mocks.write).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() =>
      expect(mocks.write).toHaveBeenCalledWith({
        ...DEFAULT_LINK_CAPTURE_SETTINGS,
        shortcut: {
          ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
          code: 'Semicolon',
          key: 'ö',
          shiftKey: true,
        },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Reset key' }))
    await waitFor(() =>
      expect(mocks.write).toHaveBeenLastCalledWith(
        DEFAULT_LINK_CAPTURE_SETTINGS,
      ),
    )
  })

  it('rejects reserved and composition events without saving a fake key', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'KeyL', key: 'l', ctrlKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent('browser or OS')
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'KeyA', key: 'a', isComposing: true })
    expect(screen.getByRole('alert')).toHaveTextContent('AltGraph')
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('cancels on focus loss and reports uncaptured events after timeout', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    fireEvent.blur(window)
    expect(screen.queryByText(/Press a key/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    fireEvent.blur(window)
    const timer = vi.spyOn(window, 'setTimeout')
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    const expire = timer.mock.calls.find(([, delay]) => delay === 10000)?.[0]
    expect(expire).toBeTypeOf('function')
    act(() => {
      if (typeof expire === 'function') {
        expire()
      }
    })
    timer.mockRestore()
    expect(screen.getByRole('alert')).toHaveTextContent('No usable key event')
  })

  it('preserves displayed settings after failed writes and reflects permission revocation', async () => {
    const user = userEvent.setup()
    mocks.read.mockResolvedValue({
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      enabled: true,
    })
    render(<LinkCaptureSettings />)
    await ready()
    mocks.write.mockRejectedValue(new Error('private failure'))
    await user.click(toggle())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('alert')).not.toHaveTextContent('private failure')
    expect(toggle()).toBeChecked()
    mocks.contains.mockResolvedValue(false)
    const removed = mocks.removed.addListener.mock.calls[0]?.[0] as () => void
    act(() => removed())
    await waitFor(() => expect(toggle()).not.toBeChecked())
  })

  it('records a modifier alone on release and cancels with Escape', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'ShiftLeft', key: 'Shift', shiftKey: true })
    expect(screen.getByText(/Press a key/)).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }),
      )
    })
    expect(screen.getByText('ShiftLeft (Shift)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'Escape', key: 'Escape' })
    expect(screen.queryByText(/Press a key/)).not.toBeInTheDocument()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('stays disabled if permission APIs are unavailable', async () => {
    vi.stubGlobal('browser', undefined)
    render(<LinkCaptureSettings />)
    expect(toggle()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Reload')
  })

  it('turns OFF without requesting or revoking shared access', async () => {
    const user = userEvent.setup()
    mocks.read.mockResolvedValue({
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      enabled: true,
    })
    render(<LinkCaptureSettings />)
    await ready()
    await user.click(toggle())
    await waitFor(() => expect(toggle()).not.toBeChecked())
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.write).toHaveBeenCalledWith(DEFAULT_LINK_CAPTURE_SETTINGS)
  })

  it('isolates failed storage reads and offers reload guidance', async () => {
    mocks.read.mockRejectedValue(new Error('private failure'))
    render(<LinkCaptureSettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload')
    expect(toggle()).toBeDisabled()
  })

  it('click saving defaults OFF and enables independently of rectangle selection', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings mode='click' />)
    const clickToggle = await screen.findByRole('checkbox', {
      name: 'Enable key + click saving',
    })
    await waitFor(() => expect(clickToggle).toBeEnabled())
    expect(clickToggle).not.toBeChecked()
    await user.click(clickToggle)
    await waitFor(() => expect(clickToggle).toBeChecked())
    expect(mocks.write).toHaveBeenCalledWith({
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      clickEnabled: true,
    })
  })

  it.each(['toggles', 'shortcuts'])(
    'preserves simultaneous %s from the two gesture sections while the first storage write is pending',
    async (operation) => {
      const user = userEvent.setup()
      const firstWrite = Promise.withResolvers<undefined>()
      let stored = structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS)
      let writes = 0
      mocks.read.mockImplementation(async () => structuredClone(stored))
      mocks.write.mockImplementation(async (value) => {
        writes += 1
        if (writes === 1) {
          await firstWrite.promise
        }
        stored = structuredClone(value)
        return stored
      })
      render(
        <>
          <LinkCaptureSettings />
          <LinkCaptureSettings mode='click' />
        </>,
      )
      const rectangle = within(
        screen.getByRole('region', { name: 'Select and save links' }),
      )
      const clickSection = within(
        screen.getByRole('region', { name: 'Link saving gesture' }),
      )
      await waitFor(() =>
        expect(clickSection.getByRole('checkbox')).toBeEnabled(),
      )
      if (operation === 'shortcuts') {
        await user.click(rectangle.getByRole('button', { name: 'Change key' }))
        dispatchKey({ code: 'F8', key: 'F8' })
        await user.click(
          clickSection.getByRole('button', { name: 'Change key' }),
        )
        dispatchKey({ code: 'KeyJ', key: 'j' })
      }
      const rectangleAction =
        operation === 'toggles'
          ? rectangle.getByRole('checkbox')
          : rectangle.getByRole('button', { name: 'Save key' })
      const clickAction =
        operation === 'toggles'
          ? clickSection.getByRole('checkbox')
          : clickSection.getByRole('button', { name: 'Save key' })
      await user.click(rectangleAction)
      await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1))
      await user.click(clickAction)
      await act(async () => firstWrite.resolve(undefined))
      await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2))
      await waitFor(() =>
        expect(
          rectangle.getByRole('button', { name: 'Change key' }),
        ).toBeEnabled(),
      )
      await waitFor(() =>
        expect(
          clickSection.getByRole('button', { name: 'Change key' }),
        ).toBeEnabled(),
      )
      expect(stored).toMatchObject(
        operation === 'toggles'
          ? { enabled: true, clickEnabled: true }
          : { shortcut: { code: 'F8' }, clickShortcut: { code: 'KeyJ' } },
      )
    },
  )

  it('records a click key independently and rejects modifiers used by native link actions', async () => {
    const user = userEvent.setup()
    render(<LinkCaptureSettings mode='click' />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change key' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'KeyJ', key: 'j', shiftKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent('standard link')
    expect(
      screen.queryByRole('button', { name: 'Save key' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'Semicolon', key: 'ö' })
    await user.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() =>
      expect(mocks.write).toHaveBeenCalledWith({
        ...DEFAULT_LINK_CAPTURE_SETTINGS,
        clickShortcut: {
          ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
          code: 'Semicolon',
          key: 'ö',
        },
      }),
    )
  })

  it('denies click access without changing rectangle preference, then reflects external changes', async () => {
    const user = userEvent.setup()
    let stored = {
      ...structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS),
      enabled: true,
    }
    mocks.read.mockImplementation(async () => structuredClone(stored))
    mocks.request.mockResolvedValue(false)
    render(<LinkCaptureSettings mode='click' />)
    const clickToggle = await screen.findByRole('checkbox', {
      name: 'Enable key + click saving',
    })
    await waitFor(() => expect(clickToggle).toBeEnabled())
    await user.click(clickToggle)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Site access was not granted',
    )
    expect(mocks.write).not.toHaveBeenCalled()
    stored = {
      ...stored,
      clickEnabled: true,
      clickShortcut: { ...stored.shortcut, code: 'F8', key: 'F8' },
    }
    const changed = mocks.storage.addListener.mock.calls[0]?.[0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void
    act(() =>
      changed({ [LINK_CAPTURE_SETTINGS_KEY]: { newValue: stored } }, 'local'),
    )
    await waitFor(() => expect(clickToggle).toBeChecked())
    expect(screen.getByText('F8 (F8)')).toBeInTheDocument()
  })

  it('keeps only the most recently started recorder active across both gestures', async () => {
    const user = userEvent.setup()
    render(
      <>
        <LinkCaptureSettings />
        <LinkCaptureSettings mode='click' />
      </>,
    )
    const rectangle = within(
      screen.getByRole('region', { name: 'Select and save links' }),
    )
    const clickSection = within(
      screen.getByRole('region', { name: 'Link saving gesture' }),
    )
    await waitFor(() =>
      expect(
        rectangle.getByRole('button', { name: 'Change key' }),
      ).toBeEnabled(),
    )
    await user.click(rectangle.getByRole('button', { name: 'Change key' }))
    await user.click(clickSection.getByRole('button', { name: 'Change key' }))
    dispatchKey({ code: 'KeyJ', key: 'j' })
    expect(screen.getAllByRole('button', { name: 'Save key' })).toHaveLength(1)
    expect(clickSection.getByText('KeyJ (j)')).toBeInTheDocument()
  })
})
