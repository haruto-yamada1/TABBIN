import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'

import { exportRenderRecoveryBackup } from './renderRecoveryExport'

const { downloadAsJson, exportBackupV2 } = vi.hoisted(() => ({
  downloadAsJson: vi.fn(),
  exportBackupV2: vi.fn(),
}))

vi.mock('./optionsBackupV2Export', () => ({ exportBackupV2 }))
vi.mock('@/features/options/lib/import-export', () => ({ downloadAsJson }))

const backup = BackupEnvelopeV2Schema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../features/options/lib/import-export/v2/fixtures/backup-v2-current.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
)

describe('exportRenderRecoveryBackup', () => {
  beforeEach(() => {
    exportBackupV2.mockReset()
    downloadAsJson.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'))
    exportBackupV2.mockResolvedValue(backup)
    downloadAsJson.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('downloads the validated Backup V2 returned by the existing exporter', async () => {
    await expect(exportRenderRecoveryBackup()).resolves.toBeUndefined()

    expect(exportBackupV2).toHaveBeenCalledOnce()
    expect(downloadAsJson).toHaveBeenCalledExactlyOnceWith(
      backup,
      'tabbin-backup-2026-10-01.json',
    )
  })

  it('waits for the exporter before starting the download', async () => {
    let resolveExport: (() => void) | undefined
    exportBackupV2.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveExport = () => resolve(backup)
        }),
    )

    const exportResult = exportRenderRecoveryBackup()
    await vi.waitFor(() => expect(exportBackupV2).toHaveBeenCalledOnce())
    expect(downloadAsJson).not.toHaveBeenCalled()

    resolveExport?.()
    await exportResult
    expect(downloadAsJson).toHaveBeenCalledOnce()
  })

  it('propagates export rejection and never downloads unverified data', async () => {
    const error = new Error('private storage payload')
    exportBackupV2.mockRejectedValueOnce(error)

    await expect(exportRenderRecoveryBackup()).rejects.toBe(error)
    expect(downloadAsJson).not.toHaveBeenCalled()
  })

  it('propagates download failure to the recovery UI', async () => {
    const error = new Error('download unavailable')
    downloadAsJson.mockRejectedValueOnce(error)

    await expect(exportRenderRecoveryBackup()).rejects.toBe(error)
    expect(exportBackupV2).toHaveBeenCalledOnce()
  })
})
