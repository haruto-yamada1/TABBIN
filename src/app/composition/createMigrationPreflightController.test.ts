import { describe, expect, it, vi } from 'vitest'

import type {
  MigrationPreflightDiagnostic,
  MigrationPreflightServicePort,
  MigrationPreflightStatus,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'

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

describe('createMigrationPreflightController', () => {
  it('loads a persisted healthy status without rerunning analysis', async () => {
    const service = createService({
      checkedAt: 1,
      diagnostic: { ...diagnostic, capacityStatus: 'ready', issueCodes: [] },
      status: 'healthy',
    })
    const controller = createMigrationPreflightController({
      service,
    })

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
    const controller = createMigrationPreflightController({
      service,
    })

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
      const controller = createMigrationPreflightController({
        service,
      })

      await controller.run()

      expect(service.run).toHaveBeenCalledOnce()
    },
  )

  it('runs at most once during the current page lifetime', async () => {
    const service = createService({ status: 'not-run' })
    const controller = createMigrationPreflightController({
      service,
    })

    await controller.run()
    await controller.run()

    expect(service.readStatus).toHaveBeenCalledOnce()
    expect(service.run).toHaveBeenCalledOnce()
  })

  it('propagates status loading failure without starting analysis', async () => {
    const service = createService({ status: 'not-run' })
    vi.mocked(service.readStatus).mockRejectedValueOnce(new Error('raw secret'))
    const controller = createMigrationPreflightController({
      service,
    })

    await expect(controller.run()).rejects.toThrow('raw secret')
    expect(service.run).not.toHaveBeenCalled()
  })
})
