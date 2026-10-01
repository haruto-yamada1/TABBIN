import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  assertProductionImportAllowed,
  PRODUCTION_BACKUP_IMPORT_ERROR_CODES,
} from './productionImportGate'
import type { ProductionBackupImportError } from './productionImportGate'

const readFixture = (name: string): string =>
  readFileSync(new URL(`v2/fixtures/${name}`, import.meta.url), 'utf8')

const captureError = (action: () => unknown): Error => {
  try {
    action()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
  }
  throw new Error('Expected action to throw')
}

describe('assertProductionImportAllowed', () => {
  it('exposes the cutoff import error contract', () => {
    expect(PRODUCTION_BACKUP_IMPORT_ERROR_CODES).toEqual([
      'UNSUPPORTED_LEGACY_BACKUP',
      'UNSUPPORTED_FUTURE_SCHEMA',
      'INVALID_BACKUP',
    ])
  })

  it('strictly validates current V2 for recovery-backed overwrite', () => {
    expect(
      assertProductionImportAllowed(readFixture('backup-v2-current.json')),
    ).toMatchObject({
      inspection: {
        preview: { schemaVersion: 2 },
      },
      kind: 'v2-overwrite',
    })
  })

  it('preserves the typed future-schema rejection', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(readFixture('backup-v2-future.json')),
    )

    expect(error).toMatchObject<Partial<ProductionBackupImportError>>({
      code: 'UNSUPPORTED_FUTURE_SCHEMA',
      currentVersion: 2,
      name: 'ProductionBackupImportError',
      receivedVersion: 3,
    })
  })

  it('rejects malformed current input without exposing the payload', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(
        JSON.stringify({ schemaVersion: 2, privatePayload: 'secret' }),
      ),
    )

    expect(error).toMatchObject<Partial<ProductionBackupImportError>>({
      code: 'INVALID_BACKUP',
      name: 'ProductionBackupImportError',
    })
    expect(JSON.stringify(error)).not.toContain('secret')
  })

  it('rejects malformed JSON with a typed invalid-backup classification', () => {
    expect(() => assertProductionImportAllowed('{malformed-json')).toThrow(
      expect.objectContaining<Partial<ProductionBackupImportError>>({
        code: 'INVALID_BACKUP',
        name: 'ProductionBackupImportError',
      }),
    )
  })

  it('rejects a schema-less legacy backup without parsing or migrating it', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(
        JSON.stringify({
          parentCategories: [],
          privatePayload: 'secret',
          savedTabs: [],
          timestamp: '2026-07-28T00:00:00.000Z',
          userSettings: {},
          version: '1.0.0',
        }),
      ),
    )

    expect(error).toMatchObject<Partial<ProductionBackupImportError>>({
      code: 'UNSUPPORTED_LEGACY_BACKUP',
      name: 'ProductionBackupImportError',
    })
    expect(JSON.stringify(error)).not.toContain('secret')
  })
})
