import { describe, expect, it, vi } from 'vitest'

import type { PersistenceChangePort } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'

import { createPersistenceChangeStorageAdapter } from './PersistenceChangeStorageAdapter'

describe('createPersistenceChangeStorageAdapter', () => {
  it('saved-tabs scopesをurls noPayload通知へ変換し非対象scopeを無視する', () => {
    let listener: Parameters<PersistenceChangePort['subscribe']>[0] | undefined
    const changePort: PersistenceChangePort = {
      publish: vi.fn(),
      subscribe: (nextListener) => {
        listener = nextListener
        return vi.fn()
      },
    }
    const storagePort = createPersistenceChangeStorageAdapter(changePort)
    const storageListener = vi.fn()
    storagePort.subscribe(storageListener)

    listener?.({ changeId: 'change-1', revision: 2, scopes: ['collections'] })
    listener?.({
      changeId: 'change-2',
      revision: 3,
      scopes: ['analyticsViews'],
    })

    expect(storageListener).toHaveBeenCalledOnce()
    expect(storageListener).toHaveBeenCalledWith([
      {
        key: 'urls',
        kind: 'noPayload',
        newValue: { revision: 2, scopes: ['collections'] },
        oldValue: undefined,
      },
    ])
  })
})
