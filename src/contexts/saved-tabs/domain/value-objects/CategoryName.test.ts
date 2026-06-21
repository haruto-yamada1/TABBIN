import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import {
  categoryNameToString,
  createCategoryName,
  equalsCategoryName,
} from './CategoryName'

describe('CategoryName 値オブジェクト', () => {
  it('前後の空白は trim する', () => {
    const name = createCategoryName('  Docs  ')
    expect(categoryNameToString(name)).toBe('Docs')
  })

  it('空文字列は INVALID_CATEGORY_NAME で拒否する', () => {
    expect(() => createCategoryName('')).toThrow(SavedTabsDomainError)
  })

  it('200 文字超は拒否する', () => {
    expect(() => createCategoryName('a'.repeat(201))).toThrow(
      SavedTabsDomainError,
    )
  })

  it('200 文字までは許容する', () => {
    const name = createCategoryName('a'.repeat(200))
    expect(categoryNameToString(name)).toHaveLength(200)
  })

  it('大小文字差は別物として扱う', () => {
    expect(
      equalsCategoryName(
        createCategoryName('Docs'),
        createCategoryName('docs'),
      ),
    ).toBe(false)
  })
})
