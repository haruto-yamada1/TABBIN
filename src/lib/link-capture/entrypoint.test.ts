// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  settings: {
    enabled: true,
    shortcut: {
      code: 'KeyZ',
      key: 'z',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    },
  },
  storageListener: vi.fn(),
  messageListener: vi.fn(),
  removeStorage: vi.fn(),
  removeMessage: vi.fn(),
  sendMessage: vi.fn(),
  readSettings: vi.fn(),
}))
vi.mock('wxt/utils/define-content-script', () => ({
  defineContentScript: (definition: unknown) => definition,
}))
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      id: 'extension',
      sendMessage: mock.sendMessage,
      onMessage: {
        addListener: mock.messageListener,
        removeListener: mock.removeMessage,
      },
    },
    storage: {
      local: { get: async () => ({ userSettings: { language: 'en' } }) },
      onChanged: {
        addListener: mock.storageListener,
        removeListener: mock.removeStorage,
      },
    },
    i18n: { getUILanguage: () => 'en' },
  },
}))
vi.mock('@/lib/storage/link-capture-settings', () => ({
  readLinkCaptureSettings: mock.readSettings,
}))

import content from '@/entrypoints/content'

const successResponse = {
  status: 'ok',
  saved: 1,
  newCount: 1,
  existing: 0,
  excluded: 0,
  duplicates: 0,
  failed: 0,
}
const dispatchTrusted = (event: Event, target: EventTarget = window) => {
  Object.defineProperty(event, 'isTrusted', { value: true })
  target.dispatchEvent(event)
}
const key = (code: string, type = 'keydown', target: EventTarget = window) =>
  dispatchTrusted(
    new KeyboardEvent(type, {
      key: code === 'Escape' ? 'Escape' : 'z',
      code,
      bubbles: true,
      cancelable: true,
    }),
    target,
  )
const pointer = (type: string, x: number, y: number) =>
  dispatchTrusted(
    new PointerEvent(type, {
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1,
      isPrimary: true,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  )
const pageLink = (url = 'https://example.com/article') => {
  const element = document.createElement('a')
  element.href = url
  element.textContent = 'Article'
  const bounds = new DOMRect(10, 10, 30, 20)
  vi.spyOn(element, 'getClientRects').mockReturnValue([
    bounds,
  ] as unknown as DOMRectList)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(bounds)
  document.body.append(element)
  return element
}
const drag = () => {
  key('KeyZ')
  pointer('pointerdown', 0, 0)
  pointer('pointermove', 100, 100)
  pointer('pointerup', 100, 100)
}
// happy-dom does not implement PageTransitionEvent.persisted yet.
const pageTransition = (type: 'pagehide' | 'pageshow') => {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', { value: true })
  window.dispatchEvent(event)
}
const controller = () =>
  Reflect.get(globalThis, '__tabbinLinkCapture') as { dispose: () => void }

describe('link capture content entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mock.settings.enabled = true
    mock.settings.shortcut.code = 'KeyZ'
    mock.readSettings
      .mockReset()
      .mockResolvedValue(structuredClone(mock.settings))
    mock.sendMessage.mockReset().mockResolvedValue(successResponse)
  })
  afterEach(() => {
    controller()?.dispose()
  })

  it('keeps the live controller and its pending selection across worker reinjection', async () => {
    await content.main({} as never)
    expect(mock.storageListener).toHaveBeenCalledOnce()
    const original = controller()
    await content.main({} as never)
    expect(mock.removeStorage).not.toHaveBeenCalled()
    expect(controller()).toBe(original)
    expect(
      document.querySelectorAll('[data-tabbin-link-capture]'),
    ).toHaveLength(1)
  })

  it('accepts disposal only from the owning extension and removes its page UI', async () => {
    await content.main({} as never)
    const listener = mock.messageListener.mock.calls[0]?.[0] as (
      message: unknown,
      sender: { id: string },
    ) => void
    listener({ action: 'linkCaptureDispose' }, { id: 'foreign' })
    expect(document.querySelector('[data-tabbin-link-capture]')).not.toBeNull()
    listener({ action: 'linkCaptureDispose' }, { id: 'extension' })
    expect(document.querySelector('[data-tabbin-link-capture]')).toBeNull()
    expect(mock.removeMessage).toHaveBeenCalledOnce()
  })

  it('never captures page-created synthetic key and pointer events', async () => {
    await content.main({} as never)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ' }),
    )
    window.dispatchEvent(
      new PointerEvent('pointerdown', {
        button: 0,
        isPrimary: true,
        clientX: 0,
        clientY: 0,
      }),
    )
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        buttons: 1,
        isPrimary: true,
        clientX: 100,
        clientY: 100,
      }),
    )
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        button: 0,
        isPrimary: true,
        clientX: 100,
        clientY: 100,
      }),
    )
    expect(mock.sendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-selected-count]')).toBeNull()
  })

  it('does not add page listeners when disabled or settings cannot be verified', async () => {
    mock.readSettings.mockResolvedValue({ ...mock.settings, enabled: false })
    await content.main({} as never)
    expect(mock.storageListener).not.toHaveBeenCalled()
    expect(document.querySelector('[data-tabbin-link-capture]')).toBeNull()
    mock.readSettings.mockRejectedValueOnce(new Error('storage unavailable'))
    await content.main({} as never)
    expect(mock.storageListener).not.toHaveBeenCalled()
    expect(document.querySelector('[data-tabbin-link-capture]')).toBeNull()
  })

  it('saves only a completed trusted drag and leaves click/short movements alone', async () => {
    pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 3, 3)
    pointer('pointerup', 3, 3)
    expect(mock.sendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-selected-count]')).toBeNull()
    drag()
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      action: 'saveLinkCapture',
      links: [{ url: 'https://example.com/article', title: 'Article' }],
    })
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('[data-tabbin-link-capture]')
          ?.getAttribute('data-capture-status'),
      ).toContain('Saved: 1'),
    )
  })

  it('cancels on key release, blur, escape and composition without persisting a partial selection', async () => {
    pageLink()
    await content.main({} as never)
    for (const cancel of [
      () => key('KeyZ', 'keyup'),
      () => window.dispatchEvent(new Event('blur')),
      () => key('Escape'),
      () => document.dispatchEvent(new Event('compositionstart')),
    ]) {
      key('KeyZ')
      pointer('pointerdown', 0, 0)
      pointer('pointermove', 100, 100)
      cancel()
      pointer('pointerup', 100, 100)
      expect(mock.sendMessage).not.toHaveBeenCalled()
      expect(document.querySelector('[data-selected-count]')).toBeNull()
      document.dispatchEvent(new Event('compositionend'))
    }
  })

  it('ignores editor focus and provides keyboard-only saving for a focused anchor', async () => {
    const link = pageLink()
    const input = document.createElement('input')
    document.body.append(input)
    await content.main({} as never)
    input.focus()
    key('KeyZ', 'keydown', input)
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 100, 100)
    pointer('pointerup', 100, 100)
    expect(mock.sendMessage).not.toHaveBeenCalled()
    link.focus()
    key('KeyZ')
    key('Enter')
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
  })

  it('retains a failed batch and retries only on a trusted control click', async () => {
    pageLink()
    mock.sendMessage.mockRejectedValueOnce(new Error('worker stopped'))
    await content.main({} as never)
    drag()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-tabbin-link-capture]')?.shadowRoot
          ?.textContent,
      ).toContain('Retry'),
    )
    const host = document.querySelector('[data-tabbin-link-capture]')
    const retry = host?.shadowRoot?.querySelector('button')
    expect(retry).not.toBeNull()
    retry?.click()
    expect(mock.sendMessage).toHaveBeenCalledOnce()
    if (retry) {
      dispatchTrusted(new MouseEvent('click', { bubbles: true }), retry)
    }
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
    expect(mock.sendMessage.mock.calls[1]?.[0]).toEqual(
      mock.sendMessage.mock.calls[0]?.[0],
    )
  })

  it('removes active controls and listeners as soon as settings are disabled', async () => {
    pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 100, 100)
    mock.readSettings.mockResolvedValue({ ...mock.settings, enabled: false })
    const listener = mock.storageListener.mock.calls[0]?.[0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void
    listener({ linkCaptureSettings: {} }, 'local')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-tabbin-link-capture]')).toBeNull(),
    )
    expect(mock.removeStorage).toHaveBeenCalledOnce()
    pointer('pointerup', 100, 100)
    expect(mock.sendMessage).not.toHaveBeenCalled()
  })

  it('previews a large batch and requires a trusted confirmation before saving it', async () => {
    for (let index = 0; index < 51; index += 1) {
      pageLink(`https://example.com/${index}`)
    }
    mock.sendMessage.mockResolvedValueOnce({
      ...successResponse,
      status: 'confirmation_required',
      saved: 0,
      newCount: 50,
      existing: 1,
    })
    await content.main({} as never)
    drag()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-tabbin-link-capture]')?.shadowRoot
          ?.textContent,
      ).toContain('New: 50'),
    )
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      action: 'previewLinkCapture',
      confirmed: false,
    })
    const save = document
      .querySelector('[data-tabbin-link-capture]')
      ?.shadowRoot?.querySelector('button')
    if (!save) {
      throw new Error('Missing confirmation button')
    }
    dispatchTrusted(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
      save,
    )
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
    expect(mock.sendMessage.mock.calls[1]?.[0]).toMatchObject({
      action: 'saveLinkCapture',
      confirmed: true,
    })
  })

  it('does not show late save results after the user cancels or navigates', async () => {
    pageLink()
    let resolveSave: ((response: typeof successResponse) => void) | undefined
    mock.sendMessage.mockImplementationOnce(
      async () =>
        new Promise<typeof successResponse>((resolve) => {
          resolveSave = resolve
        }),
    )
    await content.main({} as never)
    drag()
    key('Escape')
    resolveSave?.(successResponse)
    await Promise.resolve()
    expect(
      document
        .querySelector('[data-tabbin-link-capture]')
        ?.shadowRoot?.querySelector('.panel'),
    ).toBeNull()
  })

  it('keeps the latest shortcut when settings refreshes finish in reverse order', async () => {
    pageLink()
    await content.main({} as never)
    const listener = mock.storageListener.mock.calls[0]?.[0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void
    let resolveOlder: ((settings: typeof mock.settings) => void) | undefined
    mock.readSettings.mockImplementationOnce(
      async () =>
        new Promise<typeof mock.settings>((resolve) => {
          resolveOlder = resolve
        }),
    )
    listener({ linkCaptureSettings: {} }, 'local')
    mock.readSettings.mockResolvedValueOnce({
      ...mock.settings,
      shortcut: { ...mock.settings.shortcut, code: 'KeyX', key: 'x' },
    })
    listener({ linkCaptureSettings: {} }, 'local')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    resolveOlder?.({ ...mock.settings })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    drag()
    expect(mock.sendMessage).not.toHaveBeenCalled()
    key('KeyX')
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 100, 100)
    pointer('pointerup', 100, 100)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
  })

  it('keeps the completed save notification visible after releasing the shortcut', async () => {
    pageLink()
    await content.main({} as never)
    drag()
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('[data-tabbin-link-capture]')
          ?.shadowRoot?.querySelector('.panel')?.textContent,
      ).toContain('Saved: 1'),
    )
    key('KeyZ', 'keyup')
    expect(
      document
        .querySelector('[data-tabbin-link-capture]')
        ?.shadowRoot?.querySelector('.panel')?.textContent,
    ).toContain('Saved: 1')
  })

  it('refreshes candidates after link changes during an active gesture', async () => {
    const link = pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 100, 100)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        resolve()
      }),
    )
    link.href = 'https://example.com/updated'
    await Promise.resolve()
    pointer('pointerup', 100, 100)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      links: [{ url: 'https://example.com/updated', title: 'Article' }],
    })
  })

  it('resumes a BFCache-restored document after rechecking its capture settings', async () => {
    pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 100, 100)
    pageTransition('pagehide')
    expect(document.querySelector('[data-selected-count]')).toBeNull()
    expect(mock.removeStorage).not.toHaveBeenCalled()
    pageTransition('pageshow')
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(mock.readSettings).toHaveBeenCalledTimes(2)
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      action: 'previewLinkCapture',
      links: [],
    })
    drag()
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
  })

  it('honors an OFF setting changed while its document was in BFCache', async () => {
    pageLink()
    await content.main({} as never)
    pageTransition('pagehide')
    mock.readSettings.mockResolvedValue({ ...mock.settings, enabled: false })
    pageTransition('pageshow')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-tabbin-link-capture]')).toBeNull(),
    )
    drag()
    expect(
      mock.sendMessage.mock.calls.every(
        ([message]) => message.action === 'previewLinkCapture',
      ),
    ).toBe(true)
  })

  it('stops a BFCache-restored document when the background permission probe is denied', async () => {
    pageLink()
    await content.main({} as never)
    pageTransition('pagehide')
    mock.sendMessage.mockResolvedValueOnce({
      ...successResponse,
      status: 'forbidden',
      saved: 0,
      newCount: 0,
    })
    pageTransition('pageshow')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-tabbin-link-capture]')).toBeNull(),
    )
    expect(mock.sendMessage).toHaveBeenCalledOnce()
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      action: 'previewLinkCapture',
      links: [],
    })
    drag()
    expect(mock.sendMessage).toHaveBeenCalledOnce()
  })
})
