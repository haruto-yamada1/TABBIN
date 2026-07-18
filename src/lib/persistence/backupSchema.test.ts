import { describe, expect, it } from 'vitest'

import { BackupSchemaError, detectBackupFormat } from './backupSchema'

describe('detectBackupFormat', () => {
  it('detects a versioned envelope from an integer schemaVersion', () => {
    expect(
      detectBackupFormat({
        appVersion: '2.0.0',
        data: {},
        exportedAt: '2026-07-18T00:00:00.000Z',
        schemaVersion: 2,
      }),
    ).toEqual({ kind: 'versioned', schemaVersion: 2 })
  })

  it('classifies an object without schemaVersion as legacy', () => {
    expect(detectBackupFormat({ version: '2.0.0' })).toEqual({
      kind: 'legacy',
    })
  })

  it.each([null, [], 'backup', { schemaVersion: 0 }, { schemaVersion: 1.5 }])(
    'rejects malformed envelope input %#',
    (input) => {
      expect(() => detectBackupFormat(input)).toThrow(
        expect.objectContaining<Partial<BackupSchemaError>>({
          code: 'INVALID_SCHEMA',
        }),
      )
    },
  )

  it('keeps user data out of typed error messages', () => {
    const secret = 'private-user-backup-value'

    try {
      detectBackupFormat({ schemaVersion: secret })
      expect.unreachable('invalid schemaVersion must be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(BackupSchemaError)
      expect((error as Error).message).not.toContain(secret)
    }
  })
})
