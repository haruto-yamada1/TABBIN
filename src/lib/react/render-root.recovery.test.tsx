// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as LoggingModule from '@/lib/logging/logger'

import { getOrCreateRoot, renderToRoot } from './render-root'

vi.unmock('react-dom/client')

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

beforeEach(() => {
  document.documentElement.lang = 'en'
  diagnostics.records = []
})

const containers: HTMLElement[] = []
const createContainer = () => {
  const container = document.createElement('div')
  document.body.append(container)
  containers.push(container)
  return container
}

afterEach(() => {
  act(() => {
    for (const container of containers.splice(0)) {
      getOrCreateRoot(container).unmount()
      container.remove()
    }
  })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('root render recovery', () => {
  it('render failure remains visible until an explicit retry succeeds', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const user = userEvent.setup()
    const container = createContainer()
    let shouldThrow = true
    const Feature = () => {
      if (shouldThrow) {
        throw new Error('private prompt and URL')
      }
      return <p>Recovered feature</p>
    }

    await act(async () => renderToRoot(container, <Feature />))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('private prompt and URL')).toBeNull()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByRole('alert')).toBeTruthy()

    shouldThrow = false
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByText('Recovered feature')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    expect(diagnostics.records).toEqual([
      { event: 'react_render_caught', context: { errorName: 'Error' } },
      { event: 'react_render_caught', context: { errorName: 'Error' } },
    ])
  })

  it('has no export action without a safe export callback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const BrokenProvider = () => {
      throw new Error('provider unavailable')
    }
    await act(async () => renderToRoot(createContainer(), <BrokenProvider />))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
  })

  it.each(['sync', 'async'])(
    'export %s failure stays in recovery UI without revealing the payload',
    async (failure) => {
      const user = userEvent.setup()
      // eslint-disable-next-line typescript/promise-function-async -- Test a synchronous throw from a Promise-typed export callback too.
      const onExport = vi.fn(() => {
        if (failure === 'sync') {
          throw new Error('private backup payload')
        }
        return Promise.reject(new Error('private backup payload'))
      })
      const Broken = () => {
        throw new Error('private render payload')
      }
      await act(async () =>
        renderToRoot(createContainer(), <Broken />, { onExport }),
      )

      await user.click(screen.getByRole('button', { name: 'Export data' }))

      expect(onExport).toHaveBeenCalledOnce()
      expect(screen.getByText(/action could not be completed/)).toBeTruthy()
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
      expect(screen.queryByText(/private (backup|render) payload/)).toBeNull()
    },
  )

  it('export runs only on request and prevents duplicate downloads while pending', async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    const onExport = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const Broken = () => {
      throw new Error('render failed')
    }
    await act(async () =>
      renderToRoot(createContainer(), <Broken />, { onExport }),
    )
    expect(onExport).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Export data' }))
    const exporting = screen.getByRole('button', { name: 'Exporting…' })
    expect(exporting).toBeDisabled()
    await user.click(exporting)
    expect(onExport).toHaveBeenCalledOnce()
    await act(async () => finish?.())
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled()
    expect(screen.queryByText(/action could not be completed/)).toBeNull()
  })

  it('reload remains available when the feature cannot recover', async () => {
    const user = userEvent.setup()
    const Broken = () => {
      throw new Error('render failed')
    }
    await act(async () => renderToRoot(createContainer(), <Broken />))
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })

    await user.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
