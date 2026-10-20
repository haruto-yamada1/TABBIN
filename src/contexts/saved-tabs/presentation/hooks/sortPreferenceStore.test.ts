import { describe, expect, it, vi } from 'vitest'

import type {
  SavedTabsSortPreferencesPort,
  SortOrder,
} from '@/contexts/saved-tabs/application/ports/SavedTabsSortPreferencesPort'

import { createSortPreferenceStore } from './sortPreferenceStore'

const setup = () => {
  const listeners = new Set<(order: SortOrder) => void>()
  const port = {
    read: vi
      .fn<SavedTabsSortPreferencesPort['read']>()
      .mockResolvedValue('default'),
    write: vi.fn<SavedTabsSortPreferencesPort['write']>().mockResolvedValue(),
    subscribe: vi.fn<SavedTabsSortPreferencesPort['subscribe']>(
      (_scope, _id, listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    ),
  }
  const notifyError = vi.fn()
  const store = createSortPreferenceStore(
    port,
    { scope: 'domain', id: 'one' },
    notifyError,
  )
  return {
    store,
    port,
    notifyError,
    deliver: (order: SortOrder) => {
      for (const listener of listeners) {
        listener(order)
      }
    },
  }
}

describe('sort preference operation boundaries', () => {
  it('blocks edits until hydration and while a write is pending, then saves functional updates', async () => {
    const { store, port } = setup()
    const pending = Promise.withResolvers<undefined>()
    port.write.mockReturnValueOnce(pending.promise)
    store.setSortOrder('desc')
    expect(port.write).not.toHaveBeenCalled()
    const disconnect = store.connect()
    await Promise.resolve()
    store.setSortOrder((order) => (order === 'default' ? 'asc' : 'desc'))
    store.setSortOrder('desc')
    expect(port.write).toHaveBeenCalledExactlyOnceWith('domain', 'one', 'asc')
    pending.resolve(undefined)
    await Promise.resolve()
    expect(store.getSnapshot()).toEqual({ sortOrder: 'asc', isPending: false })
    store.setSortOrder('asc')
    expect(port.write).toHaveBeenCalledTimes(1)
    disconnect()
  })

  it('keeps a newer external selection when a pending save fails', async () => {
    const { store, port, notifyError, deliver } = setup()
    const pending = Promise.withResolvers<undefined>()
    port.write.mockReturnValueOnce(pending.promise)
    const disconnect = store.connect()
    await Promise.resolve()
    store.setSortOrder('asc')
    deliver('desc')
    pending.reject(new Error('write failed'))
    await Promise.resolve()
    expect(store.getSnapshot()).toEqual({ sortOrder: 'desc', isPending: false })
    expect(notifyError).toHaveBeenCalledOnce()
    disconnect()
  })

  it('ignores a delayed read rejection after a new external selection or unmount', async () => {
    const { store, port, notifyError, deliver } = setup()
    const pending = Promise.withResolvers<SortOrder>()
    port.read.mockReturnValueOnce(pending.promise)
    const disconnect = store.connect()
    deliver('desc')
    disconnect()
    pending.reject(new Error('read failed'))
    await Promise.resolve()
    expect(store.getSnapshot().sortOrder).toBe('desc')
    expect(notifyError).not.toHaveBeenCalled()
  })

  it('reports a failed read and permits an explicit user retry', async () => {
    const { store, port, notifyError } = setup()
    port.read.mockRejectedValueOnce(new Error('read failed'))
    const disconnect = store.connect()
    await Promise.resolve()
    expect(store.getSnapshot().isPending).toBe(false)
    expect(notifyError).toHaveBeenCalledOnce()
    store.setSortOrder('asc')
    await Promise.resolve()
    expect(store.getSnapshot().sortOrder).toBe('asc')
    disconnect()
  })

  it('reports unavailable event subscription without crashing the saved-tabs page', () => {
    const { store, port, notifyError } = setup()
    port.subscribe.mockImplementationOnce(() => {
      throw new Error('events unavailable')
    })
    expect(() => store.connect()).not.toThrow()
    expect(notifyError).toHaveBeenCalledOnce()
    expect(store.getSnapshot().isPending).toBe(true)
  })
})
