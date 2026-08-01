import { describe, expect, it, vi } from 'vitest'

import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'

import { createRouteAwareSavedTabsUseCases } from './RouteAwareSavedTabsUseCasesService'

const createBundle = (value: string): SavedTabsUseCases =>
  ({
    deleteSavedUrl: vi.fn(async () => value),
    getSavedTabs: vi.fn(async () => value),
  }) as unknown as SavedTabsUseCases

describe('createRouteAwareSavedTabsUseCases', () => {
  it.each([
    ['legacy', 'getSavedTabs', 'read'],
    ['indexeddb', 'getSavedTabs', 'read'],
    ['legacy', 'deleteSavedUrl', 'write'],
    ['indexeddb', 'deleteSavedUrl', 'write'],
  ] as const)(
    'routes %s %s through the %s data-plane operation',
    async (route, useCaseName, operationKind) => {
      const read = vi.fn(async (operation) => operation[route]())
      const write = vi.fn(async (operation) => operation[route]())
      const router: PersistenceDataPlaneRouterPort = { read, write }
      const legacy = createBundle('legacy')
      const indexeddb = createBundle('indexeddb')
      const useCases = createRouteAwareSavedTabsUseCases({
        indexeddb,
        legacy,
        router,
      })

      const invoke = useCases[useCaseName] as unknown as () => Promise<string>
      const result = await invoke()

      expect(result).toBe(route)
      expect(read).toHaveBeenCalledTimes(operationKind === 'read' ? 1 : 0)
      expect(write).toHaveBeenCalledTimes(operationKind === 'write' ? 1 : 0)
    },
  )

  it('does not invoke the legacy use-case after an IndexedDB failure', async () => {
    const failure = new Error('indexeddb failed')
    const legacyGetSavedTabs = vi.fn(async () => 'legacy')
    const indexedDbGetSavedTabs = vi.fn(async () => {
      throw failure
    })
    const legacy = createBundle('unused')
    const indexeddb = createBundle('unused')
    Object.defineProperty(legacy, 'getSavedTabs', {
      value: legacyGetSavedTabs,
    })
    Object.defineProperty(indexeddb, 'getSavedTabs', {
      value: indexedDbGetSavedTabs,
    })
    const router: PersistenceDataPlaneRouterPort = {
      read: async (operation) => operation.indexeddb(),
      write: async (operation) => operation.indexeddb(),
    }
    const useCases = createRouteAwareSavedTabsUseCases({
      indexeddb,
      legacy,
      router,
    })

    const invoke = useCases.getSavedTabs as unknown as () => Promise<unknown>
    await expect(invoke()).rejects.toBe(failure)
    expect(indexedDbGetSavedTabs).toHaveBeenCalledOnce()
    expect(legacyGetSavedTabs).not.toHaveBeenCalled()
  })

  it('fails closed without invoking legacy when production has no IndexedDB bundle', async () => {
    const legacyGetSavedTabs = vi.fn(async () => 'legacy')
    const legacy = createBundle('unused')
    Object.defineProperty(legacy, 'getSavedTabs', {
      value: legacyGetSavedTabs,
    })
    const router: PersistenceDataPlaneRouterPort = {
      read: async (operation) => operation.indexeddb(),
      write: async (operation) => operation.indexeddb(),
    }
    const useCases = createRouteAwareSavedTabsUseCases({ legacy, router })

    const invoke = useCases.getSavedTabs as unknown as () => Promise<unknown>
    await expect(invoke()).rejects.toMatchObject({
      code: 'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    })
    expect(legacyGetSavedTabs).not.toHaveBeenCalled()
  })
})
