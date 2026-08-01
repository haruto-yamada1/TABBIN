import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import type {
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/public-api'
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

const indexById = <T extends { readonly id: string }>(
  items: readonly T[],
): Map<string, T> => new Map(items.map((item) => [item.id, item]))

const membershipKey = (
  membership: Pick<PersistenceV2CollectionMembership, 'collectionId' | 'urlId'>,
): string => `${membership.collectionId} ${membership.urlId}`

// Canonicalization only reorders urls / groups / memberships, so every
// restored entity must deep-equal the input entity with the same key.
// Collections and categories get sorted keywords; assert their id sets
// survive so no entity is dropped or invented.
const expectLogicalContentPreserved = (
  input: PersistenceV2Snapshot,
  restored: PersistenceV2Snapshot,
) => {
  const inputUrls = indexById(input.urls)
  expect(restored.urls).toHaveLength(inputUrls.size)
  for (const restoredUrl of restored.urls) {
    expect(restoredUrl).toEqual(inputUrls.get(restoredUrl.id))
  }

  const inputGroups = indexById(input.groups)
  expect(restored.groups).toHaveLength(inputGroups.size)
  for (const restoredGroup of restored.groups) {
    expect(restoredGroup).toEqual(inputGroups.get(restoredGroup.id))
  }

  const inputMemberships = new Map(
    input.memberships.map((membership) => [
      membershipKey(membership),
      membership,
    ]),
  )
  expect(restored.memberships).toHaveLength(inputMemberships.size)
  for (const restoredMembership of restored.memberships) {
    expect(restoredMembership).toEqual(
      inputMemberships.get(membershipKey(restoredMembership)),
    )
  }

  expect(restored.collections.map(({ id }) => id).toSorted()).toEqual(
    input.collections.map(({ id }) => id).toSorted(),
  )
  expect(restored.categories.map(({ id }) => id).toSorted()).toEqual(
    input.categories.map(({ id }) => id).toSorted(),
  )
}

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
          expect(checkPersistenceIntegrity(restored.savedTabs).isHealthy).toBe(
            true,
          )
          expect(JSON.stringify(restored.savedTabs)).toBe(
            JSON.stringify(exported.savedTabs),
          )
          expectLogicalContentPreserved(snapshot.savedTabs, restored.savedTabs)
        },
      ),
      fastCheckParameters,
    )
  })
})
