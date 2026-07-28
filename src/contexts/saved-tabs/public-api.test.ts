import { describe, expect, it } from 'vitest'

import { createHealthyPersistenceV2Snapshot } from './domain/testing/persistenceV2IntegrityFixtures'
import {
  checkPersistenceIntegrity,
  createStorageRepairPlan,
  mapLegacyStorageToPersistenceV2,
} from './public-api'

describe('saved-tabs public persistence integrity API', () => {
  it('exposes the pure audit and repair-plan boundaries', () => {
    const report = checkPersistenceIntegrity(
      createHealthyPersistenceV2Snapshot(),
    )

    expect(report).toStrictEqual({ isHealthy: true, issues: [] })
    expect(createStorageRepairPlan(report)).toStrictEqual({
      destructive: false,
      operations: [],
      unresolvedIssues: [],
    })
    expect(mapLegacyStorageToPersistenceV2).toBeTypeOf('function')
  })
})
