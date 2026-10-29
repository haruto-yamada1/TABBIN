import { createContext, runInContext } from 'node:vm'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applySavedTabTitle,
  NATIVE_SAVED_TAB_TITLE_ACTION,
} from './saved-tab-title'

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown

const extensionId = 'tabbin-extension'
const listeners = new Set<MessageListener>()
const addListener = vi.fn((listener: MessageListener) => {
  listeners.add(listener)
})
const removeListener = vi.fn((listener: MessageListener) => {
  listeners.delete(listener)
})

const dispatch = (message: unknown, ...senders: unknown[]) => {
  const sender = senders.length === 0 ? { id: extensionId } : senders[0]
  const sendResponse = vi.fn()
  for (const listener of listeners) {
    listener(message, sender, sendResponse)
  }
  return sendResponse
}

const request = (command: string) => ({
  action: NATIVE_SAVED_TAB_TITLE_ACTION,
  command,
})

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: {
      id: extensionId,
      onMessage: { addListener, removeListener },
    },
  })
  document.title = 'Article title'
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  applySavedTabTitle(false, location.href)
  listeners.clear()
  vi.restoreAllMocks()
  document.title = ''
})

describe('applySavedTabTitle', () => {
  it('marks the native title and reports the unmodified title', () => {
    expect(applySavedTabTitle(true, location.href)).toEqual({
      baseTitle: 'Article title',
      displayTitle: '✓ Article title',
      url: location.href,
    })
    expect(document.title).toBe('✓ Article title')
    expect(addListener).toHaveBeenCalledOnce()
  })

  it('is idempotent across repeated serialized invocations', () => {
    const setTitle = vi.spyOn(document, 'title', 'set')
    applySavedTabTitle(true, location.href)
    applySavedTabTitle(true, location.href)

    expect(document.title).toBe('✓ Article title')
    expect(addListener).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(1)
    expect(setTitle).toHaveBeenCalledOnce()
  })

  it('runs after serialization without module closure dependencies', () => {
    const context = createContext({
      window,
      location,
      document,
      chrome: Reflect.get(globalThis, 'chrome'),
      expectedUrl: location.href,
      saved: true,
    })
    const script = `(${applySavedTabTitle.toString()})(saved, expectedUrl)`
    runInContext(script, context)
    runInContext(script, context)

    expect(document.title).toBe('✓ Article title')
    expect(addListener).toHaveBeenCalledOnce()
    Reflect.set(context, 'saved', false)
    runInContext(script, context)
    expect(document.title).toBe('Article title')
    expect(listeners.size).toBe(0)
  })

  it('preserves a checkmark that belongs to the original site title', () => {
    document.title = '✓ Site-owned title'
    applySavedTabTitle(true, location.href)

    expect(document.title).toBe('✓ ✓ Site-owned title')
    expect(applySavedTabTitle(false, location.href)).toEqual({
      baseTitle: '✓ Site-owned title',
      displayTitle: '✓ Site-owned title',
      url: location.href,
    })
    expect(document.title).toBe('✓ Site-owned title')
  })

  it('marks an empty site title without inventing content', () => {
    document.title = ''
    applySavedTabTitle(true, location.href)
    expect(document.title).toBe('✓')
    applySavedTabTitle(true, location.href)
    expect(document.title).toBe('✓')
    applySavedTabTitle(false, location.href)
    expect(document.title).toBe('')
  })

  it('treats a newer site title as the new base title', () => {
    applySavedTabTitle(true, location.href)
    document.title = 'Updated by the site'
    const result = applySavedTabTitle(true, location.href)

    expect(result?.baseTitle).toBe('Updated by the site')
    expect(document.title).toBe('✓ Updated by the site')
    expect(addListener).toHaveBeenCalledOnce()
    applySavedTabTitle(false, location.href)
    expect(document.title).toBe('Updated by the site')
  })

  it('keeps a new site-owned prefix when updating the base title', () => {
    applySavedTabTitle(true, location.href)
    document.title = '✓ New site-owned title'
    applySavedTabTitle(true, location.href)
    expect(document.title).toBe('✓ ✓ New site-owned title')
    applySavedTabTitle(false, location.href)
    expect(document.title).toBe('✓ New site-owned title')
  })

  it('restores only the title last written by TABBIN and removes its listener', () => {
    applySavedTabTitle(true, location.href)
    applySavedTabTitle(false, location.href)

    expect(document.title).toBe('Article title')
    expect(removeListener).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
    applySavedTabTitle(false, location.href)
    expect(removeListener).toHaveBeenCalledOnce()
  })

  it('preserves a newer site title when disabled before its next update', () => {
    applySavedTabTitle(true, location.href)
    document.title = 'A newer site title'
    applySavedTabTitle(false, location.href)

    expect(document.title).toBe('A newer site title')
    expect(listeners.size).toBe(0)
  })

  it('clears ownership so the next mark starts with the current site title', () => {
    applySavedTabTitle(true, location.href)
    applySavedTabTitle(false, location.href)
    document.title = '✓ A different site title'
    applySavedTabTitle(true, location.href)

    expect(document.title).toBe('✓ ✓ A different site title')
    expect(addListener).toHaveBeenCalledTimes(2)
  })

  it('does nothing to an unmarked title when disabled', () => {
    document.title = '✓ Site-owned title'
    applySavedTabTitle(false, location.href)

    expect(document.title).toBe('✓ Site-owned title')
    expect(addListener).not.toHaveBeenCalled()
    expect(removeListener).not.toHaveBeenCalled()
  })

  it('ignores a stale navigation URL', () => {
    applySavedTabTitle(true, `${location.href}#stale`)

    expect(document.title).toBe('Article title')
    expect(addListener).not.toHaveBeenCalled()
  })

  it('does not restore a marked title for a stale navigation URL', () => {
    applySavedTabTitle(true, location.href)
    applySavedTabTitle(false, `${location.href}#stale`)

    expect(document.title).toBe('✓ Article title')
    expect(removeListener).not.toHaveBeenCalled()
  })

  it('ignores child frames even when their URL matches', () => {
    vi.stubGlobal('window', { top: {} })
    applySavedTabTitle(true, location.href)

    expect(document.title).toBe('Article title')
    expect(addListener).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    {},
    { runtime: {} },
    { runtime: { id: '', onMessage: { addListener, removeListener } } },
    { runtime: { id: extensionId, onMessage: { addListener } } },
  ])(
    'does not mark without a restorable extension message channel: %j',
    (api) => {
      vi.stubGlobal('chrome', api)
      applySavedTabTitle(true, location.href)

      expect(document.title).toBe('Article title')
      expect(addListener).not.toHaveBeenCalled()
    },
  )
})

describe('native title messages', () => {
  beforeEach(() => {
    applySavedTabTitle(true, location.href)
  })

  it('reads the owned base title for the current native title', () => {
    const respond = dispatch(request('read'))

    expect(respond).toHaveBeenCalledExactlyOnceWith({
      baseTitle: 'Article title',
      displayTitle: '✓ Article title',
      url: location.href,
    })
    expect(document.title).toBe('✓ Article title')
  })

  it('reads a newer site title without stripping its prefix or changing it', () => {
    document.title = '✓ Site-owned update'
    const respond = dispatch(request('read'))

    expect(respond).toHaveBeenCalledExactlyOnceWith({
      baseTitle: '✓ Site-owned update',
      displayTitle: '✓ Site-owned update',
      url: location.href,
    })
    expect(document.title).toBe('✓ Site-owned update')
  })

  it('restores through messaging after host permission removal', () => {
    const respond = dispatch(request('restore'))

    expect(document.title).toBe('Article title')
    expect(respond).toHaveBeenCalledExactlyOnceWith({
      baseTitle: 'Article title',
      displayTitle: 'Article title',
      url: location.href,
    })
    expect(removeListener).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
    expect(dispatch(request('read'))).not.toHaveBeenCalled()
  })

  it('preserves newer site content when restoring through messaging', () => {
    document.title = 'A newer site title'
    dispatch(request('restore'))

    expect(document.title).toBe('A newer site title')
    expect(listeners.size).toBe(0)
  })

  it.each([
    null,
    undefined,
    'restore',
    [],
    {},
    { action: NATIVE_SAVED_TAB_TITLE_ACTION },
    { action: 'other', command: 'restore' },
    { action: NATIVE_SAVED_TAB_TITLE_ACTION, command: 'mark' },
    { action: NATIVE_SAVED_TAB_TITLE_ACTION, command: 'restore', saved: false },
    Object.assign(
      Object.create({
        action: NATIVE_SAVED_TAB_TITLE_ACTION,
        command: 'restore',
      }),
      { unknown: true, saved: true },
    ),
  ])('ignores unrecognized messages: %j', (message) => {
    expect(dispatch(message)).not.toHaveBeenCalled()
    expect(document.title).toBe('✓ Article title')
    expect(listeners.size).toBe(1)
  })

  it.each([null, undefined, {}, { id: '' }, { id: 'another-extension' }])(
    'ignores messages from untrusted senders: %j',
    (sender) => {
      expect(dispatch(request('restore'), sender)).not.toHaveBeenCalled()
      expect(document.title).toBe('✓ Article title')
      expect(listeners.size).toBe(1)
    },
  )
})
