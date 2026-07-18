import type {
  PersistenceLogicalSnapshot,
  PersistenceV2SnapshotReaderPort,
  PersistenceVersionedSavedTabsSnapshot,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import type { StorageIntegrityReport } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

import type { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { waitForIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'
import {
  decodePersistenceRecords,
  isPersistenceJsonRecord,
  isPersistenceMessageRecord,
  isPersistenceV2Category,
  isPersistenceV2Collection,
  isPersistenceV2Group,
  isPersistenceV2Membership,
  isPersistenceV2Url,
  readIndexedDbRequestResult,
} from './PersistenceRecordDecoders'
import { decodePersistenceRevision } from './PersistenceRevision'

const SAVED_TABS_STORE_NAMES = [
  PERSISTENCE_STORE_NAMES.urls,
  PERSISTENCE_STORE_NAMES.collections,
  PERSISTENCE_STORE_NAMES.memberships,
  PERSISTENCE_STORE_NAMES.categories,
  PERSISTENCE_STORE_NAMES.groups,
  PERSISTENCE_STORE_NAMES.metadata,
] as const

const BACKUP_SOURCE_STORE_NAMES = [
  ...SAVED_TABS_STORE_NAMES,
  PERSISTENCE_STORE_NAMES.conversations,
  PERSISTENCE_STORE_NAMES.messages,
  PERSISTENCE_STORE_NAMES.analyticsViews,
] as const

const queueSavedTabsRequests = (transaction: IDBTransaction) => ({
  categories: transaction
    .objectStore(PERSISTENCE_STORE_NAMES.categories)
    .getAll(),
  collections: transaction
    .objectStore(PERSISTENCE_STORE_NAMES.collections)
    .getAll(),
  groups: transaction.objectStore(PERSISTENCE_STORE_NAMES.groups).getAll(),
  memberships: transaction
    .objectStore(PERSISTENCE_STORE_NAMES.memberships)
    .getAll(),
  revision: transaction
    .objectStore(PERSISTENCE_STORE_NAMES.metadata)
    .get('revision'),
  urls: transaction.objectStore(PERSISTENCE_STORE_NAMES.urls).getAll(),
})

const materializeSavedTabsSnapshot = (
  requests: ReturnType<typeof queueSavedTabsRequests>,
): PersistenceV2Snapshot => ({
  categories: decodePersistenceRecords(
    readIndexedDbRequestResult(requests.categories),
    isPersistenceV2Category,
    PERSISTENCE_STORE_NAMES.categories,
  ),
  collections: decodePersistenceRecords(
    readIndexedDbRequestResult(requests.collections),
    isPersistenceV2Collection,
    PERSISTENCE_STORE_NAMES.collections,
  ),
  groups: decodePersistenceRecords(
    readIndexedDbRequestResult(requests.groups),
    isPersistenceV2Group,
    PERSISTENCE_STORE_NAMES.groups,
  ),
  memberships: decodePersistenceRecords(
    readIndexedDbRequestResult(requests.memberships),
    isPersistenceV2Membership,
    PERSISTENCE_STORE_NAMES.memberships,
  ),
  urls: decodePersistenceRecords(
    readIndexedDbRequestResult(requests.urls),
    isPersistenceV2Url,
    PERSISTENCE_STORE_NAMES.urls,
  ),
})

const readSavedTabsSnapshot = async (
  database: IDBDatabase,
): Promise<PersistenceVersionedSavedTabsSnapshot> => {
  const transaction = database.transaction(SAVED_TABS_STORE_NAMES, 'readonly')
  const requests = queueSavedTabsRequests(transaction)
  await waitForIndexedDbTransaction(transaction)

  return {
    revision: decodePersistenceRevision(
      readIndexedDbRequestResult(requests.revision),
    ),
    savedTabs: verifySavedTabsSnapshot(materializeSavedTabsSnapshot(requests)),
  }
}

export class PersistenceSnapshotIntegrityError extends Error {
  readonly report: StorageIntegrityReport

  constructor(report: StorageIntegrityReport) {
    super(
      `Persistence snapshot failed integrity validation with ${report.issues.length} issue(s).`,
    )
    this.report = report
    this.name = 'PersistenceSnapshotIntegrityError'
  }
}

const verifySavedTabsSnapshot = (
  snapshot: PersistenceV2Snapshot,
): PersistenceV2Snapshot => {
  const report = checkPersistenceIntegrity(snapshot)
  if (!report.isHealthy) {
    throw new PersistenceSnapshotIntegrityError(report)
  }

  return snapshot
}

export class IndexedDbPersistenceSnapshotReader implements PersistenceV2SnapshotReaderPort {
  private readonly connectionManager: IndexedDbConnectionManager

  constructor(connectionManager: IndexedDbConnectionManager) {
    this.connectionManager = connectionManager
  }

  async readConsistentSnapshot(): Promise<PersistenceLogicalSnapshot> {
    const database = await this.connectionManager.open()
    const transaction = database.transaction(
      BACKUP_SOURCE_STORE_NAMES,
      'readonly',
    )
    const savedTabsRequests = queueSavedTabsRequests(transaction)
    const conversations = transaction
      .objectStore(PERSISTENCE_STORE_NAMES.conversations)
      .getAll()
    const messages = transaction
      .objectStore(PERSISTENCE_STORE_NAMES.messages)
      .getAll()
    const analyticsViews = transaction
      .objectStore(PERSISTENCE_STORE_NAMES.analyticsViews)
      .getAll()
    await waitForIndexedDbTransaction(transaction)
    const savedTabs = verifySavedTabsSnapshot(
      materializeSavedTabsSnapshot(savedTabsRequests),
    )

    return {
      analyticsViews: decodePersistenceRecords(
        readIndexedDbRequestResult(analyticsViews),
        isPersistenceJsonRecord,
        PERSISTENCE_STORE_NAMES.analyticsViews,
      ),
      conversations: decodePersistenceRecords(
        readIndexedDbRequestResult(conversations),
        isPersistenceJsonRecord,
        PERSISTENCE_STORE_NAMES.conversations,
      ),
      messages: decodePersistenceRecords(
        readIndexedDbRequestResult(messages),
        isPersistenceMessageRecord,
        PERSISTENCE_STORE_NAMES.messages,
      ),
      revision: decodePersistenceRevision(
        readIndexedDbRequestResult(savedTabsRequests.revision),
      ),
      savedTabs,
    }
  }

  async readVerifiedSavedTabsSnapshot(): Promise<PersistenceVersionedSavedTabsSnapshot> {
    const database = await this.connectionManager.open()
    return readSavedTabsSnapshot(database)
  }
}
