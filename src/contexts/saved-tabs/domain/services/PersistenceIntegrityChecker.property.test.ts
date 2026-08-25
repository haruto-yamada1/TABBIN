import * as fc from 'fast-check'
import { describe, it } from 'vitest'

import { fastCheckParameters } from '@/test/arbitraries/persistence/fastCheckParameters'
import {
  corruptedPersistenceV2SnapshotArbitrary,
  validPersistenceV2SnapshotArbitrary,
} from '@/test/arbitraries/persistence/persistenceSnapshotArbitrary'

import { checkPersistenceIntegrity } from './PersistenceIntegrityChecker'

// Property targets from issue #718: checker determinism and corruption
// detection for the #712 integrity checker.
describe('checkPersistenceIntegrity properties', () => {
  it('generated valid snapshots are healthy', () => {
    fc.assert(
      fc.property(validPersistenceV2SnapshotArbitrary, (snapshot) => {
        const report = checkPersistenceIntegrity(snapshot)
        return report.isHealthy && report.issues.length === 0
      }),
      fastCheckParameters,
    )
  })

  it('is deterministic for valid and corrupted snapshots', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          validPersistenceV2SnapshotArbitrary,
          corruptedPersistenceV2SnapshotArbitrary.map(
            ({ snapshot }) => snapshot,
          ),
        ),
        (snapshot) => {
          const first = checkPersistenceIntegrity(snapshot)
          const second = checkPersistenceIntegrity(snapshot)
          return JSON.stringify(first) === JSON.stringify(second)
        },
      ),
      fastCheckParameters,
    )
  })

  it('detects every induced corruption code', () => {
    fc.assert(
      fc.property(
        corruptedPersistenceV2SnapshotArbitrary,
        ({ expectedCodes, snapshot }) => {
          const report = checkPersistenceIntegrity(snapshot)
          const detected = new Set(report.issues.map((issue) => issue.code))
          return (
            !report.isHealthy &&
            expectedCodes.every((code) => detected.has(code))
          )
        },
      ),
      fastCheckParameters,
    )
  })
})
