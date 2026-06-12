import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '../errors/SavedTabsDomainError'
import { createUrlRecordId } from '../value-objects/UrlRecordId'
import {
  createCustomProject,
  customProjectContainsUrlRecord,
  customProjectUrlCount,
  isSameCustomProject,
} from './CustomProject'

const baseInput = {
  id: 'project-1',
  name: 'Q4 Research',
  urlIds: ['url-1', 'url-2'],
  categories: ['Research', 'Notes'],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
}

describe('CustomProject entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const project = createCustomProject(baseInput)
    expect(project.id).toBe('project-1')
    expect(project.name).toBe('Q4 Research')
    expect(project.urlIds).toStrictEqual(['url-1', 'url-2'])
    expect(project.categories).toStrictEqual(['Research', 'Notes'])
    expect(project.createdAt).toBe(1_700_000_000_000)
    expect(project.updatedAt).toBe(1_700_000_000_001)
  })

  it('urlIds に重複があると INVALID_CUSTOM_PROJECT を投げる', () => {
    expect(() =>
      createCustomProject({ ...baseInput, urlIds: ['dup', 'dup'] }),
    ).toThrow(SavedTabsDomainError)
  })

  it('categories に重複があると INVALID_CUSTOM_PROJECT を投げる', () => {
    expect(() =>
      createCustomProject({ ...baseInput, categories: ['x', 'x'] }),
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
