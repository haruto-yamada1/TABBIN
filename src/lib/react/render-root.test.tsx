import type { RootOptions } from 'react-dom/client'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type * as LoggingModule from '@/lib/logging/logger'

import { getOrCreateRoot, mountToElement, renderToRoot } from './render-root'
import { RenderErrorBoundary } from './RenderErrorBoundary'

const rootMocks = vi.hoisted(() => ({
  createRoot: vi.fn((_container: HTMLElement, _options?: RootOptions) => ({
    render: vi.fn(),
  })),
}))

const diagnostics = vi.hoisted(() => ({ records: [] as unknown[] }))
vi.mock('@/lib/logging/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof LoggingModule>()
  return {
    ...actual,
    logger: actual.createLogger({
      debugEnabled: false,
      sink: {
        debug: () => undefined,
        error: (record) => diagnostics.records.push(record),
        info: () => undefined,
        warn: () => undefined,
      },
    }),
  }
})

vi.mock('react-dom/client', () => ({
  createRoot: rootMocks.createRoot,
}))

describe('render-root', () => {
  beforeEach(() => {
    // createRoot is a module-level mock shared across both tests; clear call
    // history so absolute call-count assertions stay order-independent.
    rootMocks.createRoot.mockClear()
    diagnostics.records = []
  })

  it('all React error callbacks retain safe metadata and discard private error details', () => {
    getOrCreateRoot(document.createElement('div'))
    const options = rootMocks.createRoot.mock.calls[0]?.[1]
    const error = new TypeError('private URL, title, prompt and backup')
    error.stack = 'private stack'
    const info = { componentStack: 'private component stack' }

    options?.onCaughtError?.(error, info)
    options?.onUncaughtError?.(error, info)
    options?.onRecoverableError?.(error, info)

    expect(diagnostics.records).toEqual([
      { event: 'react_render_caught', context: { errorName: 'TypeError' } },
      { event: 'react_render_uncaught', context: { errorName: 'TypeError' } },
      {
        event: 'react_render_recoverable',
        context: { errorName: 'TypeError' },
      },
    ])
  })

  it('同じ container では root を再利用して render する', () => {
    const container = document.createElement('div')

    const firstRoot = getOrCreateRoot(container)
    const secondRoot = getOrCreateRoot(container)

    expect(firstRoot).toBe(secondRoot)
    expect(rootMocks.createRoot).toHaveBeenCalledOnce()

    renderToRoot(container, <span>content</span>)

    expect(firstRoot.render).toHaveBeenCalledWith(
      <RenderErrorBoundary>
        <span>content</span>
      </RenderErrorBoundary>,
    )
  })

  it('指定 ID の要素へ mount し、存在しなければ例外を投げる', () => {
    const container = document.createElement('div')
    container.id = 'app'
    document.body.append(container)

    expect(() => {
      mountToElement('app', <span>mounted</span>, 'missing')
    }).not.toThrow()
    expect(() => {
      mountToElement('missing-app', <span>missing</span>, 'root missing')
    }).toThrow('root missing')
  })
})
