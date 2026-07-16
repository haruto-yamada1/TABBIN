import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PERSISTENCE_V2_INVARIANT_CODES,
  PERSISTENCE_V2_ORDERING_POLICY,
} from './PersistenceModelV2'
import type {
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
} from './PersistenceModelV2'

describe('Persistence Model v2 contract', () => {
  it('uses composite Collection / Url membership identity', () => {
    const membership = {
      addedAt: 1,
      collectionId: 'collection-1',
      sortOrder: 1024,
      updatedAt: 1,
      urlId: 'url-1',
    } satisfies PersistenceV2CollectionMembership

    expect(membership).toStrictEqual({
      addedAt: 1,
      collectionId: 'collection-1',
      sortOrder: 1024,
      updatedAt: 1,
      urlId: 'url-1',
    })
    expectTypeOf<PersistenceV2Snapshot['memberships']>().toEqualTypeOf<
      readonly PersistenceV2CollectionMembership[]
    >()
  })

  it('defines non-contiguous gap ordering with a stable tie-break', () => {
    expect(PERSISTENCE_V2_ORDERING_POLICY).toStrictEqual({
      initialGap: 1024,
      ranksMustBeContiguous: false,
      rebalanceScope: 'local-window',
      tieBreak: {
        category: 'id',
        collection: 'id',
        group: 'id',
        membership: ['collectionId', 'urlId'],
      },
    })
  })

  it('exposes the invariant input required by Issue #712', () => {
    expect(PERSISTENCE_V2_INVARIANT_CODES).toEqual(
      expect.arrayContaining([
        'DUPLICATE_NORMALIZED_URL',
        'URL_IDENTITY_COLLISION',
        'COLLECTION_MISSING',
        'URL_MISSING',
        'CATEGORY_COLLECTION_MISMATCH',
        'GROUP_MISSING',
        'DUPLICATE_MEMBERSHIP',
        'DUPLICATE_DOMAIN_COLLECTION',
        'INVALID_TIMESTAMP_RELATION',
        'MISSING_TIMESTAMP_PROVENANCE',
        'NON_JSON_SAFE_VALUE',
      ]),
    )
  })
})
