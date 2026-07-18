import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readRepositoryFile = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

describe('IndexedDB persistence architecture policy', () => {
  it('application ports do not expose IndexedDB API types', () => {
    const ports = [
      'src/contexts/saved-tabs/application/ports/PersistenceV2QueryPort.ts',
      'src/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort.ts',
      'src/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort.ts',
    ].map(readRepositoryFile)

    for (const port of ports) {
      expect(port).not.toMatch(
        /\bIDB(?:Database|ObjectStore|Request|Transaction)/,
      )
    }
  })

  it('normalizedUrl index remains non-unique until migration preflight proves it', () => {
    const schema = readRepositoryFile(
      'src/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema.ts',
    )
    const normalizedUrlIndex = /createIndex\('normalizedUrl'[\s\S]*?\)/.exec(
      schema,
    )

    expect(normalizedUrlIndex?.[0]).toBe(
      "createIndex('normalizedUrl', 'normalizedUrl')",
    )
  })

  it('documents store, transaction, snapshot, durability, and benchmark decisions', () => {
    const document = readRepositoryFile(
      'docs/architecture/indexeddb-persistence.md',
    )

    for (const requiredContract of [
      'collectionMemberships',
      'recoverySnapshots',
      'PERSISTENCE_DATABASE_VERSION = 1',
      'IndexedDbExternalAsyncTransactionError',
      'PersistenceCommitResult',
      'PersistenceSnapshotIntegrityError',
      'Chromium',
      'Firefox',
      'resumable migration plan',
    ]) {
      expect(document).toContain(requiredContract)
    }
  })
})
