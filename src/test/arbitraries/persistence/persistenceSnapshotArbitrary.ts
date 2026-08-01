import * as fc from 'fast-check'

import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2InvariantCode,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/public-api'

import {
  displayTextArbitrary,
  orderedTimestampPairArbitrary,
  sortOrderArbitrary,
  timestampArbitrary,
  urlStringArbitrary,
} from './primitives'

const categorySeedArbitrary = fc.record({
  keywords: fc.array(displayTextArbitrary, { maxLength: 3 }),
  name: displayTextArbitrary,
  sortOrder: sortOrderArbitrary,
  timestamps: orderedTimestampPairArbitrary,
})

const collectionSeedArbitrary = fc.record({
  categories: fc.array(categorySeedArbitrary, { maxLength: 2 }),
  customKeywords: fc.option(
    fc.record({
      domainKeywords: fc.array(displayTextArbitrary, { maxLength: 2 }),
      titleKeywords: fc.array(displayTextArbitrary, { maxLength: 2 }),
      urlKeywords: fc.array(displayTextArbitrary, { maxLength: 2 }),
    }),
    { nil: undefined },
  ),
  groupPick: fc.option(fc.nat({ max: 1 }), { nil: undefined }),
  isDomain: fc.boolean(),
  name: displayTextArbitrary,
  sortOrder: sortOrderArbitrary,
  timestamps: orderedTimestampPairArbitrary,
})

const membershipSeedArbitrary = fc.record({
  note: fc.option(displayTextArbitrary, { nil: undefined }),
  sortOrder: sortOrderArbitrary,
  timestamps: orderedTimestampPairArbitrary,
})

const urlSeedArbitrary = fc.record({
  extraMembership: fc.option(
    fc.record({
      offset: fc.nat({ max: 2 }),
      seed: membershipSeedArbitrary,
    }),
    { nil: undefined },
  ),
  favIconUrl: fc.option(urlStringArbitrary, { nil: undefined }),
  primaryMembership: membershipSeedArbitrary,
  savedTimestamps: orderedTimestampPairArbitrary,
  title: displayTextArbitrary,
  updatedAt: timestampArbitrary,
  url: urlStringArbitrary,
})

type SeedOf<A> = A extends fc.Arbitrary<infer T> ? T : never

type CollectionSeed = SeedOf<typeof collectionSeedArbitrary>
type GroupSeed = {
  readonly name: string
  readonly sortOrder: number
  readonly timestamps: readonly [number, number]
}
type UrlSeed = SeedOf<typeof urlSeedArbitrary>
type MembershipSeed = SeedOf<typeof membershipSeedArbitrary>

const assembleGroups = (
  seeds: readonly GroupSeed[],
): PersistenceV2CollectionGroup[] =>
  seeds.map((seed, index) => ({
    createdAt: seed.timestamps[0],
    id: `group-${index}`,
    name: seed.name,
    sortOrder: seed.sortOrder,
    updatedAt: seed.timestamps[1],
  }))

const assembleCollections = (
  seeds: readonly CollectionSeed[],
  groups: readonly PersistenceV2CollectionGroup[],
): {
  readonly categories: PersistenceV2CollectionCategory[]
  readonly collections: PersistenceV2Collection[]
} => {
  const categories: PersistenceV2CollectionCategory[] = []
  const collections = seeds.map((seed, index): PersistenceV2Collection => {
    const id = `collection-${index}`
    for (const [categoryIndex, category] of seed.categories.entries()) {
      categories.push({
        collectionId: id,
        createdAt: category.timestamps[0],
        id: `${id}-category-${categoryIndex}`,
        keywords: category.keywords,
        name: category.name,
        sortOrder: category.sortOrder,
        updatedAt: category.timestamps[1],
      })
    }
    return {
      createdAt: seed.timestamps[0],
      definition: seed.isDomain
        ? { domain: `domain-${index}.test`, type: 'domain' }
        : {
            projectKeywords: seed.customKeywords ?? {
              domainKeywords: [],
              titleKeywords: [],
              urlKeywords: [],
            },
            type: 'custom',
          },
      ...(seed.groupPick === undefined || groups.length === 0
        ? {}
        : { groupId: groups[seed.groupPick % groups.length].id }),
      id,
      name: seed.name,
      sortOrder: seed.sortOrder,
      updatedAt: seed.timestamps[1],
    }
  })
  return { categories, collections }
}

const assembleUrls = (
  seeds: readonly UrlSeed[],
): readonly PersistenceV2Url[] => {
  const seen = new Set<string>()
  return seeds.map((seed, index) => {
    const url = seen.has(seed.url) ? `${seed.url}#variant-${index}` : seed.url
    seen.add(url)
    return {
      ...(seed.favIconUrl === undefined ? {} : { favIconUrl: seed.favIconUrl }),
      firstSavedAt: seed.savedTimestamps[0],
      id: `url-${index}`,
      lastSavedAt: seed.savedTimestamps[1],
      normalizedUrl: url,
      title: seed.title,
      updatedAt: seed.updatedAt,
      url,
    }
  })
}

const assembleMemberships = (
  seeds: readonly UrlSeed[],
  urls: readonly PersistenceV2Url[],
  collections: readonly PersistenceV2Collection[],
  categories: readonly PersistenceV2CollectionCategory[],
): PersistenceV2CollectionMembership[] => {
  const memberships: PersistenceV2CollectionMembership[] = []
  const buildMembership = (
    seed: MembershipSeed,
    collection: PersistenceV2Collection,
    url: PersistenceV2Url,
    urlIndex: number,
  ): PersistenceV2CollectionMembership => {
    const collectionCategories = categories.filter(
      (category) => category.collectionId === collection.id,
    )
    return {
      addedAt: seed.timestamps[0],
      ...(collectionCategories.length > 0 && urlIndex % 2 === 0
        ? {
            categoryId:
              collectionCategories[urlIndex % collectionCategories.length].id,
          }
        : {}),
      collectionId: collection.id,
      ...(seed.note === undefined ? {} : { notes: seed.note }),
      sortOrder: seed.sortOrder,
      updatedAt: seed.timestamps[1],
      urlId: url.id,
    }
  }

  for (const [index, seed] of seeds.entries()) {
    const url = urls[index]
    const primary = collections[index % collections.length]
    memberships.push(
      buildMembership(seed.primaryMembership, primary, url, index),
    )
    if (seed.extraMembership !== undefined && collections.length > 1) {
      const secondary =
        collections[
          (index +
            1 +
            (seed.extraMembership.offset % (collections.length - 1))) %
            collections.length
        ]
      if (secondary.id !== primary.id) {
        memberships.push(
          buildMembership(seed.extraMembership.seed, secondary, url, index + 1),
        )
      }
    }
  }
  return memberships
}

const assembleSnapshot = (
  groupSeeds: readonly GroupSeed[],
  collectionSeeds: readonly CollectionSeed[],
  urlSeeds: readonly UrlSeed[],
): PersistenceV2Snapshot => {
  const groups = assembleGroups(groupSeeds)
  const { categories, collections } = assembleCollections(
    collectionSeeds,
    groups,
  )
  const urls = assembleUrls(urlSeeds)
  const memberships = assembleMemberships(urlSeeds, urls, collections, [
    ...categories,
  ])
  return { categories, collections, groups, memberships, urls }
}

const groupSeedArbitrary = fc.record({
  name: displayTextArbitrary,
  sortOrder: sortOrderArbitrary,
  timestamps: orderedTimestampPairArbitrary,
})

/**
 * Generates snapshots satisfying every Persistence Model v2 invariant:
 * unique URL id / normalized URL, unique `[collectionId, urlId]`
 * memberships, same-collection category references, existing group
 * references, safe-integer ranks, and ordered timestamps. Every Url is
 * referenced by at least one membership so no orphan warning appears.
 */
export const validPersistenceV2SnapshotArbitrary = fc
  .tuple(
    fc.array(groupSeedArbitrary, { maxLength: 2 }),
    fc.array(collectionSeedArbitrary, { minLength: 1, maxLength: 3 }),
    fc.array(urlSeedArbitrary, { minLength: 1, maxLength: 6 }),
  )
  .map(([groups, collections, urls]) =>
    assembleSnapshot(groups, collections, urls),
  )

export type SnapshotCorruption = {
  readonly apply: (snapshot: PersistenceV2Snapshot) => PersistenceV2Snapshot
  readonly codes: readonly PersistenceV2InvariantCode[]
  readonly isApplicable: (snapshot: PersistenceV2Snapshot) => boolean
  readonly name: string
}

const UNSAFE_RANK = Number.MAX_SAFE_INTEGER + 1

const withFirstUrl = (
  snapshot: PersistenceV2Snapshot,
  update: (url: PersistenceV2Url) => PersistenceV2Url,
): PersistenceV2Snapshot => ({
  ...snapshot,
  urls: snapshot.urls.map((url, index) => (index === 0 ? update(url) : url)),
})

const withFirstMembership = (
  snapshot: PersistenceV2Snapshot,
  update: (
    membership: PersistenceV2CollectionMembership,
  ) => PersistenceV2CollectionMembership,
): PersistenceV2Snapshot => ({
  ...snapshot,
  memberships: snapshot.memberships.map((membership, index) =>
    index === 0 ? update(membership) : membership,
  ),
})

const withFirstCollection = (
  snapshot: PersistenceV2Snapshot,
  update: (collection: PersistenceV2Collection) => PersistenceV2Collection,
): PersistenceV2Snapshot => ({
  ...snapshot,
  collections: snapshot.collections.map((collection, index) =>
    index === 0 ? update(collection) : collection,
  ),
})

const DUPLICATE_MEMBERSHIP_CORRUPTION: SnapshotCorruption = {
  apply: (snapshot) => ({
    ...snapshot,
    memberships: [...snapshot.memberships, snapshot.memberships[0]],
  }),
  codes: ['DUPLICATE_MEMBERSHIP'],
  isApplicable: (snapshot) => snapshot.memberships.length > 0,
  name: 'duplicate-membership',
}

/** Malformed / corrupted snapshot mutations and the issue codes they induce. */
export const SNAPSHOT_CORRUPTIONS: readonly SnapshotCorruption[] = [
  {
    apply: (snapshot) => {
      const [first] = snapshot.urls
      return {
        ...snapshot,
        urls: [
          ...snapshot.urls,
          {
            ...first,
            normalizedUrl: `https://duplicate-id-${snapshot.urls.length}.invalid/`,
            url: `https://duplicate-id-${snapshot.urls.length}.invalid/`,
          },
        ],
      }
    },
    codes: ['DUPLICATE_URL_ID'],
    isApplicable: (snapshot) => snapshot.urls.length > 0,
    name: 'duplicate-url-id',
  },
  {
    apply: (snapshot) => {
      const [first] = snapshot.urls
      return {
        ...snapshot,
        urls: [...snapshot.urls, { ...first, id: 'url-duplicate-normalized' }],
      }
    },
    codes: ['DUPLICATE_NORMALIZED_URL'],
    isApplicable: (snapshot) => snapshot.urls.length > 0,
    name: 'duplicate-normalized-url',
  },
  {
    apply: (snapshot) => ({
      ...snapshot,
      memberships: [
        ...snapshot.memberships,
        {
          addedAt: 0,
          collectionId: snapshot.collections[0].id,
          sortOrder: 0,
          updatedAt: 0,
          urlId: 'url-missing',
        },
      ],
    }),
    codes: ['URL_MISSING'],
    isApplicable: (snapshot) => snapshot.collections.length > 0,
    name: 'dangling-membership-url',
  },
  {
    apply: (snapshot) => ({
      ...snapshot,
      memberships: [
        ...snapshot.memberships,
        {
          addedAt: 0,
          collectionId: 'collection-missing',
          sortOrder: 0,
          updatedAt: 0,
          urlId: snapshot.urls[0].id,
        },
      ],
    }),
    codes: ['COLLECTION_MISSING'],
    isApplicable: (snapshot) => snapshot.urls.length > 0,
    name: 'dangling-membership-collection',
  },
  {
    apply: (snapshot) =>
      withFirstMembership(snapshot, (membership) => ({
        ...membership,
        categoryId: 'category-missing',
      })),
    codes: ['CATEGORY_MISSING'],
    isApplicable: (snapshot) => snapshot.memberships.length > 0,
    name: 'dangling-membership-category',
  },
  {
    apply: (snapshot) => {
      const category = snapshot.categories[0]
      const foreignCollection = snapshot.collections.find(
        (collection) => collection.id !== category.collectionId,
      )
      const url: PersistenceV2Url = {
        firstSavedAt: 0,
        id: 'url-cross-category',
        lastSavedAt: 0,
        normalizedUrl: 'https://cross-category.invalid/',
        title: 'cross category',
        updatedAt: 0,
        url: 'https://cross-category.invalid/',
      }
      return {
        ...snapshot,
        memberships: [
          ...snapshot.memberships,
          {
            addedAt: 0,
            categoryId: category.id,
            collectionId: foreignCollection?.id ?? 'collection-missing',
            sortOrder: 0,
            updatedAt: 0,
            urlId: url.id,
          },
        ],
        urls: [...snapshot.urls, url],
      }
    },
    codes: ['CATEGORY_COLLECTION_MISMATCH'],
    isApplicable: (snapshot) =>
      snapshot.categories.length > 0 &&
      snapshot.collections.some(
        (collection) => collection.id !== snapshot.categories[0].collectionId,
      ),
    name: 'cross-collection-category',
  },
  {
    apply: (snapshot) =>
      withFirstCollection(snapshot, (collection) => ({
        ...collection,
        groupId: 'group-missing',
      })),
    codes: ['GROUP_MISSING'],
    isApplicable: (snapshot) => snapshot.collections.length > 0,
    name: 'missing-group-target',
  },
  DUPLICATE_MEMBERSHIP_CORRUPTION,
  {
    apply: (snapshot) =>
      withFirstMembership(snapshot, (membership) => ({
        ...membership,
        sortOrder: UNSAFE_RANK,
      })),
    codes: ['INVALID_MEMBERSHIP_ORDER'],
    isApplicable: (snapshot) => snapshot.memberships.length > 0,
    name: 'invalid-membership-order',
  },
  {
    apply: (snapshot) =>
      withFirstUrl(snapshot, (url) => ({
        ...url,
        firstSavedAt: url.lastSavedAt + 1,
      })),
    codes: ['INVALID_TIMESTAMP_RELATION'],
    isApplicable: (snapshot) => snapshot.urls.length > 0,
    name: 'invalid-timestamp-relation',
  },
]

export type CorruptedSnapshot = {
  readonly corruptionNames: readonly string[]
  readonly expectedCodes: readonly PersistenceV2InvariantCode[]
  readonly snapshot: PersistenceV2Snapshot
}

const applyCorruptions = (
  snapshot: PersistenceV2Snapshot,
  corruptions: readonly SnapshotCorruption[],
): CorruptedSnapshot => {
  const expected = new Set<PersistenceV2InvariantCode>()
  let current = snapshot
  for (const corruption of corruptions) {
    current = corruption.apply(current)
    for (const code of corruption.codes) {
      expected.add(code)
    }
  }
  return {
    corruptionNames: corruptions.map(({ name }) => name),
    expectedCodes: [...expected],
    snapshot: current,
  }
}

/**
 * Valid snapshot mutated by 1-3 distinct corruptions. The integrity
 * checker must detect at least `expectedCodes`; cascading secondary
 * issues are allowed and asserted as a superset.
 */
export const corruptedPersistenceV2SnapshotArbitrary =
  validPersistenceV2SnapshotArbitrary.chain((snapshot) => {
    const applicable = SNAPSHOT_CORRUPTIONS.filter((corruption) =>
      corruption.isApplicable(snapshot),
    )
    return fc
      .uniqueArray(fc.constantFrom(...applicable), {
        minLength: 1,
        maxLength: Math.min(3, applicable.length),
        selector: (corruption) => corruption.name,
      })
      .map((corruptions) => applyCorruptions(snapshot, corruptions))
  })

/** Valid snapshot corrupted only by duplicate memberships (repair-safe). */
export const duplicateMembershipCorruptedSnapshotArbitrary =
  validPersistenceV2SnapshotArbitrary.chain((snapshot) =>
    fc.integer({ min: 1, max: 2 }).map((count) =>
      applyCorruptions(
        snapshot,
        Array.from({ length: count }, () => DUPLICATE_MEMBERSHIP_CORRUPTION),
      ),
    ),
  )
