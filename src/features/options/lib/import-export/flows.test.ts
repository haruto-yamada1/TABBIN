import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertProductionImportAllowed: vi.fn(),
  importBackupV2WithRecovery: vi.fn(),
  loggerError: vi.fn(),
  mergeLegacyBackupIntoIndexedDb: vi.fn(),
}))

vi.mock('@/app/composition/optionsBackupRecovery', () => ({
  importBackupV2WithRecovery: mocks.importBackupV2WithRecovery,
}))

vi.mock('@/app/composition/optionsLegacyBackupMerge', () => ({
  mergeLegacyBackupIntoIndexedDb: mocks.mergeLegacyBackupIntoIndexedDb,
}))
vi.mock('@/lib/logging/logger', () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock('./productionImportGate', () => ({
  assertProductionImportAllowed: mocks.assertProductionImportAllowed,
}))

import { importSettings } from './flows'
import { LegacyBackupImportError } from './legacy/LegacyBackupAdapter'

describe('production import flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an unrecognized backup without invoking a persistence writer', async () => {
    mocks.assertProductionImportAllowed.mockReturnValue(undefined)

    await expect(importSettings('invalid')).resolves.toEqual({
      message: 'インポートされたデータの形式が正しくありません',
      success: false,
    })
    expect(mocks.mergeLegacyBackupIntoIndexedDb).not.toHaveBeenCalled()
    expect(mocks.importBackupV2WithRecovery).not.toHaveBeenCalled()
  })

  it('routes a supported legacy merge through the IndexedDB merge boundary', async () => {
    const gateResult = {
      inspection: {},
      kind: 'legacy-merge',
      serializedBytes: 1,
      userSettingsPatch: {},
    }
    mocks.assertProductionImportAllowed.mockReturnValue(gateResult)
    mocks.mergeLegacyBackupIntoIndexedDb.mockResolvedValue({
      addedEntityCounts: { collections: 2, groups: 1 },
    })

    await expect(importSettings('{}')).resolves.toMatchObject({
      success: true,
    })
    expect(
      mocks.mergeLegacyBackupIntoIndexedDb,
    ).toHaveBeenCalledExactlyOnceWith(gateResult)
    expect(mocks.importBackupV2WithRecovery).not.toHaveBeenCalled()
  })

  it('routes a current overwrite through recovery-backed Backup V2 import', async () => {
    const inspection = {
      preview: {
        appVersion: '1.2.3',
        exportedAt: '2026-08-08T00:00:00.000Z',
      },
    }
    mocks.assertProductionImportAllowed.mockReturnValue({
      inspection,
      kind: 'v2-overwrite',
    })
    mocks.importBackupV2WithRecovery.mockResolvedValue(undefined)

    await expect(importSettings('{}', false)).resolves.toMatchObject({
      success: true,
    })
    expect(mocks.importBackupV2WithRecovery).toHaveBeenCalledExactlyOnceWith(
      inspection,
    )
    expect(mocks.mergeLegacyBackupIntoIndexedDb).not.toHaveBeenCalled()
  })

  it('returns a privacy-safe typed diagnostic for blocked legacy compatibility', async () => {
    const error = new LegacyBackupImportError('LEGACY_MIGRATION_BLOCKED', [
      'LEGACY_URL_REFERENCE_CONFLICT',
    ])
    mocks.assertProductionImportAllowed.mockImplementation(() => {
      throw error
    })

    await expect(importSettings('{}')).resolves.toEqual({
      diagnostic: {
        errorCode: 'LEGACY_MIGRATION_BLOCKED',
        issueCodes: ['LEGACY_URL_REFERENCE_CONFLICT'],
        stage: 'compatibility',
      },
      message:
        'データのインポート中にエラーが発生しました (compatibility: LEGACY_MIGRATION_BLOCKED)',
      success: false,
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'options_backup_import_failed',
      { code: 'LEGACY_MIGRATION_BLOCKED' },
      { action: 'compatibility' },
    )
  })

  it('reports the failing write stage without exposing error text', async () => {
    const gateResult = {
      inspection: {},
      kind: 'legacy-merge',
      serializedBytes: 1,
      userSettingsPatch: {},
    }
    mocks.assertProductionImportAllowed.mockReturnValue(gateResult)
    mocks.mergeLegacyBackupIntoIndexedDb.mockRejectedValue(
      new Error('private URL from a low-level failure'),
    )

    await expect(importSettings('{}')).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'UNKNOWN_IMPORT_ERROR',
        issueCodes: [],
        stage: 'legacy-merge',
      },
      success: false,
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'options_backup_import_failed',
      { code: 'UNKNOWN_IMPORT_ERROR' },
      { action: 'legacyMerge' },
    )
  })

  it('keeps diagnostics best-effort for an untrusted Proxy error', async () => {
    const error = new Proxy(new Error('safe proxy error'), {
      getPrototypeOf: () => {
        throw new Error('private proxy trap')
      },
    })
    mocks.assertProductionImportAllowed.mockImplementation(() => {
      throw error
    })

    await expect(importSettings('{}')).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'UNKNOWN_IMPORT_ERROR',
        issueCodes: [],
        stage: 'format-detection',
      },
      success: false,
    })
    expect(mocks.loggerError).toHaveBeenCalledOnce()
    expect(mocks.loggerError.mock.calls[0]?.[0]).toBe(
      'options_backup_import_failed',
    )
    expect(mocks.loggerError.mock.calls[0]?.[1]).toEqual({
      code: 'UNKNOWN_IMPORT_ERROR',
    })
    expect(mocks.loggerError.mock.calls[0]?.[2]).toEqual({
      action: 'formatDetection',
    })
  })
})
