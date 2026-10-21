import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

// Independent exact-url-v1 corpus: serialization-equivalent source strings
// still have distinct identities. The domain projection is specified separately.
export const URL_CASES = [
  ['https://fixture.invalid/a', 'https://fixture.invalid/a', 'fixture.invalid'],
  ['https://fixture.invalid/A', 'https://fixture.invalid/A', 'fixture.invalid'],
  [
    'https://fixture.invalid/a/',
    'https://fixture.invalid/a/',
    'fixture.invalid',
  ],
  [
    'https://fixture.invalid/a?x=1&y=2',
    'https://fixture.invalid/a?x=1&y=2',
    'fixture.invalid',
  ],
  [
    'https://fixture.invalid/a?y=2&x=1',
    'https://fixture.invalid/a?y=2&x=1',
    'fixture.invalid',
  ],
  [
    'https://fixture.invalid/a#one',
    'https://fixture.invalid/a#one',
    'fixture.invalid',
  ],
  [
    'https://fixture.invalid/a#two',
    'https://fixture.invalid/a#two',
    'fixture.invalid',
  ],
  ['https://other.invalid/b', 'https://other.invalid/b', 'other.invalid'],
  ['https://FIXTURE.invalid/a', 'https://FIXTURE.invalid/a', 'fixture.invalid'],
  [
    'https://fixture.invalid:443/a',
    'https://fixture.invalid:443/a',
    'fixture.invalid',
  ],
  [
    '  https://fixture.invalid/a  ',
    '  https://fixture.invalid/a  ',
    'fixture.invalid',
  ],
  ['http://fixture.invalid/a', 'http://fixture.invalid/a', 'fixture.invalid'],
  [
    'https://bücher.invalid/a',
    'https://bücher.invalid/a',
    'xn--bcher-kva.invalid',
  ],
  [
    'https://xn--bcher-kva.invalid/a',
    'https://xn--bcher-kva.invalid/a',
    'xn--bcher-kva.invalid',
  ],
  [
    'https://fixture.invalid/%61',
    'https://fixture.invalid/%61',
    'fixture.invalid',
  ],
] as const

export type ModelUrl = {
  id: string
  title: string
  first: number
  last: number
  customAdded: number
  project: string
  category: string | null
}
export type ModelState = {
  urls: Map<number, ModelUrl>
  hasUncategorized: boolean
}
export type PersistenceModel = {
  state: ModelState
  undo: ModelState | null
  backup: ModelState | null
}
export const createModel = (): PersistenceModel => ({
  state: { urls: new Map(), hasUncategorized: false },
  undo: null,
  backup: null,
})
export const copyModelState = (state: ModelState): ModelState =>
  structuredClone(state)
export function invariant(condition: boolean, code: string): asserts condition {
  if (!condition) {
    throw new Error(code)
  }
}
const same = (actual: unknown, expected: unknown, code: string): void => {
  invariant(JSON.stringify(actual) === JSON.stringify(expected), code)
}

export const assertPersistenceModel = (
  snapshot: PersistenceV2Snapshot,
  state?: ModelState,
): void => {
  const report = checkPersistenceIntegrity(snapshot)
  // Never include diagnostics' record ids, URL values or titles in exceptions.
  invariant(
    report.issues.length === 0,
    report.issues.map(({ code }) => code).join(','),
  )
  for (const rows of [
    snapshot.urls,
    snapshot.collections,
    snapshot.categories,
    snapshot.groups,
  ]) {
    invariant(
      new Set(rows.map(({ id }) => id)).size === rows.length,
      'DUPLICATE_ENTITY_ID',
    )
  }
  if (!state) {
    return
  }
  const expectedUrls = [...state.urls.entries()]
    .map(([slot, record]) => ({
      url: URL_CASES[slot]?.[0],
      id: record.id,
      title: record.title,
      first: record.first,
      last: record.last,
    }))
    .toSorted((a, b) => String(a.url).localeCompare(String(b.url)))
  same(
    snapshot.urls
      .map((row) => ({
        url: row.url,
        id: row.id,
        title: row.title,
        first: row.firstSavedAt,
        last: row.lastSavedAt,
      }))
      .toSorted((a, b) => a.url.localeCompare(b.url)),
    expectedUrls,
    'MODEL_URLS',
  )
  invariant(
    snapshot.urls.every((row) => row.url === row.normalizedUrl),
    'MODEL_URL_IDENTITY',
  )
  const collectionKey = (id: string): string => {
    const collection = snapshot.collections.find((row) => row.id === id)
    invariant(collection !== undefined, 'MODEL_COLLECTION_REFERENCE')
    return collection.definition.type === 'domain'
      ? `domain:${collection.definition.domain}`
      : id
  }
  const expectedMemberships = [...state.urls.entries()]
    .flatMap(([slot, record]) => [
      [record.id, `domain:${String(URL_CASES[slot]?.[2])}`, null, record.first],
      [record.id, record.project, record.category, record.customAdded],
    ])
    .map((row) => JSON.stringify(row))
    .toSorted()
  same(
    snapshot.memberships
      .map((row) =>
        JSON.stringify([
          row.urlId,
          collectionKey(row.collectionId),
          row.categoryId ?? null,
          row.addedAt,
        ]),
      )
      .toSorted(),
    expectedMemberships,
    'MODEL_MEMBERSHIPS',
  )
  const domains = new Set(
    [...state.urls.keys()].map(
      (slot) => `domain:${String(URL_CASES[slot]?.[2])}`,
    ),
  )
  same(
    snapshot.collections.map(({ id }) => collectionKey(id)).toSorted(),
    [
      'p0',
      'p1',
      ...domains,
      ...(state.hasUncategorized ? ['custom-uncategorized'] : []),
    ].toSorted(),
    'MODEL_COLLECTIONS',
  )
  same(
    snapshot.categories
      .map(({ id, collectionId, name }) => [id, collectionId, name])
      .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ['c0', 'p0', 'category'],
      ['c1', 'p1', 'category'],
    ],
    'MODEL_CATEGORIES',
  )
  same(
    snapshot.groups
      .map(({ id, name }) => [id, name])
      .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ['g0', 'Group 0'],
      ['g1', 'Group 1'],
    ],
    'MODEL_GROUPS',
  )
}

const orderedSnapshot = (snapshot: PersistenceV2Snapshot) => ({
  urls: snapshot.urls.toSorted((a, b) => a.id.localeCompare(b.id)),
  collections: snapshot.collections.toSorted((a, b) =>
    a.id.localeCompare(b.id),
  ),
  categories: snapshot.categories.toSorted((a, b) => a.id.localeCompare(b.id)),
  groups: snapshot.groups.toSorted((a, b) => a.id.localeCompare(b.id)),
  memberships: snapshot.memberships.toSorted(
    (a, b) =>
      a.collectionId.localeCompare(b.collectionId) ||
      a.urlId.localeCompare(b.urlId),
  ),
})

const canonicalJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalJson)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    )
  }
  return value
}

export const assertSavedTabsRoundTrip = (
  before: PersistenceV2Snapshot,
  after: PersistenceV2Snapshot,
): void => {
  invariant(
    JSON.stringify(canonicalJson(orderedSnapshot(before))) ===
      JSON.stringify(canonicalJson(orderedSnapshot(after))),
    'LOGICAL_METADATA_MISMATCH',
  )
}
