import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import {
  createGatedPersistenceStorageLocal,
  createPersistenceBootstrapRuntime,
} from './persistenceBootstrapRuntime'

const createGate = (): PersistenceOperationGatePort => ({
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
  runLegacyRead: vi.fn(async (operation) => operation()),
  runLegacyWrite: vi.fn(async (operation) => operation()),
})

describe('persistenceBootstrapRuntime storage facade', () => {
  it('retries the same production bootstrap after a transient gate failure', async () => {
    expect.hasAssertions()
    const initialize = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new PersistenceUnavailableError(
          'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
        ),
      )
      .mockResolvedValue(undefined)
    const legacyState = { status: 'legacy' } as const
    const controlStateRepository: PersistenceControlStateRepositoryPort = {
      read: vi.fn(async () => legacyState),
      transition: vi.fn(async () => legacyState),
    }
    const coordination: PersistenceCoordinationPort = {
      runExclusive: async (operation) => operation(),
      runShared: async (operation) => operation(),
    }
    const runtime = createPersistenceBootstrapRuntime(
      { initialize },
      controlStateRepository,
      coordination,
    )
    const operation = vi.fn(async () => 'legacy-value')

    await expect(
      runtime.operationGate.runLegacyRead(operation),
    ).rejects.toMatchObject({
      code: 'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    })
    expect(runtime.recovery.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    })

    await expect(runtime.recovery.retry()).resolves.toBeUndefined()
    await expect(runtime.operationGate.runLegacyRead(operation)).resolves.toBe(
      'legacy-value',
    )
    expect(runtime.recovery.getSnapshot()).toEqual({ status: 'available' })
    expect(initialize).toHaveBeenCalledTimes(2)
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('routes storage reads through the legacy read gate', async () => {
    const gate = createGate()
    const get = vi.fn(async (key: string) => ({ [key]: 'value' }))
    const storage = createGatedPersistenceStorageLocal(
      {
        clear: vi.fn(async () => undefined),
        get,
        getBytesInUse: vi.fn(async () => 0),
        getKeys: vi.fn(async () => []),
        remove: vi.fn(async (_keys: string | readonly string[]) => undefined),
        set: vi.fn(async (_items: Record<string, unknown>) => undefined),
      } as unknown as typeof chrome.storage.local,
      gate,
    )

    await expect(storage.get('key')).resolves.toEqual({ key: 'value' })
    expect(gate.runLegacyRead).toHaveBeenCalledTimes(1)
    expect(gate.runLegacyWrite).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledWith('key')
  })

  it('exposes only Promise-based storage operations to domain callers', () => {
    const gate = createGate()
    const rawStorage = {
      clear: vi.fn(async () => undefined),
      get: vi.fn(async () => ({})),
      getBytesInUse: vi.fn(async () => 0),
      getKeys: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    } as unknown as typeof chrome.storage.local
    const storage = createGatedPersistenceStorageLocal(rawStorage, gate)

    expectTypeOf<[string, () => undefined]>().not.toExtend<
      Parameters<typeof storage.get>
    >()

    expect(storage).toBeDefined()
  })

  it.each(['getBytesInUse', 'getKeys'] as const)(
    'routes storage %s through the legacy read gate',
    async (method) => {
      const gate = createGate()
      const rawStorage = {
        clear: vi.fn(async () => undefined),
        get: vi.fn(async () => ({})),
        getBytesInUse: vi.fn(async () => 0),
        getKeys: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      } as unknown as typeof chrome.storage.local
      const storage = createGatedPersistenceStorageLocal(rawStorage, gate)

      await storage[method]()

      expect(gate.runLegacyRead).toHaveBeenCalledTimes(1)
      expect(gate.runLegacyWrite).not.toHaveBeenCalled()
      expect(rawStorage[method]).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['clear', 'remove', 'set'] as const)(
    'routes storage %s through the legacy write gate',
    async (method) => {
      const gate = createGate()
      const rawStorage = {
        clear: vi.fn(async () => undefined),
        get: vi.fn(async () => ({})),
        getBytesInUse: vi.fn(async () => 0),
        getKeys: vi.fn(async () => []),
        remove: vi.fn(async (_keys: string | readonly string[]) => undefined),
        set: vi.fn(async (_items: Record<string, unknown>) => undefined),
      } as unknown as typeof chrome.storage.local
      const storage = createGatedPersistenceStorageLocal(rawStorage, gate)

      if (method === 'clear') {
        await storage.clear()
      } else if (method === 'remove') {
        await storage.remove('key')
      } else {
        await storage.set({ key: 'value' })
      }

      expect(gate.runLegacyWrite).toHaveBeenCalledTimes(1)
      expect(gate.runLegacyRead).not.toHaveBeenCalled()
      expect(rawStorage[method]).toHaveBeenCalledTimes(1)
    },
  )

  it('does not expose access-policy setup through the domain facade', () => {
    const gate = createGate()
    const setAccessLevel = vi.fn(async () => undefined)
    const storage = createGatedPersistenceStorageLocal(
      {
        clear: vi.fn(async () => undefined),
        get: vi.fn(async () => ({})),
        getBytesInUse: vi.fn(async () => 0),
        getKeys: vi.fn(async () => []),
        remove: vi.fn(async (_keys: string | readonly string[]) => undefined),
        set: vi.fn(async (_items: Record<string, unknown>) => undefined),
        setAccessLevel,
      } as unknown as typeof chrome.storage.local,
      gate,
    )

    expect('setAccessLevel' in storage).toBe(false)
    expect(setAccessLevel).not.toHaveBeenCalled()
    expect(gate.runLegacyRead).not.toHaveBeenCalled()
    expect(gate.runLegacyWrite).not.toHaveBeenCalled()
  })
})
