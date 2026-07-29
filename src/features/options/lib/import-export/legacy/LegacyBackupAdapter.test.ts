import { describe, expect, it } from 'vitest'

import { BackupSchemaError } from '@/lib/persistence/backupSchema'

import { convertLegacyBackup } from './LegacyBackupAdapter'

describe('convertLegacyBackup', () => {
  it('rejects non-legacy input before applying the legacy cutoff', () => {
    const error = (() => {
      try {
        convertLegacyBackup({ schemaVersion: 2 }, '2026-09-01')
      } catch (error) {
        return error
      }
      throw new Error('Expected conversion to fail')
    })()

    expect(error).toBeInstanceOf(BackupSchemaError)
    expect(error).toMatchObject({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
  })
})
