import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { BackupSchemaError } from '@/lib/persistence/backupSchema'

import type { LegacyBackupImportError } from './legacy/LegacyBackupAdapter'
import { assertProductionImportAllowed } from './productionImportGate'
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
  it('strictly validates current V2 and blocks overwrite until #740 exists', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(readFixture('backup-v2-current.json'), {
        importDate: '2026-07-28',
        importMode: 'merge',
      }),
    )

    expect(error).toMatchObject<Partial<ProductionBackupImportError>>({
      code: 'OVERWRITE_RECOVERY_UNAVAILABLE',
      name: 'ProductionBackupImportError',
    })
    expect(JSON.stringify(error)).not.toContain('userSettings')
  })

  it('preserves the typed future-schema rejection', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(readFixture('backup-v2-future.json'), {
        importDate: '2026-07-28',
        importMode: 'overwrite',
      }),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'UNSUPPORTED_FUTURE_SCHEMA',
      currentVersion: 2,
      name: 'BackupSchemaError',
      receivedVersion: 3,
    })
  })

  it('rejects malformed versioned input before legacy handling', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(
        JSON.stringify({ schemaVersion: 2, privatePayload: 'secret' }),
        { importDate: '2026-07-28', importMode: 'overwrite' },
      ),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
    expect(JSON.stringify(error)).not.toContain('secret')
  })

  it('rejects malformed legacy-shaped input before compatibility parsing', () => {
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
        { importDate: '2026-08-31', importMode: 'merge' },
      ),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
    expect(JSON.stringify(error)).not.toContain('secret')
  })

  it('allows legacy through the last date and rejects it at the cutoff', () => {
    const legacy = readFixture('legacy-tab-group-url-ids.json')

    const allowed = assertProductionImportAllowed(legacy, {
      importDate: '2026-08-31',
      importMode: 'merge',
    })
    expect(allowed).toMatchObject({
      inspection: {
        preview: { formatKind: 'legacy' },
      },
      kind: 'legacy-merge',
      serializedBytes: new TextEncoder().encode(legacy).byteLength,
      userSettingsPatch: expect.any(Object),
    })

    const error = captureError(() =>
      assertProductionImportAllowed(legacy, {
        importDate: '2026-09-01',
        importMode: 'merge',
      }),
    )
    expect(error).toMatchObject<Partial<LegacyBackupImportError>>({
      code: 'LEGACY_IMPORT_CUTOFF_REACHED',
      name: 'LegacyBackupImportError',
    })
  })

  it('blocks a supported legacy overwrite until #740 is available', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(
        readFixture('legacy-tab-group-url-ids.json'),
        {
          importDate: '2026-08-31',
          importMode: 'overwrite',
        },
      ),
    )

    expect(error).toMatchObject<Partial<ProductionBackupImportError>>({
      code: 'OVERWRITE_RECOVERY_UNAVAILABLE',
      name: 'ProductionBackupImportError',
    })
    expect(JSON.stringify(error)).not.toContain('urls')
  })

  it('does not accept an omitted import date', () => {
    const legacy = readFixture('legacy-tab-group-url-ids.json')
    const callWithoutDate = assertProductionImportAllowed as (
      input: string,
    ) => void

    expect(() => callWithoutDate(legacy)).toThrow('Import date is required')
  })

  it('leaves malformed JSON to the existing legacy format-error path', () => {
    expect(() =>
      assertProductionImportAllowed('{malformed-json', {
        importDate: '2026-07-28',
        importMode: 'overwrite',
      }),
    ).not.toThrow()
  })
})
