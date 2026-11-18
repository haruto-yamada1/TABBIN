// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  settings: {
    enabled: true,
    clickEnabled: false,
    clickShortcut: {
      code: 'KeyZ',
      key: 'z',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    },
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
  language: 'en',
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
      local: {
        get: async () => ({ userSettings: { language: mock.language } }),
      },
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
import { linkCaptureMessageSchema } from '@/types/link-capture'

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
const pointer = (
  type: string,
  x: number,
  y: number,
  target: EventTarget = window,
  options: PointerEventInit = {},
) =>
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
      composed: true,
      ...options,
    }),
    target,
  )
const clickLink = (target: EventTarget, options: MouseEventInit = {}) => {
  pointer('pointerdown', 20, 20, target, options)
  pointer('pointerup', 20, 20, target, options)
  const event = new MouseEvent('click', {
    button: 0,
    detail: 1,
    clientX: 20,
    clientY: 20,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  })
  dispatchTrusted(event, target)
  return event
}
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
const batchAtTextLength = (total: number) => {
  const count = 65
  for (let index = 0; index < count; index += 1) {
    const size = Math.floor(total / count) + (index < total % count ? 1 : 0)
    const prefix = `https://example.com/${index}/`
    pageLink(prefix + 'x'.repeat(size - prefix.length - 'Article'.length))
  }
  return Array.from(document.querySelectorAll('a'), (element) => ({
    url: element.href,
    title: element.textContent ?? '',
  }))
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
    mock.settings.clickEnabled = false
    mock.language = 'en'
    mock.settings.shortcut.code = 'KeyZ'
    mock.readSettings
      .mockReset()
      .mockResolvedValue(structuredClone(mock.settings))
    mock.sendMessage.mockReset().mockResolvedValue(successResponse)
  })
  afterEach(() => {
    controller()?.dispose()
    vi.unstubAllGlobals()
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

  it('saves a trusted nested-link click independently while rectangle capture is off', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      enabled: false,
      clickEnabled: true,
    })
    const link = pageLink('/article')
    const icon = document.createElement('span')
    link.append(icon)
    await content.main({} as never)
    key('KeyZ')
    const click = clickLink(icon)
    expect(click.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      mode: 'click',
      action: 'saveLinkCapture',
      links: [{ url: 'http://localhost:3000/article', title: 'Article' }],
    })
  })

  it('captures an open-shadow-root anchor through the composed event path', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      clickEnabled: true,
    })
    const link = pageLink()
    const host = document.createElement('div')
    document.body.append(host)
    host.attachShadow({ mode: 'open' }).append(link)
    const image = document.createElement('img')
    link.append(image)
    await content.main({} as never)
    key('KeyZ')
    expect(clickLink(image).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
  })

  it.each(['display-contents', 'positioned-child'])(
    'captures a physically clicked child when the anchor box does not contain it: %s',
    async (layout) => {
      mock.readSettings.mockResolvedValue({
        ...mock.settings,
        enabled: false,
        clickEnabled: true,
      })
      const link = pageLink()
      const child = document.createElement('span')
      child.textContent = 'Clickable child'
      link.append(child)
      if (layout === 'display-contents') {
        link.style.display = 'contents'
        vi.mocked(link.getClientRects).mockReturnValue(
          [] as unknown as DOMRectList,
        )
      } else {
        vi.mocked(link.getClientRects).mockReturnValue([
          new DOMRect(200, 200, 20, 20),
        ] as unknown as DOMRectList)
      }
      await content.main({} as never)
      key('KeyZ')
      expect(clickLink(child).defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    },
  )

  it.each(['visibility:hidden', 'display:contents;opacity:0'])(
    'uses the trusted hit target when a child remains clickable under %s',
    async (style) => {
      mock.readSettings.mockResolvedValue({
        ...mock.settings,
        enabled: false,
        clickEnabled: true,
      })
      const link = pageLink()
      link.style.visibility = 'visible'
      const wrapper = document.createElement('div')
      wrapper.style.cssText = style
      document.body.append(wrapper)
      wrapper.append(link)
      await content.main({} as never)
      key('KeyZ')
      expect(clickLink(link).defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    },
  )

  it.each(['aria-disabled', 'inert', 'hidden'])(
    'respects a disabled Shadow DOM ancestor: %s',
    async (attribute) => {
      mock.readSettings.mockResolvedValue({
        ...mock.settings,
        enabled: false,
        clickEnabled: true,
      })
      const link = pageLink()
      const host = document.createElement('div')
      host.setAttribute(attribute, 'true')
      document.body.append(host)
      host.attachShadow({ mode: 'open' }).append(link)
      let intercepted: boolean | undefined
      link.addEventListener('click', (event) => {
        intercepted = event.defaultPrevented
        event.preventDefault()
      })
      await content.main({} as never)
      key('KeyZ')
      clickLink(link)
      expect(intercepted).toBe(false)
      expect(mock.sendMessage).not.toHaveBeenCalled()
    },
  )

  it('keeps Retry available when the click queue fills after a failed save', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      enabled: false,
      clickEnabled: true,
    })
    const link = pageLink()
    mock.sendMessage.mockRejectedValueOnce(new Error('worker unavailable'))
    await content.main({} as never)
    key('KeyZ')
    clickLink(link)
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-tabbin-link-capture]')?.shadowRoot
          ?.textContent,
      ).toContain('Retry'),
    )
    for (let index = 0; index < 1001; index += 1) {
      link.href = `https://example.com/queued/${index}`
      clickLink(link)
    }
    const shadow = document.querySelector(
      '[data-tabbin-link-capture]',
    )?.shadowRoot
    expect(shadow?.textContent).toContain('Retry')
    expect(shadow?.textContent).toContain('was not queued')
    const retry = [...(shadow?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Retry',
    )
    if (!retry) {
      throw new Error('Missing retry control')
    }
    dispatchTrusted(
      new MouseEvent('click', { bubbles: true, composed: true }),
      retry,
    )
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(1002))
    expect(mock.sendMessage.mock.calls[1]?.[0]).toEqual(
      mock.sendMessage.mock.calls[0]?.[0],
    )
    expect(mock.sendMessage.mock.calls.at(-1)?.[0].links[0].url).toBe(
      'https://example.com/queued/999',
    )
  })

  it.each([false, true])(
    'checks disabled HTML ancestors across SVG foreignObject, shadow=%s',
    async (shadow) => {
      mock.readSettings.mockResolvedValue({
        ...mock.settings,
        enabled: false,
        clickEnabled: true,
      })
      const wrapper = document.createElement('div')
      wrapper.setAttribute('aria-disabled', 'true')
      document.body.append(wrapper)
      const host = document.createElement('div')
      wrapper.append(host)
      const parent = shadow ? host.attachShadow({ mode: 'open' }) : host
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      const foreign = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'foreignObject',
      )
      parent.append(svg)
      svg.append(foreign)
      const link = pageLink()
      foreign.append(link)
      let intercepted: boolean | undefined
      link.addEventListener('click', (event) => {
        intercepted = event.defaultPrevented
        event.preventDefault()
      })
      await content.main({} as never)
      key('KeyZ')
      clickLink(link)
      expect(intercepted).toBe(false)
      expect(mock.sendMessage).not.toHaveBeenCalled()
    },
  )

  it('queues distinct rapid clicks and suppresses duplicate pending URLs', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      clickEnabled: true,
    })
    const first = pageLink()
    const second = pageLink('https://example.com/second')
    let complete: ((response: typeof successResponse) => void) | undefined
    mock.sendMessage.mockImplementationOnce(
      async () =>
        new Promise<typeof successResponse>((resolve) => {
          complete = resolve
        }),
    )
    await content.main({} as never)
    key('KeyZ')
    clickLink(first)
    clickLink(first)
    clickLink(second)
    expect(mock.sendMessage).toHaveBeenCalledOnce()
    complete?.(successResponse)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
    expect(mock.sendMessage.mock.calls[1]?.[0].links).toEqual([
      { url: second.href, title: 'Article' },
    ])
  })

  it('retains a failed click and drains queued links after an explicit retry', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      clickEnabled: true,
    })
    const first = pageLink()
    const second = pageLink('https://example.com/second')
    mock.sendMessage.mockRejectedValueOnce(new Error('worker unavailable'))
    await content.main({} as never)
    key('KeyZ')
    clickLink(first)
    clickLink(second)
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-tabbin-link-capture]')?.shadowRoot
          ?.textContent,
      ).toContain('Retry'),
    )
    expect(mock.sendMessage).toHaveBeenCalledOnce()
    const retry = document
      .querySelector('[data-tabbin-link-capture]')
      ?.shadowRoot?.querySelector('button')
    if (!retry) {
      throw new Error('Missing retry')
    }
    dispatchTrusted(
      new MouseEvent('click', { bubbles: true, composed: true }),
      retry,
    )
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(3))
    expect(mock.sendMessage.mock.calls[1]?.[0]).toEqual(
      mock.sendMessage.mock.calls[0]?.[0],
    )
    expect(mock.sendMessage.mock.calls[2]?.[0]).toMatchObject({
      mode: 'click',
      links: [{ url: second.href }],
    })
  })

  it.each([
    { ctrlKey: true },
    { altKey: true },
    { shiftKey: true },
    { metaKey: true },
    { button: 1 },
    { button: 2 },
  ])('preserves native modified and non-left clicks: %j', async (options) => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      clickEnabled: true,
    })
    const link = pageLink()
    await content.main({} as never)
    key('KeyZ')
    expect(clickLink(link, options).defaultPrevented).toBe(false)
    expect(mock.sendMessage).not.toHaveBeenCalled()
  })

  it('requires trusted down/up, the held key, and the same anchor at click', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      clickEnabled: true,
    })
    const first = pageLink()
    const second = pageLink('https://example.com/second')
    await content.main({} as never)
    expect(clickLink(first).defaultPrevented).toBe(false)
    key('KeyZ')
    pointer('pointerdown', 20, 20, first)
    pointer('pointerup', 20, 20, second)
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    })
    dispatchTrusted(click, second)
    expect(click.defaultPrevented).toBe(false)
    first.click()
    expect(mock.sendMessage).not.toHaveBeenCalled()
  })

  it('gives a completed rectangle drag priority over click when both use the same key', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      clickEnabled: true,
    })
    const link = pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 20, 20, link)
    pointer('pointermove', 100, 100, link)
    pointer('pointerup', 100, 100, link)
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    })
    dispatchTrusted(click, link)
    expect(click.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0].mode).not.toBe('click')
  })

  it('never saves or navigates from the ending click of a click-only drag', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      enabled: false,
      clickEnabled: true,
    })
    const link = pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 20, 20, link)
    pointer('pointermove', 100, 100, link)
    pointer('pointerup', 100, 100, link)
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    })
    dispatchTrusted(click, link)
    expect(click.defaultPrevented).toBe(true)
    expect(mock.sendMessage).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { metaKey: true },
  ])(
    'preserves a fresh ordinary or modified click immediately after a drag: %j',
    async (options) => {
      mock.readSettings.mockResolvedValue({
        ...mock.settings,
        enabled: false,
        clickEnabled: true,
      })
      const link = pageLink()
      await content.main({} as never)
      key('KeyZ')
      pointer('pointerdown', 20, 20, link)
      pointer('pointermove', 100, 100, link)
      pointer('pointerup', 100, 100, link)
      key('KeyZ', 'keyup')
      expect(clickLink(link, options).defaultPrevented).toBe(false)
      expect(mock.sendMessage).not.toHaveBeenCalled()
    },
  )

  it('suppresses the ending click after releasing the click key during a drag', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      enabled: false,
      clickEnabled: true,
    })
    const link = pageLink()
    await content.main({} as never)
    key('KeyZ')
    pointer('pointerdown', 20, 20, link)
    pointer('pointermove', 100, 100, link)
    key('KeyZ', 'keyup')
    pointer('pointerup', 100, 100, link)
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    })
    dispatchTrusted(click, link)
    expect(click.defaultPrevented).toBe(true)
    expect(mock.sendMessage).not.toHaveBeenCalled()
  })

  it.each(['mailto:test@example.com', '#fragment', 'data:text/html,test', ''])(
    'leaves an unsupported link unchanged: %s',
    async (href) => {
      mock.readSettings.mockResolvedValue({
        ...mock.settings,
        enabled: false,
        clickEnabled: true,
      })
      const link = pageLink()
      link.setAttribute('href', href)
      let intercepted: boolean | undefined
      // Observe the controller before the fixture itself blocks navigation.
      link.addEventListener('click', (event) => {
        intercepted = event.defaultPrevented
        event.preventDefault()
      })
      await content.main({} as never)
      key('KeyZ')
      clickLink(link)
      expect(intercepted).toBe(false)
      expect(mock.sendMessage).not.toHaveBeenCalled()
    },
  )

  it('ignores editable descendants and IME but uses a fresh link URL at click time', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      enabled: false,
      clickEnabled: true,
    })
    const link = pageLink()
    const editor = document.createElement('input')
    document.body.append(editor)
    await content.main({} as never)
    key('KeyZ')
    editor.focus()
    expect(clickLink(link).defaultPrevented).toBe(false)
    editor.blur()
    document.dispatchEvent(new Event('compositionstart'))
    expect(clickLink(link).defaultPrevented).toBe(false)
    document.dispatchEvent(new Event('compositionend'))
    key('KeyZ')
    pointer('pointerdown', 20, 20, link)
    pointer('pointerup', 20, 20, link)
    link.href = 'https://example.com/updated-at-click'
    const click = new MouseEvent('click', {
      clientX: 20,
      clientY: 20,
      bubbles: true,
      cancelable: true,
      detail: 1,
    })
    dispatchTrusted(click, link)
    expect(click.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0].links).toEqual([
      { url: link.href, title: 'Article' },
    ])
  })

  it('resumes a click-only BFCache document using click-mode availability', async () => {
    mock.readSettings.mockResolvedValue({
      ...mock.settings,
      enabled: false,
      clickEnabled: true,
    })
    const link = pageLink()
    await content.main({} as never)
    pageTransition('pagehide')
    pageTransition('pageshow')
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      action: 'previewLinkCapture',
      mode: 'click',
      links: [],
    })
    key('KeyZ')
    expect(clickLink(link).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
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

  it('keeps a drag alive when pointerdown moves focus between page links', async () => {
    const first = pageLink()
    const second = pageLink('https://example.com/second')
    await content.main({} as never)
    first.focus()
    key('KeyZ')
    pointer('pointerdown', 0, 0)
    second.focus()
    pointer('pointermove', 100, 100)
    pointer('pointerup', 100, 100)
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
    expect(mock.sendMessage.mock.calls[0]?.[0].links).toHaveLength(2)
  })

  it.each([524287, 524288])(
    'previews and saves a batch with %i total characters',
    async (total) => {
      batchAtTextLength(total)
      await content.main({} as never)
      drag()
      await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
      const preview = mock.sendMessage.mock.calls[0]?.[0]
      expect(preview.action).toBe('previewLinkCapture')
      expect(linkCaptureMessageSchema.safeParse(preview).success).toBe(true)
      expect(
        preview.links.reduce(
          (size: number, link: { url: string; title: string }) =>
            size + link.url.length + link.title.length,
          0,
        ),
      ).toBe(total)
      const save = document
        .querySelector('[data-tabbin-link-capture]')
        ?.shadowRoot?.querySelector('button')
      if (!save) {
        throw new Error('Missing confirmation button')
      }
      dispatchTrusted(new MouseEvent('click', { bubbles: true }), save)
      await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
      expect(mock.sendMessage.mock.calls[1]?.[0]).toMatchObject({
        action: 'saveLinkCapture',
        links: preview.links,
      })
    },
  )

  it.each([
    ['en', 'Select fewer links', 'Cancel'],
    ['ja', '選択するリンクを減らして', 'キャンセル'],
  ])(
    'rejects oversized batches locally in %s and lets a smaller selection save',
    async (language, message, cancelLabel) => {
      mock.language = language
      const links = batchAtTextLength(524289)
      expect(
        linkCaptureMessageSchema.safeParse({
          action: 'previewLinkCapture',
          requestId: '00000000-0000-4000-8000-000000000000',
          links,
        }).success,
      ).toBe(false)
      await content.main({} as never)
      drag()
      await vi.waitFor(() =>
        expect(
          document
            .querySelector('[data-tabbin-link-capture]')
            ?.shadowRoot?.querySelector('.panel p')?.textContent,
        ).toContain(message),
      )
      expect(mock.sendMessage).not.toHaveBeenCalled()
      const shadow = document.querySelector(
        '[data-tabbin-link-capture]',
      )?.shadowRoot
      const controls = [...(shadow?.querySelectorAll('button') ?? [])]
      expect(controls.map((button) => button.textContent)).toEqual([
        cancelLabel,
      ])
      const cancel = controls[0]
      if (!cancel) {
        throw new Error('Missing cancel button')
      }
      dispatchTrusted(new MouseEvent('click', { bubbles: true }), cancel)
      for (const anchor of document.querySelectorAll('a')) {
        anchor.remove()
      }
      pageLink('https://example.com/smaller')
      drag()
      await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledOnce())
      expect(mock.sendMessage.mock.calls[0]?.[0]).toMatchObject({
        action: 'saveLinkCapture',
        links: [{ url: 'https://example.com/smaller', title: 'Article' }],
      })
    },
  )

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

  it('restores and saves when randomUUID is unavailable but getRandomValues is supported', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    })
    pageLink()
    await content.main({} as never)
    pageTransition('pagehide')
    pageTransition('pageshow')
    await vi.waitFor(() => expect(mock.readSettings).toHaveBeenCalledTimes(2))
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(document.querySelector('[data-tabbin-link-capture]')).not.toBeNull()
    expect(mock.sendMessage).toHaveBeenCalledOnce()
    expect(
      linkCaptureMessageSchema.safeParse(mock.sendMessage.mock.calls[0]?.[0])
        .success,
    ).toBe(true)
    drag()
    await vi.waitFor(() => expect(mock.sendMessage).toHaveBeenCalledTimes(2))
    expect(
      linkCaptureMessageSchema.safeParse(mock.sendMessage.mock.calls[1]?.[0])
        .success,
    ).toBe(true)
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
