import { describe, expect, it } from 'vitest'

import type { PersistenceV2CollectionMembership } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import { createCustomProject } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import {
  createCustomProject as createNormalizedCustomProject,
  customProjectContainsUrlRecord,
  customProjectUrlCount,
  isSameCustomProject,
} from './CustomProject'

const baseInput = {
  id: 'project-1',
  name: 'Q4 Research',
  memberships: ['url-1', 'url-2'].map((urlId) => ({ urlId })),
  categories: ['Research', 'Notes'],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
}

describe('CustomProject entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const project = createCustomProject(baseInput)
    expect(project.id).toBe('project-1')
    expect(project.name).toBe('Q4 Research')
    expect(project.memberships.map(({ urlId }) => urlId)).toStrictEqual([
      'url-1',
      'url-2',
    ])
    expect(project.collectionCategories.map(({ name }) => name)).toStrictEqual([
      'Research',
      'Notes',
    ])
    expect(project.createdAt).toBe(1_700_000_000_000)
    expect(project.updatedAt).toBe(1_700_000_000_001)
  })

  it('normalized collection の undefined groupId を省略する', () => {
    const seed = createCustomProject(baseInput)
    const collection = { ...seed.collection }
    Reflect.set(collection, 'groupId', undefined)

    const project = createNormalizedCustomProject({
      collection,
      collectionCategories: seed.collectionCategories,
      memberships: seed.memberships,
    })

    expect(Object.hasOwn(project.collection, 'groupId')).toBe(false)
  })

  it('normalized membership の undefined optional property を省略する', () => {
    const seed = createCustomProject({
      ...baseInput,
      memberships: [{ urlId: 'url-1' }],
    })
    const membership = { ...seed.memberships[0] }
    Reflect.set(membership, 'addedAtProvenance', undefined)
    Reflect.set(membership, 'categoryId', undefined)
    Reflect.set(membership, 'notes', undefined)

    const project = createNormalizedCustomProject({
      collection: seed.collection,
      collectionCategories: seed.collectionCategories,
      memberships: [membership],
    })

    expect(
      ['addedAtProvenance', 'categoryId', 'notes'].map((property) =>
        Object.hasOwn(project.memberships[0], property),
      ),
    ).toStrictEqual([false, false, false])
  })

  it('normalized membership の定義済み optional property と必須項目を保持する', () => {
    const seed = createCustomProject({
      ...baseInput,
      categories: ['Research'],
      memberships: [{ urlId: 'url-1' }],
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

    const project = createNormalizedCustomProject({
      collection: seed.collection,
      collectionCategories: seed.collectionCategories,
      memberships: [membership],
    })

    expect(project.memberships[0]).toStrictEqual(membership)
  })

  it('membership の URL ID に重複があると INVALID_CUSTOM_PROJECT を投げる', () => {
    expect(() =>
      createCustomProject({
        ...baseInput,
        memberships: ['dup', 'dup'].map((urlId) => ({ urlId })),
      }),
    ).toThrow(SavedTabsDomainError)
  })

  it('collection category ID に重複があると INVALID_CUSTOM_PROJECT を投げる', () => {
    const project = createCustomProject(baseInput)
    const category = project.collectionCategories[0]
    if (!category) {
      throw new Error('expected category fixture')
    }
    expect(() =>
      createNormalizedCustomProject({
        collection: project.collection,
        collectionCategories: [category, category],
        memberships: project.memberships,
      }),
    ).toThrow(SavedTabsDomainError)
  })

  it('createdAt が不正なら INVALID_SAVED_AT を投げる', () => {
    expect(() => createCustomProject({ ...baseInput, createdAt: -1 })).toThrow(
      SavedTabsDomainError,
    )
  })

  it('customProjectUrlCount は URL 件数を返す', () => {
    const project = createCustomProject(baseInput)
    expect(customProjectUrlCount(project)).toBe(2)
  })

  it('customProjectContainsUrlRecord は所属判定を行う', () => {
    const project = createCustomProject(baseInput)
    expect(
      customProjectContainsUrlRecord(project, createUrlRecordId('url-1')),
    ).toBe(true)
    expect(
      customProjectContainsUrlRecord(project, createUrlRecordId('url-3')),
    ).toBe(false)
  })

  it('isSameCustomProject は ID で同一視する', () => {
    const a = createCustomProject(baseInput)
    const b = createCustomProject({ ...baseInput, name: 'Renamed' })
    expect(isSameCustomProject(a, b)).toBe(true)
  })
})
