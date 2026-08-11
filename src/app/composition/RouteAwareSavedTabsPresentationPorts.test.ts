import { describe, expect, it, vi } from 'vitest'

import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { TypedSavedTabsStorageChange } from '@/contexts/saved-tabs/application/ports/StorageChangePort'

import { createRouteAwareSavedTabsPresentationPorts } from './RouteAwareSavedTabsPresentationPorts'

type PersistencePorts = Pick<
  SavedTabsPresentationPorts,
  'categoryAssignmentPort' | 'migrationPort' | 'storageChangePort'
>

const createRouter = (
  route: 'indexeddb' | 'legacy',
): PersistenceDataPlaneRouterPort => ({
  read: vi.fn(async (operation) => operation[route]()),
  write: vi.fn(async (operation) => operation[route]()),
})

const createPorts = (): PersistencePorts & {
  readonly emit: (changes: readonly TypedSavedTabsStorageChange[]) => void
  readonly saveParentCategories: ReturnType<typeof vi.fn>
  readonly saveTabGroups: ReturnType<typeof vi.fn>
  readonly migrateToUrlsStorage: ReturnType<typeof vi.fn>
  readonly unsubscribe: ReturnType<typeof vi.fn>
} => {
  let listener:
    | ((changes: readonly TypedSavedTabsStorageChange[]) => void)
    | undefined
  const saveParentCategories = vi.fn(async () => undefined)
  const saveTabGroups = vi.fn(async () => undefined)
  const migrateToUrlsStorage = vi.fn(async () => undefined)
  const unsubscribe = vi.fn()
  return {
    categoryAssignmentPort: { saveParentCategories, saveTabGroups },
    emit: (changes) => listener?.(changes),
    migrationPort: {
      migrateDomainStorageToHostname: vi.fn(async () => undefined),
      migrateParentCategoriesToDomainNames: vi.fn(async () => undefined),
      migrateToUrlsStorage,
    },
    migrateToUrlsStorage,
    saveParentCategories,
    saveTabGroups,
    storageChangePort: {
      subscribe: (nextListener) => {
        listener = nextListener
        return unsubscribe
      },
    },
    unsubscribe,
  }
}

describe('route-aware saved-tabs presentation ports', () => {
  it.each(['legacy', 'indexeddb'] as const)(
    '%s route invokes only the selected category writer',
    async (route) => {
      const legacy = createPorts()
      const indexeddb = createPorts()
      const ports = createRouteAwareSavedTabsPresentationPorts({
        indexeddb,
        legacy,
        onRoutingFailure: vi.fn(),
        router: createRouter(route),
      })

      await ports.categoryAssignmentPort.saveParentCategories([])
      await ports.categoryAssignmentPort.saveTabGroups([])

      expect(legacy.saveParentCategories).toHaveBeenCalledTimes(
        route === 'legacy' ? 1 : 0,
      )
      expect(indexeddb.saveParentCategories).toHaveBeenCalledTimes(
        route === 'indexeddb' ? 1 : 0,
      )
      expect(legacy.saveTabGroups).toHaveBeenCalledTimes(
        route === 'legacy' ? 1 : 0,
      )
      expect(indexeddb.saveTabGroups).toHaveBeenCalledTimes(
        route === 'indexeddb' ? 1 : 0,
      )
    },
  )

  it('does not fall back to legacy after an IndexedDB presentation write failure', async () => {
    const legacy = createPorts()
    const indexeddb = createPorts()
    const error = new Error('indexeddb failed')
    indexeddb.saveTabGroups.mockRejectedValueOnce(error)
    const ports = createRouteAwareSavedTabsPresentationPorts({
      indexeddb,
      legacy,
      onRoutingFailure: vi.fn(),
      router: createRouter('indexeddb'),
    })

    await expect(ports.categoryAssignmentPort.saveTabGroups([])).rejects.toBe(
      error,
    )
    expect(legacy.saveTabGroups).not.toHaveBeenCalled()
  })

  it('runs migration only on the selected route', async () => {
    const legacy = createPorts()
    const indexeddb = createPorts()
    const ports = createRouteAwareSavedTabsPresentationPorts({
      indexeddb,
      legacy,
      onRoutingFailure: vi.fn(),
      router: createRouter('indexeddb'),
    })

    await ports.migrationPort.migrateToUrlsStorage()

    expect(indexeddb.migrateToUrlsStorage).toHaveBeenCalledOnce()
    expect(legacy.migrateToUrlsStorage).not.toHaveBeenCalled()
  })

  it('forwards persistence notifications only from the selected transport', async () => {
    const legacy = createPorts()
    const indexeddb = createPorts()
    const onRoutingFailure = vi.fn()
    const ports = createRouteAwareSavedTabsPresentationPorts({
      indexeddb,
      legacy,
      onRoutingFailure,
      router: createRouter('indexeddb'),
    })
    const listener = vi.fn()
    const unsubscribe = ports.storageChangePort.subscribe(listener)
    const change: TypedSavedTabsStorageChange = {
      key: 'urls',
      kind: 'noPayload',
      newValue: { revision: 2 },
      oldValue: undefined,
    }

    legacy.emit([change])
    indexeddb.emit([change])
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    expect(listener).toHaveBeenCalledWith([change])
    expect(onRoutingFailure).not.toHaveBeenCalled()

    unsubscribe()
    expect(legacy.unsubscribe).toHaveBeenCalledOnce()
    expect(indexeddb.unsubscribe).toHaveBeenCalledOnce()
  })
})
