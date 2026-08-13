import { describe, expect, it, vi } from 'vitest'

import type {
  MigrationPreflightDiagnostic,
  MigrationPreflightServicePort,
  MigrationPreflightStatus,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceControlState } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { createMigrationPreflightController } from './createMigrationPreflightController'

const diagnostic: MigrationPreflightDiagnostic = {
  capacityStatus: 'blocked',
  collisionCount: 1,
  entityCounts: { urls: 2 },
  issueCodes: ['DUPLICATE_URL_ID'],
  preflightVersion: 1,
  sourceFingerprintVersion: 1,
}

const createService = (
  initial: MigrationPreflightStatus,
  result: MigrationPreflightStatus = initial,
): MigrationPreflightServicePort => ({
  createCurrentDataBackup: vi.fn(async () => {
    throw new Error('not used by silent startup')
  }),
  readHealthySourceFingerprint: vi.fn(async () => 'fp'),
  readStatus: vi.fn(async () => initial),
  run: vi.fn(async () => result),
})

type TestControlStatus = Extract<
  PersistenceControlState['status'],
  'cutover-pending' | 'indexeddb' | 'legacy' | 'migrating' | 'verifying'
>

const createControlState = (
  status: TestControlStatus,
): PersistenceControlState => {
  if (status === 'legacy') {
    return { status }
  }
  if (status === 'indexeddb') {
    return {
      migrationId: 'persistence-v2-production',
      persistenceGeneration: 2,
      status,
    }
  }
  return { migrationId: 'persistence-v2-production', status }
}

const createBootstrap = (status: TestControlStatus = 'legacy') => ({
  migrate: vi.fn(async () => undefined),
  readState: vi.fn(async () => createControlState(status)),
  ready: vi.fn(async () => undefined),
})

const createController = (
  service: MigrationPreflightServicePort,
  bootstrap = createBootstrap(),
) =>
  createMigrationPreflightController({
    bootstrap,
    migrationId: 'persistence-v2-production',
    service,
  })

describe('createMigrationPreflightController', () => {
  it('loads a persisted healthy status without rerunning analysis', async () => {
    const service = createService({
      checkedAt: 1,
      diagnostic: { ...diagnostic, capacityStatus: 'ready', issueCodes: [] },
      status: 'healthy',
    })
    const controller = createController(service)

    await controller.run()

    expect(service.run).not.toHaveBeenCalled()
  })

  it('runs a not-run preflight', async () => {
    const blocked: MigrationPreflightStatus = {
      checkedAt: 2,
      diagnostic,
      issueCodes: ['DUPLICATE_URL_ID'],
      status: 'blocked',
    }
    const service = createService({ status: 'not-run' }, blocked)
    const controller = createController(service)

    await controller.run()

    expect(service.run).toHaveBeenCalledOnce()
  })

  it.each(['blocked', 'stale'] as const)(
    'reruns a persisted %s preflight on the next page launch',
    async (status) => {
      const persisted: MigrationPreflightStatus =
        status === 'blocked'
          ? {
              checkedAt: 2,
              diagnostic,
              issueCodes: ['DUPLICATE_URL_ID'],
              status,
            }
          : {
              checkedAt: 2,
              diagnostic,
              status,
            }
      const service = createService(persisted)
      const controller = createController(service)

      await controller.run()

      expect(service.run).toHaveBeenCalledOnce()
    },
  )

  it('runs at most once during the current page lifetime', async () => {
    const service = createService({ status: 'not-run' })
    const controller = createController(service)

    await controller.run()
    await controller.run()

    expect(service.readStatus).toHaveBeenCalledOnce()
    expect(service.run).toHaveBeenCalledOnce()
  })

  it('concurrent callers await the same in-flight startup', async () => {
    let resolveStatus: ((status: MigrationPreflightStatus) => void) | undefined
    const status = new Promise<MigrationPreflightStatus>((resolve) => {
      resolveStatus = resolve
    })
    const service = createService({ status: 'not-run' })
    vi.mocked(service.readStatus).mockImplementation(async () => status)
    const bootstrap = createBootstrap('indexeddb')
    const controller = createController(service, bootstrap)

    const first = controller.run()
    const second = controller.run()
    let secondSettled = false
    void second.finally(() => {
      secondSettled = true
    })
    await Promise.resolve()

    expect(secondSettled).toBe(false)

    resolveStatus?.({
      checkedAt: 1,
      diagnostic: { ...diagnostic, capacityStatus: 'ready', issueCodes: [] },
      status: 'healthy',
    })
    await Promise.all([first, second])

    expect(service.readStatus).toHaveBeenCalledOnce()
    expect(bootstrap.ready).toHaveBeenCalledOnce()
  })

  it('propagates status loading failure without starting analysis', async () => {
    const service = createService({ status: 'not-run' })
    vi.mocked(service.readStatus).mockRejectedValueOnce(new Error('raw secret'))
    const controller = createController(service)

    await expect(controller.run()).rejects.toThrow('raw secret')
    expect(service.run).not.toHaveBeenCalled()
  })

  it('starts the production migration after a healthy legacy preflight', async () => {
    const service = createService({
      checkedAt: 1,
      diagnostic: { ...diagnostic, capacityStatus: 'ready', issueCodes: [] },
      status: 'healthy',
    })
    const bootstrap = createBootstrap('legacy')
    const controller = createController(service, bootstrap)

    await controller.run()

    expect(bootstrap.migrate).toHaveBeenCalledWith('persistence-v2-production')
    expect(bootstrap.ready).not.toHaveBeenCalled()
  })

  it.each(['migrating', 'verifying', 'cutover-pending', 'indexeddb'] as const)(
    'resumes %s without starting a second migration',
    async (status) => {
      const service = createService({
        checkedAt: 1,
        diagnostic: {
          ...diagnostic,
          capacityStatus: 'ready',
          issueCodes: [],
        },
        status: 'healthy',
      })
      const bootstrap = createBootstrap(status)
      const controller = createController(service, bootstrap)

      await controller.run()

      expect(bootstrap.migrate).not.toHaveBeenCalled()
      expect(bootstrap.ready).toHaveBeenCalledOnce()
    },
  )

  it('does not start migration when the refreshed preflight remains blocked', async () => {
    const blocked: MigrationPreflightStatus = {
      checkedAt: 2,
      diagnostic,
      issueCodes: ['DUPLICATE_URL_ID'],
      status: 'blocked',
    }
    const service = createService({ status: 'not-run' }, blocked)
    const bootstrap = createBootstrap('legacy')
    const controller = createController(service, bootstrap)

    await controller.run()

    expect(bootstrap.migrate).not.toHaveBeenCalled()
    expect(bootstrap.ready).not.toHaveBeenCalled()
  })
})
