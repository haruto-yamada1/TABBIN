import { describe, expect, it } from 'vitest'

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
