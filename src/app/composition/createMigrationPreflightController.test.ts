import { describe, expect, it, vi } from 'vitest'

import type {
  MigrationPreflightDiagnostic,
  MigrationPreflightServicePort,
  MigrationPreflightStatus,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import { createMigrationPreflightController } from './createMigrationPreflightController'

const diagnostic: MigrationPreflightDiagnostic = {
  capacityStatus: 'blocked',
  collisionCount: 1,
  entityCounts: { urls: 2 },
  issueCodes: ['DUPLICATE_URL_ID'],
  preflightVersion: 1,
  sourceFingerprintVersion: 1,
}

const createSourceValue = (key: string): unknown => {
  if (key === 'activeAiChatConversationId') {
    return ''
  }
  if (key === 'urls') {
    return [{ title: 'private title', url: 'https://private.example' }]
  }
  return []
}

const createService = (
  initial: MigrationPreflightStatus,
  result: MigrationPreflightStatus = initial,
): MigrationPreflightServicePort => ({
  createCurrentDataBackup: vi.fn(
    async () =>
      Object.fromEntries(
        MIGRATION_SOURCE_KEYS.map((key) => [
          key,
          {
            status: 'present',
            value: createSourceValue(key),
          },
        ]),
      ) as RawLegacyStorageSnapshot,
  ),
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
      download: vi.fn(),
      now: () => 1,
      service,
      writeClipboard: vi.fn(async () => {}),
    })

    await controller.run()

    expect(controller.readStatus()).toEqual({ status: 'healthy' })
    expect(service.run).not.toHaveBeenCalled()
  })

  it('runs a not-run preflight and maps blocked issue codes for the notice', async () => {
    const blocked: MigrationPreflightStatus = {
      checkedAt: 2,
      diagnostic,
      issueCodes: ['DUPLICATE_URL_ID'],
      status: 'blocked',
    }
    const service = createService({ status: 'not-run' }, blocked)
    const controller = createMigrationPreflightController({
      download: vi.fn(),
      now: () => 2,
      service,
      writeClipboard: vi.fn(async () => {}),
    })

    await controller.run()

    expect(controller.readStatus()).toEqual({
      issueCodes: ['DUPLICATE_URL_ID'],
      status: 'blocked',
    })
  })

  it('copies only safe aggregate diagnostic fields', async () => {
    const blocked: MigrationPreflightStatus = {
      checkedAt: 2,
      diagnostic,
      issueCodes: ['DUPLICATE_URL_ID'],
      status: 'blocked',
    }
    const writeClipboard = vi.fn(async (_contents: string): Promise<void> => {})
    const controller = createMigrationPreflightController({
      download: vi.fn(),
      now: () => 2,
      service: createService(blocked),
      writeClipboard,
    })
    await controller.run()

    await controller.copyDiagnostic()

    const copied = writeClipboard.mock.calls[0]?.[0] ?? ''
    expect(copied).toContain('DUPLICATE_URL_ID')
    expect(copied).not.toContain('private.example')
    expect(copied).not.toContain('"sourceFingerprint":')
  })

  it('downloads a local raw backup without sending it to the diagnostic path', async () => {
    const download = vi.fn((_fileName: string, _contents: string): void => {})
    const writeClipboard = vi.fn(async (_contents: string): Promise<void> => {})
    const controller = createMigrationPreflightController({
      download,
      now: () => 456,
      service: createService({ status: 'not-run' }),
      writeClipboard,
    })

    await controller.backupCurrentData()

    expect(download).toHaveBeenCalledOnce()
    const contents = download.mock.calls[0]?.[1] ?? ''
    expect(contents).toContain('https://private.example')
    expect(contents).toContain('migration-preflight-raw-v1')
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('fails closed into a blocked notice when status loading rejects', async () => {
    const service = createService({ status: 'not-run' })
    vi.mocked(service.readStatus).mockRejectedValueOnce(new Error('raw secret'))
    const controller = createMigrationPreflightController({
      download: vi.fn(),
      now: () => 1,
      service,
      writeClipboard: vi.fn(async () => {}),
    })

    await expect(controller.run()).rejects.toThrow('raw secret')
    expect(controller.readStatus()).toEqual({
      issueCodes: ['MIGRATION_PREFLIGHT_STATE_UNAVAILABLE'],
      status: 'blocked',
    })
  })
})
