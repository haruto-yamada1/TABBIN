import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

import { parsedSourceProcessScript } from './firefoxParsedSources'

const href = 'moz-extension://fixture/app.html#/saved-tabs'
const marker = '__selectedDocument'
const channel = 'parsed-sources-fixture'
const windowGlobal = (window: object) => ({
  class: 'Window',
  unsafeDereference: () => window,
})

const collect = (
  globals: ReturnType<typeof windowGlobal>[],
  deadWindows = new WeakSet<object>(),
  inspectionError?: Error,
) => {
  const send = vi.fn()
  const addDebuggee = vi.fn()
  const removeAllDebuggees = vi.fn()
  const findScripts = vi.fn(() => {
    if (inspectionError) {
      throw inspectionError
    }
    return [{ source: { url: 'moz-extension://fixture/chunks/app.js' } }]
  })
  class Debugger {
    findAllGlobals = () => globals
    addDebuggee = addDebuggee
    findScripts = findScripts
    removeAllDebuggees = removeAllDebuggees
  }
  runInNewContext(parsedSourceProcessScript(href, channel, marker), {
    Cu: {
      Sandbox: () => ({ Debugger }),
      isDeadWrapper: (window: object) => deadWindows.has(window),
    },
    ChromeUtils: { importESModule: () => ({ addDebuggerToGlobal: () => {} }) },
    Services: { scriptSecurityManager: { getSystemPrincipal: () => ({}) } },
    sendAsyncMessage: send,
  })
  return { send, addDebuggee, findScripts, removeAllDebuggees }
}

describe('Firefox parsed JavaScript source collection', () => {
  it('ignores retired Window wrappers without reading them and still inspects the selected document', () => {
    const propertyRead = vi.fn(() => {
      throw new TypeError("can't access dead object")
    })
    const dead = new Proxy({}, { get: propertyRead })
    const selected = { location: { href }, [marker]: marker }
    const target = windowGlobal(selected)
    const result = collect([windowGlobal(dead), target], new WeakSet([dead]))

    expect(result.send).toHaveBeenCalledExactlyOnceWith(channel, {
      urls: ['moz-extension://fixture/chunks/app.js'],
    })
    expect(propertyRead).not.toHaveBeenCalled()
    expect(result.addDebuggee).toHaveBeenCalledExactlyOnceWith(selected)
    expect(result.findScripts).toHaveBeenCalledExactlyOnceWith({
      global: target,
    })
    expect(result.removeAllDebuggees).toHaveBeenCalledOnce()
  })

  it('requires the selected document marker even for another live Window with the same URL', () => {
    const other = { location: { href } }
    const selected = { location: { href }, [marker]: marker }
    const result = collect([
      windowGlobal(other),
      windowGlobal({ location: { href: 'moz-extension://other/app.html' } }),
      windowGlobal(selected),
    ])

    expect(result.addDebuggee).toHaveBeenCalledExactlyOnceWith(selected)
    expect(result.send).toHaveBeenCalledOnce()
  })

  it('returns no result when only retired or unselected windows remain', () => {
    const dead = new Proxy(
      {},
      {
        get: () => {
          throw new TypeError('dead')
        },
      },
    )
    const result = collect([windowGlobal(dead)], new WeakSet([dead]))

    expect(result.send).not.toHaveBeenCalled()
    expect(result.addDebuggee).not.toHaveBeenCalled()
    expect(result.removeAllDebuggees).toHaveBeenCalledOnce()
  })

  it('reports real inspection failures and detaches the debugger', () => {
    const result = collect(
      [windowGlobal({ location: { href }, [marker]: marker })],
      new WeakSet(),
      new Error('inspection failed'),
    )

    expect(result.send).toHaveBeenCalledExactlyOnceWith(channel, {
      error: 'Error: inspection failed',
    })
    expect(result.removeAllDebuggees).toHaveBeenCalledOnce()
  })
})
