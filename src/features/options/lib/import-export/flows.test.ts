// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertProductionImportAllowed: vi.fn(),
  importBackupV2WithRecovery: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/app/composition/optionsBackupRecovery', () => ({
  importBackupV2WithRecovery: mocks.importBackupV2WithRecovery,
}))
vi.mock('@/lib/logging/logger', () => ({
  logger: { error: mocks.loggerError },
}))
vi.mock('./productionImportGate', async (importOriginal) => ({
  ...(await importOriginal()),
  assertProductionImportAllowed: mocks.assertProductionImportAllowed,
}))

import { downloadAsJson, getImportPreview, importSettings } from './flows'
import { ProductionBackupImportError } from './productionImportGate'

describe('production import flow', () => {
  beforeEach(() => {
    mocks.assertProductionImportAllowed.mockReset()
    mocks.importBackupV2WithRecovery.mockReset().mockResolvedValue(undefined)
    mocks.loggerError.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('routes a current backup through recovery-backed overwrite', async () => {
    const inspection = {
      preview: {
        appVersion: '2.0.16',
        exportedAt: '2026-09-01T00:00:00.000Z',
      },
    }
    mocks.assertProductionImportAllowed.mockReturnValue({
      inspection,
      kind: 'v2-overwrite',
    })
    mocks.importBackupV2WithRecovery.mockResolvedValue(undefined)

    await expect(importSettings('{}')).resolves.toMatchObject({
      success: true,
    })
    expect(mocks.importBackupV2WithRecovery).toHaveBeenCalledExactlyOnceWith(
      inspection,
    )
  })

  it('returns a localized typed diagnostic for unsupported legacy input', async () => {
    mocks.assertProductionImportAllowed.mockImplementation(() => {
      throw new ProductionBackupImportError('UNSUPPORTED_LEGACY_BACKUP')
    })
    const translate = vi.fn((key: string) =>
      key === 'options.importExport.unsupportedLegacyBackup'
        ? 'Only current backups are supported.'
        : key,
    )

    await expect(importSettings('{}', translate)).resolves.toEqual({
      diagnostic: {
        errorCode: 'UNSUPPORTED_LEGACY_BACKUP',
        issueCodes: [],
        stage: 'format-detection',
      },
      message: 'Only current backups are supported.',
      success: false,
    })
    expect(mocks.importBackupV2WithRecovery).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'options_backup_import_failed',
      { code: 'UNSUPPORTED_LEGACY_BACKUP' },
      { action: 'formatDetection' },
    )
  })

  it('uses the invalid-format message for malformed input', async () => {
    mocks.assertProductionImportAllowed.mockImplementation(() => {
      throw new ProductionBackupImportError('INVALID_BACKUP')
    })
    const translate = vi.fn((key: string) =>
      key === 'options.importExport.importFormatError'
        ? 'Invalid backup.'
        : key,
    )

    await expect(importSettings('{}', translate)).resolves.toMatchObject({
      diagnostic: { errorCode: 'INVALID_BACKUP' },
      message: 'Invalid backup.',
      success: false,
    })
  })

  it('reports the failing write stage without exposing error text', async () => {
    mocks.assertProductionImportAllowed.mockReturnValue({
      inspection: { preview: {} },
      kind: 'v2-overwrite',
    })
    mocks.importBackupV2WithRecovery.mockRejectedValue(
      new Error('private URL from a low-level failure'),
    )

    await expect(importSettings('{}')).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'UNKNOWN_IMPORT_ERROR',
        issueCodes: [],
        stage: 'v2-overwrite',
      },
      success: false,
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'options_backup_import_failed',
      { code: 'UNKNOWN_IMPORT_ERROR' },
      { action: 'v2Overwrite' },
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
  })

  it('uses a translated success message for current Backup V2', async () => {
    mocks.assertProductionImportAllowed.mockReturnValue({
      inspection: {
        preview: {
          appVersion: '2.0.16',
          exportedAt: '2026-09-01T00:00:00.000Z',
        },
      },
      kind: 'v2-overwrite',
    })
    const translate = vi.fn(() => 'Translated success')

    await expect(importSettings('{}', translate)).resolves.toEqual({
      message: 'Translated success',
      success: true,
    })
    expect(translate).toHaveBeenCalledWith(
      'options.importExport.replaceSuccess',
      undefined,
      expect.objectContaining({ version: '2.0.16' }),
    )
  })

  it.each([
    [
      'UNSUPPORTED_LEGACY_BACKUP',
      'このバックアップ形式はサポートされていません。現在のバックアップ形式のみインポートできます。',
    ],
    [
      'UNSUPPORTED_FUTURE_SCHEMA',
      'このバックアップは新しいバージョンで作成されているため、現在のバージョンではインポートできません。',
    ],
    ['INVALID_BACKUP', 'インポートされたデータの形式が正しくありません'],
  ] as const)(
    'uses the safe fallback message for %s',
    async (code, message) => {
      mocks.assertProductionImportAllowed.mockImplementation(() => {
        throw new ProductionBackupImportError(code)
      })

      await expect(importSettings('{}')).resolves.toMatchObject({ message })
    },
  )

  it('preserves a safe typed writer error code', async () => {
    mocks.assertProductionImportAllowed.mockReturnValue({
      inspection: { preview: {} },
      kind: 'v2-overwrite',
    })
    mocks.importBackupV2WithRecovery.mockRejectedValue({
      code: 'RECOVERY_WRITE_BLOCKED',
    })

    await expect(importSettings('{}')).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'RECOVERY_WRITE_BLOCKED',
        stage: 'v2-overwrite',
      },
    })
  })

  it('normalizes an unknown failure with the translated generic message', async () => {
    mocks.assertProductionImportAllowed.mockImplementation(() => {
      throw new Error('private failure')
    })
    const translate = vi.fn((key: string) =>
      key === 'options.importExport.importError' ? 'Import failed.' : key,
    )

    await expect(importSettings('{}', translate)).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'UNKNOWN_IMPORT_ERROR',
        stage: 'format-detection',
      },
      message: 'Import failed. (format-detection: UNKNOWN_IMPORT_ERROR)',
      success: false,
    })
  })

  it('builds a current Backup V2 preview without legacy metadata', () => {
    mocks.assertProductionImportAllowed.mockReturnValue({
      inspection: {
        data: {
          savedTabs: {
            collections: [
              { definition: { domain: 'example.com', type: 'domain' } },
              { definition: { type: 'custom' } },
            ],
          },
        },
        preview: {
          appVersion: '2.0.16',
          entityCounts: {
            analyticsViews: 1,
            categories: 2,
            conversations: 1,
          },
          exportedAt: '2026-09-01T00:00:00.000Z',
        },
      },
      kind: 'v2-overwrite',
    })

    expect(getImportPreview('{}')).toEqual({
      message: 'データの解析に成功しました',
      preview: {
        categoriesCount: 2,
        domainsCount: 1,
        hasAiChat: true,
        hasAnalytics: true,
        projectsCount: 1,
        timestamp: '2026-09-01T00:00:00.000Z',
        version: '2.0.16',
      },
      success: true,
    })
  })

  it('returns a translated typed preview rejection', () => {
    mocks.assertProductionImportAllowed.mockImplementation(() => {
      throw new ProductionBackupImportError('UNSUPPORTED_FUTURE_SCHEMA')
    })
    const translate = vi.fn((key: string) =>
      key === 'options.importExport.unsupportedFutureBackup'
        ? 'Unsupported future backup.'
        : key,
    )

    expect(getImportPreview('{}', translate)).toEqual({
      diagnostic: {
        errorCode: 'UNSUPPORTED_FUTURE_SCHEMA',
        issueCodes: [],
        stage: 'format-detection',
      },
      message: 'Unsupported future backup.',
      success: false,
    })
  })

  it('downloads compact JSON and cleans up the temporary URL', async () => {
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:backup')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        callback(0)
        return 1
      },
    )

    await downloadAsJson({ backup: true }, 'backup.json')

    const anchor = click.mock.instances[0] as HTMLAnchorElement | undefined
    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(anchor?.download).toBe('backup.json')
    expect(anchor?.href).toBe('blob:backup')
    expect(anchor?.isConnected).toBe(false)
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith('blob:backup')
  })

  it('releases the temporary URL and anchor when starting a download fails', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-backup')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        throw new Error('download unavailable')
      })

    await expect(downloadAsJson({}, 'backup.json')).rejects.toThrow(
      'download unavailable',
    )

    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.isConnected).toBe(false)
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(
      'blob:failed-backup',
    )
  })
})
