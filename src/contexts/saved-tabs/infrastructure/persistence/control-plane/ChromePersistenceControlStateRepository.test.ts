import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

import {
  ChromePersistenceControlStateRepository,
  PERSISTENCE_CONTROL_STATE_STORAGE_KEY,
} from './ChromePersistenceControlStateRepository'
import type { PersistenceControlStorageArea } from './ChromePersistenceControlStateRepository'

type StorageFixture = {
  readonly area: PersistenceControlStorageArea
  readonly set: ReturnType<typeof vi.fn>
  readonly setAccessLevel: ReturnType<typeof vi.fn>
  readonly state: Record<string, unknown>
}

const createStorage = (
  initialState: Record<string, unknown> = {},
): StorageFixture => {
  const state = { ...initialState }
  const set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(state, values)
  })
  const setAccessLevel = vi.fn(async () => undefined)
  return {
    area: {
      get: vi.fn(async (key: string) => ({ [key]: state[key] })),
      set,
      setAccessLevel,
    },
    set,
    setAccessLevel,
    state,
  }
}

const expectUnavailableCode = async (
  operation: Promise<unknown>,
  code: PersistenceUnavailableError['code'],
): Promise<void> => {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceUnavailableError)
    expect((error as PersistenceUnavailableError).code).toBe(code)
    return
  }
  throw new Error('Expected persistence operation to fail.')
}

describe('ChromePersistenceControlStateRepository', () => {
  it('restricts chrome.storage.local to trusted contexts before reading state', async () => {
    const storage = createStorage()
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })

    await repository.initialize()

    expect(storage.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    })
  })

  it('accepts an unsupported access API only after proving no content scripts exist', async () => {
    const storage = createStorage()
    const area = { get: storage.area.get, set: storage.area.set }
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({ permissions: ['storage'] }),
      getStorageLocal: () => area,
    })

    await expect(repository.initialize()).resolves.toBeUndefined()
  })

  it('fails closed when access restriction is unavailable with content scripts', async () => {
    expect.hasAssertions()
    const storage = createStorage()
    const area = { get: storage.area.get, set: storage.area.set }
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({ content_scripts: [{ matches: ['https://*/*'] }] }),
      getStorageLocal: () => area,
    })

    await expectUnavailableCode(
      repository.initialize(),
      'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    )
  })

  it('fails closed when the manifest cannot be inspected', async () => {
    expect.hasAssertions()
    const storage = createStorage()
    const area = { get: storage.area.get, set: storage.area.set }
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => {
        throw new Error('manifest unavailable')
      },
      getStorageLocal: () => area,
    })

    await expectUnavailableCode(
      repository.initialize(),
      'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    )
  })

  it('fails closed when the manifest is not an object', async () => {
    expect.hasAssertions()
    const storage = createStorage()
    const area = { get: storage.area.get, set: storage.area.set }
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => null,
      getStorageLocal: () => area,
    })

    await expectUnavailableCode(
      repository.initialize(),
      'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    )
  })

  it('fails closed when the trusted-context access request rejects', async () => {
    const storage = createStorage()
    const setAccessLevel = storage.area.setAccessLevel
    expect(setAccessLevel).toBeDefined()
    if (!setAccessLevel) {
      throw new Error('Expected the access-level mock to exist.')
    }
    vi.mocked(setAccessLevel).mockRejectedValueOnce(new Error('access denied'))
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })

    await expectUnavailableCode(
      repository.initialize(),
      'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    )
  })

  it('treats a missing authoritative record as the legacy state', async () => {
    const storage = createStorage()
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })

    await expect(repository.read()).resolves.toEqual({ status: 'legacy' })
  })

  it('rejects invalid authoritative data without inspecting IndexedDB', async () => {
    expect.hasAssertions()
    const storage = createStorage({
      [PERSISTENCE_CONTROL_STATE_STORAGE_KEY]: { status: 'ready' },
    })
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })

    await expectUnavailableCode(
      repository.read(),
      'PERSISTENCE_CONTROL_STATE_INVALID',
    )
  })

  it('persists only a transition accepted by the state machine', async () => {
    const storage = createStorage()
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })

    await expect(
      repository.transition({
        type: 'begin-migration',
        migrationId: 'migration-1',
      }),
    ).resolves.toEqual({ status: 'migrating', migrationId: 'migration-1' })
    expect(storage.set).toHaveBeenCalledWith({
      [PERSISTENCE_CONTROL_STATE_STORAGE_KEY]: {
        status: 'migrating',
        migrationId: 'migration-1',
      },
    })

    await expectUnavailableCode(
      repository.transition({
        type: 'complete-cutover',
        migrationId: 'migration-1',
      }),
      'PERSISTENCE_INVALID_TRANSITION',
    )
    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it('classifies control-state write failures as unavailable', async () => {
    expect.hasAssertions()
    const storage = createStorage()
    storage.set.mockRejectedValueOnce(new Error('write failed'))
    const repository = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })

    await expectUnavailableCode(
      repository.transition({
        type: 'begin-migration',
        migrationId: 'migration-1',
      }),
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )
  })

  it('classifies missing storage and storage failures as unavailable', async () => {
    expect.hasAssertions()
    const missing = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => null,
    })
    await expectUnavailableCode(
      missing.read(),
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )

    const storage = createStorage()
    vi.mocked(storage.area.get).mockRejectedValueOnce(new Error('read failed'))
    const failing = new ChromePersistenceControlStateRepository({
      getManifest: () => ({}),
      getStorageLocal: () => storage.area,
    })
    await expectUnavailableCode(
      failing.read(),
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )
  })
})
