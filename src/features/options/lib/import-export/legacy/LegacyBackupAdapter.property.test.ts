import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import { BackupDataV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import { legacyBackupV0Arbitrary } from '@/test/arbitraries/persistence/backupArbitrary'
import { fastCheckParameters } from '@/test/arbitraries/persistence/fastCheckParameters'

import { convertLegacyBackup } from './LegacyBackupAdapter'

// #734 cleanup target: this file covers the pre-IndexedDB legacy backup
// importer, whose temporary compatibility scope ends 2026-08-31. Delete
// together with the legacy importer in the #734 cutoff release.
describe('convertLegacyBackup properties (temporary compatibility scope)', () => {
  it('is deterministic for a fixed import date', () => {
    fc.assert(
      fc.property(legacyBackupV0Arbitrary, ({ backup, importDate }) => {
        const first = convertLegacyBackup(backup, importDate)
        const second = convertLegacyBackup(backup, importDate)
        return JSON.stringify(first) === JSON.stringify(second)
      }),
      fastCheckParameters,
    )
  })

  it('converts well-formed legacy backups into valid, healthy Backup V2 data', () => {
    fc.assert(
      fc.property(legacyBackupV0Arbitrary, ({ backup, importDate }) => {
        const conversion = convertLegacyBackup(backup, importDate)
        const parsed = BackupDataV2Schema.safeParse(conversion.data)
        // Report the exact schema / integrity issue instead of a bare
        // counterexample when the property fails.
        expect(parsed.error?.issues ?? []).toEqual([])
        expect(
          checkPersistenceIntegrity(conversion.data.savedTabs).issues,
        ).toEqual([])
      }),
      fastCheckParameters,
    )
  })
})
