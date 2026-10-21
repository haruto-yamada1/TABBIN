import { describe, expect, it } from 'vitest'

import { createSavedTabsTabGroupDtoFromProjection } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'

import {
  toSavedTabsTabGroupViewModel,
  toTabGroupFromViewModel,
} from './SavedTabsCompatibilityViewModelMapper'

const createGroup = (position?: number) => {
  const collection = {
    createdAt: 1,
    definition: { domain: 'example.com', type: 'domain' as const },
    id: 'domain-example',
    name: 'example.com',
    sortOrder: 100,
    updatedAt: 1,
    ...(position !== undefined
      ? { uncategorizedCategoryPosition: position }
      : {}),
  }
  return createSavedTabsTabGroupDtoFromProjection({
    collection,
    collectionCategories: ['Alpha', 'Beta'].map((name, sortOrder) => ({
      collectionId: collection.id,
      createdAt: 1,
      id: `${collection.id}:category:${sortOrder}`,
      keywords: [],
      name,
      sortOrder,
      updatedAt: 1,
    })),
    memberships: [],
  })
}

describe('child category order projection', () => {
  it('preserves regular child category ranks', () => {
    const view = toSavedTabsTabGroupViewModel(createGroup())
    const saved = toTabGroupFromViewModel({
      ...view,
      subCategoryOrder: ['Beta', 'Alpha'],
      subCategoryOrderWithUncategorized: ['Beta', 'Alpha', '__uncategorized'],
    })
    expect(saved.collectionCategories.map(({ name }) => name)).toEqual([
      'Beta',
      'Alpha',
    ])
  })

  it.each([0, 1, 2])(
    'roundtrips Uncategorized position %s without creating a category row',
    (position) => {
      const group = createGroup(position)
      const view = toSavedTabsTabGroupViewModel(group)
      const expected = ['Alpha', 'Beta']
      expected.splice(position, 0, '__uncategorized')
      expect(view.subCategoryOrderWithUncategorized).toEqual(expected)
      const restored = toTabGroupFromViewModel(view)
      expect(restored.collection).toMatchObject({
        uncategorizedCategoryPosition: position,
      })
      expect(restored.collectionCategories.map(({ name }) => name)).toEqual([
        'Alpha',
        'Beta',
      ])
    },
  )

  it('captures a manually moved Uncategorized bucket from the full UI order', () => {
    const view = toSavedTabsTabGroupViewModel(createGroup())
    const saved = toTabGroupFromViewModel({
      ...view,
      subCategoryOrderWithUncategorized: ['__uncategorized', 'Alpha', 'Beta'],
    })
    expect(saved.collection).toMatchObject({ uncategorizedCategoryPosition: 0 })
  })

  it('accepts field-absent data and appends a preferred position beyond current rows', () => {
    expect(
      toSavedTabsTabGroupViewModel(createGroup())
        .subCategoryOrderWithUncategorized,
    ).toEqual(['Alpha', 'Beta'])
    expect(
      toSavedTabsTabGroupViewModel(createGroup(8))
        .subCategoryOrderWithUncategorized,
    ).toEqual(['Alpha', 'Beta', '__uncategorized'])
  })
})
