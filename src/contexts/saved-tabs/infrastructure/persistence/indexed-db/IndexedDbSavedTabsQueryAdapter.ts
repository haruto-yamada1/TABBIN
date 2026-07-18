import type {
  PersistenceV2AnalyticsRecord,
  PersistenceV2CollectionItemProjection,
  PersistenceV2CollectionProjection,
  PersistenceV2InitialProjection,
  PersistenceV2QueryPort,
  PersistenceV2UrlCollectionProjection,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2QueryPort'
import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type {
  PersistenceV2Collection,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

export class PersistenceProjectionIntegrityError extends Error {
  constructor(entity: 'category' | 'collection' | 'url', id: string) {
    super(`Persistence projection references missing ${entity} ${id}.`)
    this.name = 'PersistenceProjectionIntegrityError'
  }
}

const byOrderThenId = <Value extends { id: string; sortOrder: number }>(
  left: Value,
  right: Value,
): number => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)

type ProjectionIndex = {
  readonly categoriesById: ReadonlyMap<
    string,
    PersistenceV2Snapshot['categories'][number]
  >
  readonly membershipsByCollection: ReadonlyMap<
    string,
    readonly PersistenceV2Snapshot['memberships'][number][]
  >
  readonly urlsById: ReadonlyMap<string, PersistenceV2Snapshot['urls'][number]>
}

const indexSnapshot = (snapshot: PersistenceV2Snapshot): ProjectionIndex => {
  const membershipsByCollection = new Map<
    string,
    PersistenceV2Snapshot['memberships'][number][]
  >()
  for (const membership of snapshot.memberships) {
    const memberships =
      membershipsByCollection.get(membership.collectionId) ?? []
    memberships.push(membership)
    membershipsByCollection.set(membership.collectionId, memberships)
  }

  return {
    categoriesById: new Map(
      snapshot.categories.map((category) => [category.id, category]),
    ),
    membershipsByCollection,
    urlsById: new Map(snapshot.urls.map((url) => [url.id, url])),
  }
}

const projectCollection = (
  index: ProjectionIndex,
  collection: PersistenceV2Collection,
): PersistenceV2CollectionProjection => {
  const items = (index.membershipsByCollection.get(collection.id) ?? [])
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.urlId.localeCompare(right.urlId),
    )
    .map((membership): PersistenceV2CollectionItemProjection => {
      const url = index.urlsById.get(membership.urlId)
      if (!url) {
        throw new PersistenceProjectionIntegrityError('url', membership.urlId)
      }
      const category = membership.categoryId
        ? index.categoriesById.get(membership.categoryId)
        : undefined
      if (membership.categoryId && !category) {
        throw new PersistenceProjectionIntegrityError(
          'category',
          membership.categoryId,
        )
      }

      return { category, membership, url }
    })

  return { collection, items }
}

export class IndexedDbSavedTabsQueryAdapter implements PersistenceV2QueryPort {
  private readonly snapshotReader: PersistenceV2SnapshotReaderPort

  constructor(snapshotReader: PersistenceV2SnapshotReaderPort) {
    this.snapshotReader = snapshotReader
  }

  async findCollection(
    collectionId: string,
  ): Promise<PersistenceV2CollectionProjection | undefined> {
    const snapshot = await this.snapshotReader.readVerifiedSavedTabsSnapshot()
    const collection = snapshot.collections.find(
      ({ id }) => id === collectionId,
    )

    return collection
      ? projectCollection(indexSnapshot(snapshot), collection)
      : undefined
  }

  async readInitialLoad(): Promise<PersistenceV2InitialProjection> {
    const snapshot = await this.snapshotReader.readVerifiedSavedTabsSnapshot()
    const index = indexSnapshot(snapshot)

    return {
      collections: snapshot.collections
        .toSorted(byOrderThenId)
        .map((collection) => projectCollection(index, collection)),
      groups: snapshot.groups.toSorted(byOrderThenId),
    }
  }

  async findCollectionsInGroup(
    groupId: string,
  ): Promise<readonly PersistenceV2Collection[]> {
    const snapshot = await this.snapshotReader.readVerifiedSavedTabsSnapshot()

    return snapshot.collections
      .filter((collection) => collection.groupId === groupId)
      .toSorted(byOrderThenId)
  }

  async findCollectionsForUrl(
    urlId: string,
  ): Promise<readonly PersistenceV2UrlCollectionProjection[]> {
    const snapshot = await this.snapshotReader.readVerifiedSavedTabsSnapshot()
    const collections = new Map(
      snapshot.collections.map((collection) => [collection.id, collection]),
    )
    const projections: PersistenceV2UrlCollectionProjection[] = []

    for (const membership of snapshot.memberships) {
      if (membership.urlId !== urlId) {
        continue
      }

      const collection = collections.get(membership.collectionId)
      if (!collection) {
        throw new PersistenceProjectionIntegrityError(
          'collection',
          membership.collectionId,
        )
      }

      projections.push({ collection, membership })
    }

    return projections.toSorted((left, right) =>
      byOrderThenId(left.collection, right.collection),
    )
  }

  async readAnalyticsRecords(): Promise<
    readonly PersistenceV2AnalyticsRecord[]
  > {
    const snapshot = await this.snapshotReader.readVerifiedSavedTabsSnapshot()
    const collectionIdsByUrl = new Map<string, Set<string>>()
    const membershipCountsByUrl = new Map<string, number>()
    for (const membership of snapshot.memberships) {
      const collectionIds =
        collectionIdsByUrl.get(membership.urlId) ?? new Set()
      collectionIds.add(membership.collectionId)
      collectionIdsByUrl.set(membership.urlId, collectionIds)
      membershipCountsByUrl.set(
        membership.urlId,
        (membershipCountsByUrl.get(membership.urlId) ?? 0) + 1,
      )
    }

    return snapshot.urls.map((url) => ({
      collectionCount: collectionIdsByUrl.get(url.id)?.size ?? 0,
      membershipCount: membershipCountsByUrl.get(url.id) ?? 0,
      url,
    }))
  }
}
