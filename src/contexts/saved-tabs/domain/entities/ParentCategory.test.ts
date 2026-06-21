import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

import {
  createParentCategory,
  isSameParentCategory,
  parentCategoryContainsDomainName,
  parentCategoryContainsTabGroup,
} from './ParentCategory'

const baseInput = {
  id: 'docs',
  name: 'Docs',
  domains: ['group-1'],
  domainNames: ['example.com'],
}

describe('ParentCategory entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const category = createParentCategory(baseInput)
    expect(category.id).toBe('docs')
    expect(category.name).toBe('Docs')
    expect(category.domains).toStrictEqual(['group-1'])
    expect(category.domainNames).toStrictEqual(['example.com'])
  })

  it('空配列の domains / domainNames を許容する', () => {
    const category = createParentCategory({
      ...baseInput,
      domains: [],
      domainNames: [],
    })
    expect(category.domains).toStrictEqual([])
    expect(category.domainNames).toStrictEqual([])
  })

  it('不正な category name は INVALID_CATEGORY_NAME を投げる', () => {
    expect(() => createParentCategory({ ...baseInput, name: '' })).toThrow(
      SavedTabsDomainError,
    )
  })

  it('parentCategoryContainsTabGroup は ID 一致で true', () => {
    const category = createParentCategory(baseInput)
    expect(
      parentCategoryContainsTabGroup(category, createTabGroupId('group-1')),
    ).toBe(true)
    expect(
      parentCategoryContainsTabGroup(category, createTabGroupId('group-2')),
    ).toBe(false)
  })

  it('parentCategoryContainsDomainName は ドメイン名一致で true', () => {
    const category = createParentCategory(baseInput)
    expect(
      parentCategoryContainsDomainName(
        category,
        createDomainName('example.com'),
      ),
    ).toBe(true)
    expect(
      parentCategoryContainsDomainName(category, createDomainName('other.com')),
    ).toBe(false)
  })

  it('isSameParentCategory は ID で同一視する', () => {
    const a = createParentCategory(baseInput)
    const b = createParentCategory({ ...baseInput, name: 'Renamed' })
    expect(isSameParentCategory(a, b)).toBe(true)
  })
})
