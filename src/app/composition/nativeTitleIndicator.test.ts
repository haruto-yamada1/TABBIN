import { afterEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  read: vi.fn(),
  subscribe: vi.fn(),
  manager: {},
  gate: {},
}))
vi.mock(
  '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter',
  () => ({
    createBroadcastChannelPersistenceChangeAdapter: () => ({
      subscribe: mocked.subscribe,
    }),
  }),
)
vi.mock(
  '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime',
  () => ({
    getPersistenceBootstrapRuntime: () => ({
      connectionManager: mocked.manager,
      operationGate: mocked.gate,
    }),
  }),
)
vi.mock(
  '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader',
  () => ({
    IndexedDbPersistenceSnapshotReader: class {
      readVerifiedSavedTabsSnapshot = mocked.read
    },
  }),
)
import {
  readNativeTitleSavedUrls,
  subscribeNativeTitleSavedChanges,
} from './nativeTitleIndicator'

afterEach(() => {
  vi.clearAllMocks()
})
describe('native title saved-data composition', () => {
  it('uses the verified current snapshot and only exact URLs referenced by a collection', async () => {
    mocked.read.mockResolvedValue({
      savedTabs: {
        memberships: [{ urlId: 'a' }],
        urls: [
          { id: 'a', url: 'https://EXAMPLE.com:443/a#one' },
          { id: 'orphan', url: 'https://orphan.example/' },
        ],
      },
    })
    expect([...(await readNativeTitleSavedUrls())]).toEqual([
      'https://EXAMPLE.com:443/a#one',
    ])
    mocked.read.mockRejectedValueOnce(new Error('unavailable'))
    await expect(readNativeTitleSavedUrls()).rejects.toThrow('unavailable')
  })

  it('only invalidates on saved URL membership and collection changes', () => {
    const listener = vi.fn()
    const stop = vi.fn()
    mocked.subscribe.mockReturnValue(stop)
    expect(subscribeNativeTitleSavedChanges(listener)).toBe(stop)
    const handler = mocked.subscribe.mock.calls[0]?.[0]
    handler({ scopes: ['analyticsViews'] })
    expect(listener).not.toHaveBeenCalled()
    handler({ scopes: ['urls'] })
    handler({ scopes: ['memberships'] })
    handler({ scopes: ['collections'] })
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
