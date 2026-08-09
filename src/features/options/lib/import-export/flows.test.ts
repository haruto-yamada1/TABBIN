import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertProductionImportAllowed: vi.fn(),
  importBackupV2WithRecovery: vi.fn(),
  mergeLegacyBackupIntoIndexedDb: vi.fn(),
}))

vi.mock('@/app/composition/optionsBackupRecovery', () => ({
  importBackupV2WithRecovery: mocks.importBackupV2WithRecovery,
}))

vi.mock('@/app/composition/optionsLegacyBackupMerge', () => ({
  mergeLegacyBackupIntoIndexedDb: mocks.mergeLegacyBackupIntoIndexedDb,
}))

vi.mock('./productionImportGate', () => ({
  assertProductionImportAllowed: mocks.assertProductionImportAllowed,
}))

import { importSettings } from './flows'

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
})
