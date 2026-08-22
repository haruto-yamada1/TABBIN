import { describe, expect, it } from 'vitest'

import type { PersistenceV2CollectionMembership } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import {
  assignTabGroupToCollectionGroup,
  createTabGroup as createNormalizedTabGroup,
  isSameTabGroup,
  tabGroupContainsUrlRecord,
  tabGroupUrlCount,
} from './TabGroup'

const baseInput = {
  id: 'group-1',
  domain: 'example.com',
  memberships: ['url-1', 'url-2'].map((urlId) => ({ urlId })),
}

describe('TabGroup entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const group = createTabGroup(baseInput)
    expect(group.id).toBe('group-1')
    expect(group.collection.definition.domain).toBe('example.com')
    expect(group.memberships.map(({ urlId }) => urlId)).toStrictEqual([
      'url-1',
      'url-2',
    ])
    expect(group.collection.groupId).toBeUndefined()
    expect(group.savedAt).toBe(0)
  })

  it('parentCategoryId / savedAt を保持できる', () => {
    const group = createTabGroup({
      ...baseInput,
      parentCategoryId: 'docs',
      savedAt: 1_700_000_000_000,
    })
    expect(group.collection.groupId).toBe('docs')
    expect(group.savedAt).toBe(1_700_000_000_000)
  })

  it('normalized collection の undefined groupId を省略する', () => {
    const seed = createTabGroup(baseInput)
    const collection = { ...seed.collection }
    Reflect.set(collection, 'groupId', undefined)

    const group = createNormalizedTabGroup({
      collection,
      collectionCategories: seed.collectionCategories,
      memberships: seed.memberships,
    })

    expect(Object.hasOwn(group.collection, 'groupId')).toBe(false)
  })

  it('normalized membership の undefined optional property を省略する', () => {
    const seed = createTabGroup({
      ...baseInput,
      memberships: [{ urlId: 'url-1' }],
    })
    const membership = { ...seed.memberships[0] }
    Reflect.set(membership, 'addedAtProvenance', undefined)
    Reflect.set(membership, 'categoryId', undefined)
    Reflect.set(membership, 'notes', undefined)

    const group = createNormalizedTabGroup({
      collection: seed.collection,
      collectionCategories: seed.collectionCategories,
      memberships: [membership],
    })

    expect(
      ['addedAtProvenance', 'categoryId', 'notes'].map((property) =>
        Object.hasOwn(group.memberships[0], property),
      ),
    ).toStrictEqual([false, false, false])
  })

  it('normalized membership の定義済み optional property と必須項目を保持する', () => {
    const seed = createTabGroup({
      ...baseInput,
      memberships: [{ urlId: 'url-1' }],
      subCategories: ['Research'],
    })
    const category = seed.collectionCategories[0]
    const seedMembership = seed.memberships[0]
    if (!category || !seedMembership) {
      throw new Error('expected normalized membership fixtures')
    }
    const membership: PersistenceV2CollectionMembership = {
      ...seedMembership,
      addedAtProvenance: 'exact',
      categoryId: category.id,
      notes: '',
    }

    const group = createNormalizedTabGroup({
      collection: seed.collection,
      collectionCategories: seed.collectionCategories,
      memberships: [membership],
    })

    expect(group.memberships[0]).toStrictEqual(membership)
  })

  it('親カテゴリの割り当て解除では groupId property を省略する', () => {
    const group = createTabGroup({ ...baseInput, parentCategoryId: 'docs' })

    const unassigned = assignTabGroupToCollectionGroup(group, undefined)

    expect(Object.hasOwn(unassigned.collection, 'groupId')).toBe(false)
  })

  it('membership の URL ID に重複があると INVALID_TAB_GROUP を投げる', () => {
    expect(() =>
      createTabGroup({
        ...baseInput,
        memberships: ['dup', 'dup'].map((urlId) => ({ urlId })),
      }),
    ).toThrow(SavedTabsDomainError)
  })

  it('membership の URL ID に空文字列が混ざると INVALID_ID を投げる', () => {
    expect(() =>
      createTabGroup({
        ...baseInput,
        memberships: ['ok', ''].map((urlId) => ({ urlId })),
      }),
    ).toThrow(SavedTabsDomainError)
  })

  it('tabGroupUrlCount は URL 件数を返す', () => {
    const group = createTabGroup(baseInput)
    expect(tabGroupUrlCount(group)).toBe(2)
  })

  it('tabGroupContainsUrlRecord は所属判定を行う', () => {
    const group = createTabGroup(baseInput)
    expect(tabGroupContainsUrlRecord(group, createUrlRecordId('url-1'))).toBe(
      true,
    )
    expect(tabGroupContainsUrlRecord(group, createUrlRecordId('url-3'))).toBe(
      false,
    )
  })

  it('isSameTabGroup は ID で同一視する', () => {
    const a = createTabGroup(baseInput)
    const b = createTabGroup({ ...baseInput, domain: 'other.com' })
    expect(isSameTabGroup(a, b)).toBe(true)
  })
})
