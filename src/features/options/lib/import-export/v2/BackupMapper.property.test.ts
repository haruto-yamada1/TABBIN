import * as fc from 'fast-check'
import { describe, it } from 'vitest'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import { canonicalUserSettings } from '@/test/arbitraries/persistence/backupArbitrary'
import { fastCheckParameters } from '@/test/arbitraries/persistence/fastCheckParameters'
import { validPersistenceV2SnapshotArbitrary } from '@/test/arbitraries/persistence/persistenceSnapshotArbitrary'

import { BackupMapper } from './BackupMapper'

const revisionArbitrary = fc.integer({ min: 0, max: 1_000_000 })

const logicalSnapshotArbitrary = validPersistenceV2SnapshotArbitrary.map(
  (savedTabs) => ({
    analyticsViews: [],
    conversations: [],
    messages: [],
    revision: 0,
    savedTabs,
  }),
)

// Property target from issue #718: Backup V2 round trip preserves the
// canonicalized logical snapshot and its integrity (#713 / #730).
describe('BackupMapper round-trip properties', () => {
  it('import(export(v2)) reaches a canonical fixpoint', () => {
    fc.assert(
      fc.property(
        logicalSnapshotArbitrary,
        revisionArbitrary,
        (snapshot, revision) => {
          const exported = BackupMapper.toBackupData(
            snapshot,
            canonicalUserSettings,
          )
          const restored = BackupMapper.toLogicalSnapshot(exported, revision)
          const reExported = BackupMapper.toBackupData(
            restored,
            canonicalUserSettings,
          )
          return (
            restored.revision === revision &&
            JSON.stringify(reExported) === JSON.stringify(exported)
          )
        },
      ),
      fastCheckParameters,
    )
  })

  it('round trip preserves saved-tabs integrity and logical content', () => {
    fc.assert(
      fc.property(
        logicalSnapshotArbitrary,
        revisionArbitrary,
        (snapshot, revision) => {
          const exported = BackupMapper.toBackupData(
            snapshot,
            canonicalUserSettings,
          )
          const restored = BackupMapper.toLogicalSnapshot(exported, revision)
          return (
            checkPersistenceIntegrity(restored.savedTabs).isHealthy &&
            JSON.stringify(restored.savedTabs) ===
              JSON.stringify(exported.savedTabs)
          )
        },
      ),
      fastCheckParameters,
    )
  })
})
