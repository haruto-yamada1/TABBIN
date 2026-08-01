import * as fc from 'fast-check'
import { describe, it } from 'vitest'

import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { fastCheckParameters } from '@/test/arbitraries/persistence/fastCheckParameters'
import {
  corruptedPersistenceV2SnapshotArbitrary,
  duplicateMembershipCorruptedSnapshotArbitrary,
} from '@/test/arbitraries/persistence/persistenceSnapshotArbitrary'

import { checkPersistenceIntegrity } from './PersistenceIntegrityChecker'
import type { StorageRepairOperation } from './PersistenceRepairPlanner'
import { createStorageRepairPlan } from './PersistenceRepairPlanner'

/**
 * Test-local executor for the pure repair plan. Production keeps plan
 * execution caller-owned; here it validates the repair fixpoint.
 */
const applyRemoveDuplicateMembership = (
  snapshot: PersistenceV2Snapshot,
  operation: Extract<
    StorageRepairOperation,
    { type: 'REMOVE_DUPLICATE_MEMBERSHIP' }
  >,
): PersistenceV2Snapshot => {
  let keptFirst = false
  let removed = 0
  const memberships = snapshot.memberships.filter((membership) => {
    if (
      membership.collectionId !== operation.collectionId ||
      membership.urlId !== operation.urlId
    ) {
      return true
    }
    if (!keptFirst) {
      keptFirst = true
      return true
    }
    if (removed < operation.removeCount) {
      removed += 1
      return false
    }
    return true
  })
  return { ...snapshot, memberships }
}

describe('createStorageRepairPlan properties', () => {
  it('is deterministic for arbitrary integrity reports', () => {
    fc.assert(
      fc.property(corruptedPersistenceV2SnapshotArbitrary, ({ snapshot }) => {
        const report = checkPersistenceIntegrity(snapshot)
        const first = createStorageRepairPlan(report)
        const second = createStorageRepairPlan(report)
        return JSON.stringify(first) === JSON.stringify(second)
      }),
      fastCheckParameters,
    )
  })

  it('safe repair reaches a duplicate-free fixpoint (repair(repair(x)) === repair(x))', () => {
    fc.assert(
      fc.property(
        duplicateMembershipCorruptedSnapshotArbitrary,
        ({ snapshot }) => {
          const plan = createStorageRepairPlan(
            checkPersistenceIntegrity(snapshot),
          )
          const repaired = plan.operations.reduce(
            (current, operation) =>
              operation.type === 'REMOVE_DUPLICATE_MEMBERSHIP'
                ? applyRemoveDuplicateMembership(current, operation)
                : current,
            snapshot,
          )
          const afterReport = checkPersistenceIntegrity(repaired)
          const replan = createStorageRepairPlan(afterReport)
          return (
            plan.operations.every(
              (operation) => operation.type === 'REMOVE_DUPLICATE_MEMBERSHIP',
            ) &&
            !afterReport.issues.some(
              (issue) => issue.code === 'DUPLICATE_MEMBERSHIP',
            ) &&
            replan.operations.length === 0
          )
        },
      ),
      fastCheckParameters,
    )
  })
})
