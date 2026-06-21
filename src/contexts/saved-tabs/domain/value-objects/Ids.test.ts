import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import {
  createCustomProjectId,
  customProjectIdToString,
  equalsCustomProjectId,
} from './CustomProjectId'
import {
  createParentCategoryId,
  equalsParentCategoryId,
  parentCategoryIdToString,
} from './ParentCategoryId'
import {
  createTabGroupId,
  equalsTabGroupId,
  tabGroupIdToString,
} from './TabGroupId'
import {
  createUrlRecordId,
  equalsUrlRecordId,
  urlRecordIdToString,
} from './UrlRecordId'

describe('ID 値オブジェクト群', () => {
  it('TabGroupId は正常値を保持し、空白は拒否する', () => {
    const id = createTabGroupId('group-1')
    expect(tabGroupIdToString(id)).toBe('group-1')
    expect(equalsTabGroupId(id, createTabGroupId('group-1'))).toBe(true)
    expect(() => createTabGroupId('')).toThrow(SavedTabsDomainError)
    expect(() => createTabGroupId('   ')).toThrow(SavedTabsDomainError)
  })

  it('UrlRecordId は正常値を保持し、空白は拒否する', () => {
    const id = createUrlRecordId('url-1')
    expect(urlRecordIdToString(id)).toBe('url-1')
    expect(equalsUrlRecordId(id, createUrlRecordId('url-1'))).toBe(true)
    expect(() => createUrlRecordId('')).toThrow(SavedTabsDomainError)
  })

  it('ParentCategoryId は正常値を保持し、空白は拒否する', () => {
    const id = createParentCategoryId('docs')
    expect(parentCategoryIdToString(id)).toBe('docs')
    expect(equalsParentCategoryId(id, createParentCategoryId('docs'))).toBe(
      true,
    )
    expect(() => createParentCategoryId('')).toThrow(SavedTabsDomainError)
  })

  it('CustomProjectId は正常値を保持し、空白は拒否する', () => {
    const id = createCustomProjectId('project-1')
    expect(customProjectIdToString(id)).toBe('project-1')
    expect(equalsCustomProjectId(id, createCustomProjectId('project-1'))).toBe(
      true,
    )
    expect(() => createCustomProjectId('')).toThrow(SavedTabsDomainError)
  })
})
