import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { BackupSchemaError } from '@/lib/persistence/backupSchema'

import { inspectBackupV2 } from './BackupV2Inspector'

const readFixture = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

describe('inspectBackupV2', () => {
  it('strictly validates the current V2 fixture', () => {
    expect(
      inspectBackupV2(readFixture('backup-v2-current.json')),
    ).toMatchObject({
      preview: {
        schemaVersion: 2,
      },
    })
  })

  it('rejects a future schema with safe version diagnostics', () => {
    expect(() => inspectBackupV2(readFixture('backup-v2-future.json'))).toThrow(
      expect.objectContaining<Partial<BackupSchemaError>>({
        code: 'UNSUPPORTED_FUTURE_SCHEMA',
        currentVersion: 2,
        receivedVersion: 3,
      }),
    )
  })

  it('rejects invalid JSON without leaking parser details', () => {
    expect(() => inspectBackupV2('{not-json')).toThrow(
      expect.objectContaining<Partial<BackupSchemaError>>({
        code: 'INVALID_SCHEMA',
      }),
    )
  })

  it('rejects schema-less backups without a legacy inspection branch', () => {
    expect(() => inspectBackupV2({ version: '1.0.0' })).toThrow(
      expect.objectContaining<Partial<BackupSchemaError>>({
        code: 'UNSUPPORTED_LEGACY_BACKUP',
      }),
    )
  })
})
