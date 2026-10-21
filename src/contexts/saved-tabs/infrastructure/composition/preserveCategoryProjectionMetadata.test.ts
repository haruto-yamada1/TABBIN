import { assert, describe, expect, it, vi } from 'vitest'

import { createSavedTabsTabGroupDtoFromProjection } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

import { preserveCategoryProjectionMetadata } from './preserveCategoryProjectionMetadata'

const makeState = () => ({
  collections: [
    {
      id: 'domain',
      definition: { type: 'domain' as const, domain: 'example.com' },
      name: 'example.com',
      createdAt: 10,
      updatedAt: 20,
      sortOrder: 100,
      uncategorizedCategoryPosition: 0,
    },
  ],
  categories: [
    {
      id: 'domain:category:0',
      collectionId: 'domain',
      name: 'Alpha',
      keywords: [],
      createdAt: 10,
      updatedAt: 20,
      sortOrder: 0,
    },
    {
      id: 'domain:category:1',
      collectionId: 'domain',
      name: 'Beta',
      keywords: [],
      createdAt: 11,
      updatedAt: 21,
      sortOrder: 1,
    },
  ],
  memberships: [
    {
      collectionId: 'domain',
      urlId: 'url',
      categoryId: 'domain:category:1',
      notes: 'old notes',
      addedAt: 12,
      addedAtProvenance: 'exact' as const,
      updatedAt: 22,
      sortOrder: 1024,
    },
  ],
  groups: [],
  urls: [],
})

const makeInput = (state: ReturnType<typeof makeState>) => {
  const [collection] = state.collections
  const [alpha, beta] = state.categories
  assert.isDefined(collection)
  assert.isDefined(alpha)
  assert.isDefined(beta)
  return createSavedTabsTabGroupDtoFromProjection({
    collection: { ...collection, uncategorizedCategoryPosition: 2 },
    collectionCategories: [
      { ...alpha, name: 'Beta', sortOrder: 0 },
      { ...beta, name: 'Gamma', sortOrder: 1 },
    ],
    memberships: [
      {
        collectionId: 'domain',
        urlId: 'url',
        categoryId: 'domain:category:1',
        addedAt: 10,
        updatedAt: 10,
        sortOrder: 0,
      },
    ],
  })
}

describe('category projection metadata', () => {
  it.each([undefined, null])(
    'does not normalize an explicitly invalid position %s from a compact input',
    (position) => {
      const state = makeState()
      const input = makeInput(state)
      Reflect.set(input.collection, 'uncategorizedCategoryPosition', position)
      const [saved] = preserveCategoryProjectionMetadata(state, [input], {
        clock: { now: () => 30 },
        idGenerator: { generate: () => 'new-category-id' },
      })
      expect(
        Object.hasOwn(saved?.collection ?? {}, 'uncategorizedCategoryPosition'),
      ).toBe(true)
      expect(saved?.collection.uncategorizedCategoryPosition).toBe(position)
      const report = checkPersistenceIntegrity({
        ...state,
        collections: saved ? [saved.collection] : [],
      })
      expect(report.issues.map(({ code }) => code)).toContain(
        position === null ? 'INVALID_COLLECTION_ORDER' : 'NON_JSON_SAFE_VALUE',
      )
    },
  )

  it('allocates a new ID when a new category projection collides with a preserved category', () => {
    const state = makeState()
    const generate = vi.fn(() => 'new-category-id')
    const [saved] = preserveCategoryProjectionMetadata(
      state,
      [makeInput(state)],
      { clock: { now: () => 30 }, idGenerator: { generate } },
    )
    expect(
      saved?.collectionCategories.map(({ id, name }) => ({ id, name })),
    ).toEqual([
      { id: 'domain:category:1', name: 'Beta' },
      { id: 'new-category-id', name: 'Gamma' },
    ])
    expect(saved?.memberships[0]).toEqual({
      collectionId: 'domain',
      urlId: 'url',
      categoryId: 'new-category-id',
      addedAt: 12,
      addedAtProvenance: 'exact',
      updatedAt: 22,
      sortOrder: 1024,
    })
    expect(saved?.collection.uncategorizedCategoryPosition).toBe(2)
    expect(generate).toHaveBeenCalledOnce()
    expect(state.categories[0]?.name).toBe('Alpha')
  })

  it('rejects a colliding ID generator without changing canonical state', () => {
    const state = makeState()
    const before = structuredClone(state)
    expect(() =>
      preserveCategoryProjectionMetadata(state, [makeInput(state)], {
        clock: { now: () => 30 },
        idGenerator: { generate: () => 'domain:category:1' },
      }),
    ).toThrow('unique category ID')
    expect(state).toEqual(before)
  })

  it('honors an intentional membership category and notes clear', () => {
    const state = makeState()
    const [collection] = state.collections
    assert.isDefined(collection)
    const input = createSavedTabsTabGroupDtoFromProjection({
      collection,
      collectionCategories: state.categories,
      memberships: [
        {
          collectionId: 'domain',
          urlId: 'url',
          addedAt: 10,
          updatedAt: 10,
          sortOrder: 0,
        },
      ],
    })
    const [saved] = preserveCategoryProjectionMetadata(state, [input], {
      clock: { now: () => 30 },
      idGenerator: { generate: () => 'unused' },
    })
    expect(saved?.memberships[0]).toEqual({
      collectionId: 'domain',
      urlId: 'url',
      addedAt: 12,
      addedAtProvenance: 'exact',
      updatedAt: 22,
      sortOrder: 1024,
    })
  })
})
