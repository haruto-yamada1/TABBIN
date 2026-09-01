import { describe, expect, it } from 'vitest'

import {
  decodePersistenceReleaseContract,
  verifyPersistenceRollbackCompatibility,
} from './verify-persistence-release-compatibility.ts'
import type { PersistenceReleaseArtifact } from './verify-persistence-release-compatibility.ts'

const createArtifact = (
  overrides: Partial<PersistenceReleaseArtifact> = {},
): PersistenceReleaseArtifact => ({
  appVersion: '2.0.16',
  databaseVersion: 1,
  minimumCompatibleAppVersion: '2.0.16',
  persistenceGeneration: 2,
  rollbackCompatibility: {
    databaseDowngradeCompatible: true,
    destructiveSchemaChange: false,
    queryWriteContractCompatible: true,
  },
  ...overrides,
})

describe('persistence release compatibility verifier', () => {
  it('allows an older v2 artifact when every rollback contract remains compatible', () => {
    const deployed = createArtifact()
    const candidate = createArtifact({ appVersion: '2.0.16' })

    expect(
      verifyPersistenceRollbackCompatibility({ candidate, deployed }),
    ).toEqual({
      candidateAppVersion: '2.0.16',
      deployedAppVersion: '2.0.16',
      persistenceGeneration: 2,
    })
  })

  it('rejects a pre-IDB or otherwise incompatible persistence generation', () => {
    expect(() =>
      verifyPersistenceRollbackCompatibility({
        candidate: createArtifact({ persistenceGeneration: 1 }),
        deployed: createArtifact(),
      }),
    ).toThrow(/persistence generation/i)
  })

  it('rejects an IndexedDB database version mismatch', () => {
    expect(() =>
      verifyPersistenceRollbackCompatibility({
        candidate: createArtifact({ appVersion: '2.0.16', databaseVersion: 2 }),
        deployed: createArtifact(),
      }),
    ).toThrow(/database version/i)
  })

  it('rejects rollback after a destructive schema change', () => {
    expect(() =>
      verifyPersistenceRollbackCompatibility({
        candidate: createArtifact({ appVersion: '2.0.16' }),
        deployed: createArtifact({
          rollbackCompatibility: {
            databaseDowngradeCompatible: false,
            destructiveSchemaChange: true,
            queryWriteContractCompatible: false,
          },
        }),
      }),
    ).toThrow(/destructive schema change/i)
  })

  it('rejects a query/write contract incompatibility', () => {
    expect(() =>
      verifyPersistenceRollbackCompatibility({
        candidate: createArtifact({ appVersion: '2.0.16' }),
        deployed: createArtifact({
          rollbackCompatibility: {
            databaseDowngradeCompatible: true,
            destructiveSchemaChange: false,
            queryWriteContractCompatible: false,
          },
        }),
      }),
    ).toThrow(/query\/write contract/i)
  })

  it('fails closed when artifact metadata is absent or malformed', () => {
    expect(() => decodePersistenceReleaseContract(undefined)).toThrow(
      /metadata/i,
    )
    expect(() =>
      decodePersistenceReleaseContract({
        databaseVersion: 1,
        minimumCompatibleAppVersion: 'invalid',
        persistenceGeneration: 2,
        rollbackCompatibility: {
          databaseDowngradeCompatible: true,
          destructiveSchemaChange: false,
          queryWriteContractCompatible: true,
        },
      }),
    ).toThrow(/app version/i)
  })
})
